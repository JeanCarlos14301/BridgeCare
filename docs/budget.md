# Budget guardrails

- Local development and CI use the CPU mock and require no paid service.
- AMD GPU credits are requested but not approved.
- Set explicit cloud budgets and alerts before provisioning any GPU VM.
- A stopped/deallocated state must be confirmed with the provider; attached disks, reserved IPs, snapshots, and other resources may continue billing.
- Controlled resource destruction is the reliable way to stop future compute/resource charges, after required artifacts are backed up.
- Record real per-case token and infrastructure costs during Phase B; do not estimate them as measured results.

