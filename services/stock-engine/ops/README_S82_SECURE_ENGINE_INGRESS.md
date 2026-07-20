# S8.2 Production Connectivity / Secure Engine Ingress

Goal: allow website/Vercel to call the VPS stock-engine without exposing FastAPI naked.

## Current safe state

- FastAPI listens locally: `127.0.0.1:8000`
- Nginx becomes the only public entrypoint.
- Public requests require header: `X-SkillEdge-Engine-Key`.

## Generate secret on VPS

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

Save it:

```bash
ENGINE_PROXY_SECRET="PASTE_SECRET_HERE"
```

## Install Nginx secure proxy

```bash
cd /opt/skilledge/stock-engine

ENGINE_HOST="178.104.184.138"
ENGINE_PROXY_SECRET="PASTE_SECRET_HERE"

sudo bash ops/scripts/setup_nginx_secure_engine_proxy.sh "$ENGINE_HOST" "$ENGINE_PROXY_SECRET"
sudo ufw allow 80/tcp
sudo ufw status
```

## Test

```bash
bash ops/scripts/check_secure_engine_proxy.sh "http://178.104.184.138" "$ENGINE_PROXY_SECRET"
```

Expected:
- no header: 403
- with header: `/health` returns `ok:true`
- with header: `/engine/cockpit?limit=5` returns JSON

## Vercel env later

```txt
STOCK_ENGINE_PUBLIC_URL=http://178.104.184.138
STOCK_ENGINE_PROXY_SECRET=PASTE_SECRET_HERE
```

Later with domain/SSL:

```txt
STOCK_ENGINE_PUBLIC_URL=https://engine.upyourskills.site
```

## Next.js proxy requirement

Every server route that calls stock-engine must send:

```ts
headers: {
  accept: "application/json",
  "X-SkillEdge-Engine-Key": process.env.STOCK_ENGINE_PROXY_SECRET || "",
}
```

S8.2 creates secure VPS ingress. S8.3 will patch/audit Next.js stock-engine proxy routes.
