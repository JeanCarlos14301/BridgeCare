"""Verify a public BridgeCare deployment from outside the host.

Checks HTTPS, the HTTP redirect, security headers, session cookie flags, that internal
ports are closed, and that the API serves fixtures. Never prints cookie values or secrets.
"""

import argparse
import http.client
import json
import socket
import ssl
from dataclasses import dataclass
from urllib.parse import urlsplit

REQUIRED_HEADERS = (
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
)
INTERNAL_PORTS = (8000, 5173)


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    cookies: list[str]
    body: bytes


def request(
    scheme: str,
    host: str,
    path: str,
    *,
    method: str = "GET",
    cookie: str | None = None,
    insecure: bool = False,
) -> Response:
    headers = {"Cookie": cookie} if cookie else {}
    if scheme == "https":
        context = ssl.create_default_context()
        if insecure:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        connection: http.client.HTTPConnection = http.client.HTTPSConnection(
            host, timeout=15, context=context
        )
    else:
        connection = http.client.HTTPConnection(host, timeout=15)
    try:
        connection.request(method, path, headers=headers)
        raw = connection.getresponse()
        return Response(
            status=raw.status,
            headers={key.lower(): value for key, value in raw.getheaders()},
            cookies=raw.headers.get_all("Set-Cookie") or [],
            body=raw.read(),
        )
    finally:
        connection.close()


def port_closed(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=3):
            return False
    except OSError:
        return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Public URL, e.g. https://203-0-113-10.sslip.io")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Skip certificate verification (only for local tests with Caddy's local CA)",
    )
    args = parser.parse_args()
    host = urlsplit(args.url if "://" in args.url else f"https://{args.url}").hostname
    if not host:
        print("Could not read a hostname from the URL.")
        return 2

    results: list[tuple[bool, str]] = []

    def check(passed: bool, label: str) -> None:
        results.append((passed, label))
        print(f"[{'PASS' if passed else 'FAIL'}] {label}")

    try:
        home = request("https", host, "/", insecure=args.insecure)
        check(home.status == 200, f"HTTPS page responds 200 (got {home.status})")
        for header in REQUIRED_HEADERS:
            check(header in home.headers, f"Header {header} present")

        redirect = request("http", host, "/")
        location = redirect.headers.get("location", "")
        check(
            redirect.status in (301, 308) and location.startswith("https://"),
            f"HTTP redirects to HTTPS (got {redirect.status})",
        )

        health = request("https", host, "/api/health", insecure=args.insecure)
        mode = json.loads(health.body).get("provider_mode") if health.status == 200 else None
        check(health.status == 200, f"API health responds (provider_mode={mode})")
        if mode == "mock":
            print("[WARN] provider_mode is mock: do not present this deployment as AMD inference.")

        ready = request("https", host, "/api/ready", insecure=args.insecure)
        ready_body = json.loads(ready.body) if ready.body else {}
        check(
            ready.status == 200 and ready_body.get("status") == "ready",
            f"API ready ({ready_body.get('detail', ready.status)})",
        )

        session = request("https", host, "/api/session", method="POST", insecure=args.insecure)
        cookie_line = next((c for c in session.cookies if c.startswith("bridgecare_session=")), "")
        flags = cookie_line.lower()
        check(bool(cookie_line), "Session cookie issued")
        check("secure" in flags, "Cookie has Secure")
        check("httponly" in flags, "Cookie has HttpOnly")
        check("samesite=strict" in flags, "Cookie has SameSite=Strict")

        cookie = cookie_line.split(";", 1)[0] if cookie_line else None
        fixtures = request("https", host, "/api/fixtures", cookie=cookie, insecure=args.insecure)
        count = len(json.loads(fixtures.body)) if fixtures.status == 200 else 0
        check(fixtures.status == 200 and count > 0, f"Fixtures listed ({count})")
    except (OSError, ssl.SSLError, http.client.HTTPException, ValueError) as exc:
        check(False, f"Request failed: {type(exc).__name__}")

    for port in INTERNAL_PORTS:
        check(port_closed(host, port), f"Internal port {port} is not reachable")

    failed = sum(1 for passed, _ in results if not passed)
    print(f"\n{len(results) - failed}/{len(results)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
