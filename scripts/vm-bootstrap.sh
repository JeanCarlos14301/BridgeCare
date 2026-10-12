#!/usr/bin/env bash
# Prepare a fresh Ubuntu VM for the BridgeCare demo. Run once as root: sudo bash vm-bootstrap.sh
# Installs Docker Engine and the Compose plugin from Docker's apt repository, opens only
# SSH, HTTP and HTTPS in ufw, and adds swap on small machines. Safe to re-run.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/vm-bootstrap.sh" >&2
  exit 1
fi
# shellcheck source=/dev/null
. /etc/os-release
if [ "${ID}" != "ubuntu" ]; then
  echo "This script supports Ubuntu only (found ${ID})." >&2
  exit 1
fi

echo "== Docker Engine and Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker --version
docker compose version

if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
  usermod -aG docker "${SUDO_USER}"
  echo "Added ${SUDO_USER} to the docker group (log out and back in to apply)."
fi

echo "== Firewall: allow 22, 80, 443 only"
# Docker-published ports bypass ufw; compose.prod.yaml publishes only Caddy's 80 and 443.
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

echo "== Swap (only when RAM < 2 GB and no swap exists)"
total_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "${total_kb}" -lt 2000000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
  echo "Added 2 GB swap."
fi

echo "Done. Next: clone the repository and follow docs/deploy.md section 3."
