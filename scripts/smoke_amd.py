import json
import os
import urllib.error
import urllib.request


def call(url: str, api_key: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body else None,
        method="POST" if body else "GET",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> int:
    base_url = os.environ.get("LLM_BASE_URL", "").rstrip("/")
    api_key = os.environ.get("LLM_API_KEY", "")
    model = os.environ.get("LLM_MODEL", "")
    if not all((base_url, api_key, model)):
        print("Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL before running this explicit check.")
        return 2
    try:
        models = call(f"{base_url}/v1/models", api_key)
        if not isinstance(models.get("data"), list):
            raise TypeError("invalid models response")
        completion = call(
            f"{base_url}/v1/chat/completions",
            api_key,
            {
                "model": model,
                "messages": [{"role": "user", "content": "Reply with the word ready."}],
                "max_tokens": 8,
                "temperature": 0,
            },
        )
        if not completion.get("choices"):
            raise TypeError("invalid completion response")
    except (urllib.error.URLError, TimeoutError, TypeError, json.JSONDecodeError) as exc:
        print(f"AMD endpoint smoke test failed: {type(exc).__name__}")
        return 1
    print("Models and short generation checks passed; response content was not printed.")
    print("HTTP compatibility alone does not prove that the server used AMD hardware.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
