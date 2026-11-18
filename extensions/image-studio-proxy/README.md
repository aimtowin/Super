# Image Studio proxy

Server-side companion for the `com.super.image-studio` extension.

- Public endpoint: `https://43.142.93.106/image-studio-api/`
- Runtime: Node 22, systemd unit `super-image-studio.service`.
- The upstream `IMAGE_API_KEY` lives only in `/opt/super-image-studio/image-studio.env` (mode 600) and never enters the extension package.
- Every `/history` and `/generate` request requires `IMAGE_STUDIO_PASSWORD`; the extension UI asks the user for it once per page session and keeps it in memory.
- Generated images are written to `/var/www/super-updates/image-studio/<YYYY-MM>/` and served by the existing `/downloads/super/` alias.
- `GET /health` is public; `POST /history` and `POST /generate` are rate-limited.
- `GET /download/<token>` returns a short-lived attachment link created for the workbench.

## Local validation

```powershell
$env:IMAGE_API_KEY='...'
$env:IMAGE_STUDIO_PASSWORD='...'
node extensions/image-studio-proxy/server.mjs
```

Do not commit the real `.env`; deployment uses the server-only environment file.