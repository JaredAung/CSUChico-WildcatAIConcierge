# Wildcat AI Concierge

Conversational access to campus services, policies, and facility resources.

## Structure

| Path | Role |
|------|------|
| `frontend/` | Next.js chat UI |
| `backend/` | AWS SAM — API Gateway → Node.js Lambda → Bedrock Agent |

Flow: **Browser → API Gateway → Lambda → Bedrock Agent**.

## Prerequisites

1. Node.js 20+
2. [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) + valid credentials (`aws login` / SSO / exported keys)
3. [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
4. A Bedrock Agent with a published alias in `us-west-2` (attach a Knowledge Base and/or action groups in the console)

## Backend

API Gateway (HTTP API) → Lambda (Node.js 20) → Amazon Bedrock Agent.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/chat` | Chat via `InvokeAgent` |

`POST /chat` body:

```json
{
  "messages": [{ "role": "user", "content": "Where do I park?" }],
  "session_id": "optional-uuid"
}
```

### Deploy

```bash
cd backend/src
npm install
cd ..
sam build
sam deploy --guided
```

Auth is IAM via the Lambda execution role (`bedrock:InvokeAgent`). No API key parameter.

Copy the `ApiEndpoint` output into `frontend/.env.local`:

```bash
BACKEND_URL=https://xxxxxxxx.execute-api.us-west-2.amazonaws.com/Prod
```

### Bedrock Agent setup

1. In the Bedrock console (`us-west-2`), create an Agent.
2. Paste instructions from `backend/src/prompt.mjs` (`AGENT_INSTRUCTIONS`) into the Agent instructions field.
3. Attach your Knowledge Base for RAG/citations; add action groups later for tools.
4. Prepare the agent and create/publish an **alias**.
5. Put IDs in `backend/samconfig.toml`:

```toml
parameter_overrides = "BedrockRegion=\"us-west-2\" BedrockAgentId=\"XXXXXXXXXX\" BedrockAgentAliasId=\"YYYYYYYYYY\" CorsAllowOrigin=\"*\""
```

6. Redeploy. Chat uses `InvokeAgent`, returns `answer` + `sources`, and reuses `session_id` for history.

### Local API (optional)

```bash
cd backend/src && npm install && cd ..
sam build
sam local start-api --port 8001
```

Leave `BACKEND_URL` unset to use `http://127.0.0.1:8001`.

### Test

```bash
curl -sS "$BACKEND_URL/api/v1/health" | jq

curl -sS "$BACKEND_URL/api/v1/chat" \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{ "role": "user", "content": "Where do I park on campus?" }],
    "session_id": "test-session-1"
  }' | jq
```

Health should show `"mode": "agent"` with non-null `agent_id` / `agent_alias_id`.

## Frontend

```bash
cd frontend
cp .env.example .env.local   # set BACKEND_URL after deploy
npm install
npm run dev
```

Open http://localhost:3000/chat. The UI sends conversation history + `session_id`, shows the answer, and renders `sources` in the Sources panel when the agent returns citations.

## Auth note

Uses the Lambda execution role for Bedrock. Never put Bedrock credentials in the frontend.
