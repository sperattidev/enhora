#!/usr/bin/env bash
# One-time preparation of an Ubuntu 22.04/24.04 VPS for EnHora. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/sperattidev/enhora/develop/infra/scripts/bootstrap-vps.sh -o bootstrap.sh
#   less bootstrap.sh            # read it before running it
#   sudo bash bootstrap.sh "ssh-ed25519 AAAA... github-actions-deploy"
#
# The argument is the PUBLIC key GitHub Actions will use to deploy. Safe to run again.
set -euo pipefail

DEPLOY_KEY="${1:-}"
APP_DIR=/opt/enhora
DEPLOY_USER=deploy

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
if [[ -z "$DEPLOY_KEY" || "$DEPLOY_KEY" != ssh-* ]]; then
  echo "Usage: sudo bash bootstrap.sh \"<deploy public key>\"" >&2; exit 1
fi

echo "==> System updates and automatic security patches"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker Engine (official repository)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Rotate container logs so they never fill the disk.
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" }, "live-restore": true }
JSON
systemctl enable --now docker
systemctl restart docker

echo "==> Deploy user '$DEPLOY_USER' (SSH key only, can run Docker)"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /home/$DEPLOY_USER/.ssh
touch /home/$DEPLOY_USER/.ssh/authorized_keys
grep -qxF "$DEPLOY_KEY" /home/$DEPLOY_USER/.ssh/authorized_keys || echo "$DEPLOY_KEY" >> /home/$DEPLOY_USER/.ssh/authorized_keys
chown "$DEPLOY_USER:$DEPLOY_USER" /home/$DEPLOY_USER/.ssh/authorized_keys
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys

echo "==> Firewall: only SSH in. Web traffic arrives through the Cloudflare tunnel (outbound)."
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable
systemctl enable --now fail2ban

echo "==> App directory $APP_DIR and secrets"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/backups"
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" <<ENV
APP_HOST=app.enhora.net.ar
RIDER_HOST=cadete.enhora.net.ar
API_HOST=api.enhora.net.ar
APEX_HOST=enhora.net.ar
API_IMAGE=ghcr.io/sperattidev/enhora-api
WEB_IMAGE=ghcr.io/sperattidev/enhora-web
IMAGE_TAG=latest
LOG_LEVEL=info
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
TUNNEL_TOKEN=
ENV
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "    Created $APP_DIR/.env with fresh secrets."
else
  echo "    $APP_DIR/.env already exists; left untouched."
fi

cat <<DONE

Listo. Falta:
  1. Pegar el token del túnel de Cloudflare en $APP_DIR/.env (TUNNEL_TOKEN=...).
  2. Cargar los secretos en GitHub (ver docs/DESPLIEGUE.md) y mergear develop → main.
DONE
