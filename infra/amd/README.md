# AMD inference runbook

No AMD execution is claimed until it has been run and recorded.

## Primary path: AMD Token Factory (shared endpoints)

For ACT III the organizers provide a team API key from `notebooks.amd.com/tokenfactory`. Token Factory serves OpenAI-compatible chat completions on AMD GPUs (AMD Radeon Cloud). No VM is needed.

1. **Every team member** signs in at `notebooks.amd.com/tokenfactory` with their AMD AI Developer Program account and clicks "Redeem API Key". The key is only revealed after all members have redeemed.
2. Put the key **only** in the server's `.env` (never in Git, chat, screenshots, or the browser):

   ```env
   LLM_PROVIDER=openai_compatible
   LLM_BASE_URL=https://developer.amd.com.cn/radeon/api
   LLM_API_KEY=<team key, format rc-...>
   LLM_MODEL=<an id returned by GET /v1/models>
   LLM_REASONING_EFFORT=
   ```

   `LLM_BASE_URL` has no `/v1`; the adapter appends `/v1/models` and `/v1/chat/completions`.
3. Run the explicit smoke test (section "Verification"), then `GET /ready`. Ready is false if the configured model is not in the live catalog.

Facts from the Token Factory guide that the code depends on:

- Every chat model accepts `response_format: {"type": "json_object"}`; we send it on every extraction.
- Reasoning models spend thinking tokens from `max_tokens` and can return empty content with `finish_reason: length`, which BridgeCare reports as `truncated_output`. Use a non-thinking model, or set `LLM_REASONING_EFFORT` to `none` or `low`, and raise `LLM_MAX_OUTPUT_TOKENS` if needed. Valid values differ per model (for example GLM rejects `xhigh`; Qwen3.8-27B rejects `high`).
- A single system message at index 0 is accepted by every model; the extraction request uses exactly that shape.
- Limits are **per team key**: about 30 requests per minute, 8 concurrent, plus a daily spend cap (`GET /v1/usage`). A 429 with a short `Retry-After` is retried once; a per-minute limit fails fast with a clear error. Coordinate experiments across the team.
- The catalog changes; pick models from `GET /v1/models` at the time of use.
- Terms: trial and development only, no SLA; prompts and outputs are retained for about 2 days; **do not send sensitive personal, health, or financial data**. BridgeCare sends only synthetic fixtures. Uploads stay disabled.
- Dedicated endpoints (paid with credits) and Evolus's "own vLLM endpoint on AMD Developer Cloud" requirement are separate; the shared endpoint does not satisfy the Evolus track.

Evidence for the submission: the model id returned in each revision (`revision.model`), the `X-Request-ID` and latency shown in the UI, and the `GET /v1/usage?include_recent=true` record of those requests. Never show the key.

## Alternative path: self-hosted vLLM on ROCm

Use only if a dedicated endpoint or Developer Cloud VM is required.

## Image and host prerequisites

Current [vLLM GPU installation documentation](https://docs.vllm.ai/en/stable/getting_started/installation/gpu/) names the official ROCm OpenAI-compatible image as `vllm/vllm-openai-rocm`. The exact production tag and immutable digest are **TODO: verify immediately before deployment**; do not deploy an unreviewed `latest` image.

The host must be a supported Linux/ROCm combination with a compatible AMD GPU, driver, sufficient VRAM/storage, Docker, and access to `/dev/kfd` and `/dev/dri`. Confirm visibility on the host with `rocminfo` and, where supported, `rocm-smi`. Record the actual device and driver output; an HTTP response does not prove GPU execution.

The documented container shape includes:

```bash
docker run --rm \
  --group-add=video \
  --cap-add=SYS_PTRACE \
  --security-opt seccomp=unconfined \
  --device /dev/kfd \
  --device /dev/dri \
  --ipc=host \
  vllm/vllm-openai-rocm:<VERIFIED_TAG_AND_DIGEST> \
  --model <REVIEWED_MODEL>
```

Do not substitute a CUDA image. Review model licensing and storage requirements before download.

## Network and access

Never expose the inference port openly. Prefer a private network plus authenticated TLS gateway; for a short controlled test, bind to loopback and use an SSH tunnel. Restrict inbound rules to the smallest known source range, rotate credentials after the event, and keep API keys in the backend only.

## Verification

Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` locally, then explicitly run:

```bash
uv run --project apps/api python scripts/smoke_amd.py
```

The script checks `/v1/models` and one short chat completion without printing the credential or response content. HTTP compatibility alone does not prove AMD hardware. Separately capture `rocminfo`/`rocm-smi` and container device evidence on the host.

## Budget and teardown

Set a budget and alerts before creation. A stopped VM may still incur charges for disks, IPs, snapshots, or reservations. When the experiment is complete, back up required evidence, stop inference, and intentionally destroy the resource group/project resources through the cloud console or reviewed IaC command. No destructive teardown command is included or run automatically.
