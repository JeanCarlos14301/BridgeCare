import argparse
import json
import urllib.error
import urllib.request


def request_json(url: str, *, method: str = "GET", body: dict[str, str] | None = None) -> dict:
    encoded = json.dumps(body).encode() if body else None
    request = urllib.request.Request(
        url,
        data=encoded,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test a running local stack")
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    try:
        health = request_json(f"{args.base_url}/health")
        ready = request_json(f"{args.base_url}/ready")
        example = request_json(
            f"{args.base_url}/example", method="POST", body={"text": "generic smoke test"}
        )
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"Smoke test failed: {type(exc).__name__}")
        return 1
    print(f"health={health.get('status')} ready={ready.get('status')}")
    print(f"provider_mode={example.get('provider_mode')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

