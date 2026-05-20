#!/bin/bash
set -e

DOMAIN="chat.moveisvalcenter.com.br"
EMAIL="${SSL_EMAIL:-admin@moveisvalcenter.com.br}"

echo "=== Chatcenter SSL Init ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# 1. Start nginx with HTTP-only config for certbot challenge
echo ">>> Creating temporary nginx config (HTTP only)..."
cat > /tmp/nginx-temp.conf << 'NGINX'
events { worker_connections 1024; }
http {
  server {
    listen 80;
    server_name chat.moveisvalcenter.com.br;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'Chatcenter SSL init in progress'; }
  }
}
NGINX

# 2. Start temp nginx
echo ">>> Starting temporary nginx..."
docker run -d --name chatcenter_nginx_temp \
  -p 80:80 \
  -v /tmp/nginx-temp.conf:/etc/nginx/nginx.conf:ro \
  -v chatcenter_certbot_webroot:/var/www/certbot \
  nginx:alpine

sleep 3

# 3. Request certificate
echo ">>> Requesting SSL certificate..."
docker run --rm \
  -v chatcenter_certbot_webroot:/var/www/certbot \
  -v chatcenter_certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# 4. Cleanup temp nginx
echo ">>> Cleaning up..."
docker stop chatcenter_nginx_temp && docker rm chatcenter_nginx_temp
rm /tmp/nginx-temp.conf

echo "=== SSL certificate obtained successfully ==="
echo "Certificate: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "Private key: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
