# Wildcat AI Concierge — Backend (Node.js)

API Gateway (HTTP API) → Lambda (Node.js 20) → Amazon Bedrock.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/chat` | Chat (system prompt + Bedrock Converse) |

`POST /chat` body matches the frontend `ChatRequest`:

```json
{
  "messages": [{ "role": "user", "content": "Where do I park?" }],
  "session_id": "optional-uuid"
}
```

## Prerequisites

1. [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) + valid login (`aws login` or SSO)
2. [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3. Node.js 20+ (for local `npm install` / packaging)
4. Bedrock model access enabled in `us-west-2` for the model ID in `samconfig.toml`

## Deploy

```bash
cd backend/src
npm install
cd ..
sam build
sam deploy --guided
```

Auth is IAM via the Lambda execution role (`bedrock:InvokeModel`). No API key parameter.

Copy the `ApiEndpoint` output into `frontend/.env.local`:

```bash
BACKEND_URL=https://xxxxxxxx.execute-api.us-west-2.amazonaws.com/Prod
```

Restart `npm run dev` in `frontend/`.

## Local API (optional)

```bash
cd backend/src && npm install && cd ..
sam build
sam local start-api --port 8001
```

Leave `BACKEND_URL` unset to use `http://127.0.0.1:8001`.

## Auth note

Uses the Lambda execution role for Bedrock. Never put Bedrock credentials in the frontend.
