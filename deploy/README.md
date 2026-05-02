# Parallax Beta Deployment

This deployment scaffold runs the TypeScript beta API and dashboard server.

It is local-first and does not enable external market data, external LLMs, SSO, or production broker routing by default.

## Build

```bash
docker build -t parallax-beta .
```

## Initialize A Workspace

```bash
npm run beta-init -- \
  --audit-dir audits \
  --api-token "$PARALLAX_BETA_API_TOKEN" \
  --workspace-name "Parallax Beta"
```

## Run

```bash
docker run --rm \
  --env-file deploy/beta.env.example \
  -v "$PWD/audits:/data/audits" \
  -p 8787:8787 \
  parallax-beta
```

## Health

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/readyz
curl -H "Authorization: Bearer $PARALLAX_BETA_API_TOKEN" http://127.0.0.1:8787/api/status
```

Production partner routing remains locked unless a separately approved regulated partner implementation is configured.
