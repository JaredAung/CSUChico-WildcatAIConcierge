# CSUChico-WildcatAIConcierge

Conversational access to campus services, policies, and facility resources.

## Structure

| Path | Role |
|------|------|
| `frontend/` | Next.js chat UI |
| `backend/` | AWS SAM — API Gateway → Node.js Lambda → Bedrock |

## Quick start (frontend)

```bash
cd frontend
cp .env.example .env.local   # set BACKEND_URL after deploy
npm install
npm run dev
```

## Backend (Bedrock)

See [backend/README.md](backend/README.md) for `sam build` / `sam deploy`.

After deploy, set `BACKEND_URL` in `frontend/.env.local` to the stack `ApiEndpoint` output, then restart Next.
