# AMD ROCm vLLM runbook

This is a manual runbook, not an automated deployment. AMD credits and hardware access are currently unapproved, and no AMD execution is claimed.

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
