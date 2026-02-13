# Remote Access Setup (Cloudflare Tunnel)

Access your FHE Project Board from anywhere with a free Cloudflare Tunnel.
No port forwarding. No VPN. Free HTTPS with a real domain.

## Setup (10 minutes)

### 1. Create a Cloudflare account
Go to https://dash.cloudflare.com and sign up (free).

### 2. Add your domain (or use a free one)
- If you own a domain: Add it to Cloudflare and update your nameservers
- If you don't: You'll get a `*.cfargotunnel.com` subdomain for free

### 3. Create a tunnel
1. Go to https://one.dash.cloudflare.com
2. Click **Networks** → **Tunnels** → **Create a tunnel**
3. Name it something like `fhe-project-board`
4. Choose **Cloudflared** connector
5. Copy the tunnel token (starts with `eyJ...`)

### 4. Configure the tunnel route
In the tunnel settings, add a **Public Hostname**:
- **Subdomain**: `board` (or whatever you want)
- **Domain**: your domain
- **Service**: `http://app:8080`

### 5. Add your token to .env
Edit `deploy/office-laptop/.env` and set:
```
CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token-here
```

### 6. Start the tunnel
```bash
cd deploy/office-laptop
docker compose -f docker-compose.prod.yml --profile tunnel up -d tunnel
```

### 7. Update CLIENT_URL
Edit `.env` and update:
```
CLIENT_URL=https://board.yourdomain.com
```

Then restart the app:
```bash
docker compose -f docker-compose.prod.yml restart app
```

## Done!

Your board is now live at `https://board.yourdomain.com` with automatic HTTPS.

## Troubleshooting

**Tunnel won't connect:**
```bash
docker compose -f docker-compose.prod.yml logs tunnel
```

**App not reachable through tunnel:**
Make sure the tunnel's public hostname service is set to `http://app:8080` (not localhost).

**Want to stop remote access temporarily:**
```bash
docker compose -f docker-compose.prod.yml stop tunnel
```
