# `infra/nginx/ssl/`

This directory exists so the Nginx container can bind-mount `/etc/nginx/ssl/` even when empty.

Actual TLS certificates are not stored in the repo. Let's Encrypt issues them on the host via the `certbot` container and they live in Docker volumes:

- `chatcenter_certbot_certs` → mounted to `/etc/letsencrypt`
- `chatcenter_certbot_webroot` → mounted to `/var/www/certbot`

To bootstrap certificates for a new domain, run `infra/scripts/init-ssl.sh` on the server.

Any file other than `.gitkeep` and `README.md` is gitignored — see the repo root `.gitignore`.
