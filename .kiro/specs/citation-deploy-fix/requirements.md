# Requirements: Citation Deploy Fix

## Overview

Three related bugs prevent the Wildcat AI Concierge citation system from working correctly in production. This document formalizes the expected behaviors (from bugfix.md) into verifiable requirements with acceptance criteria.

## Requirements

### Requirement 1: Citation Badges Appear in Production

**User Story:** As a student using the Wildcat AI Concierge, I want chat responses to display `[N]` citation markers linked to source metadata so I can verify where the information comes from.

**Acceptance Criteria:**

- 1.1 Given a user sends a chat message that triggers Knowledge Base retrieval with citation data, when the Lambda processes the response, then the answer text SHALL contain `[N]` markers at the positions indicated by Bedrock citation spans.
- 1.2 Given a user sends a chat message that triggers Knowledge Base retrieval with citation data, when the Lambda processes the response, then the `sources[]` array SHALL be populated with objects containing `title`, `url`, `excerpt`, `citation_index`, `chunk_text`, and `domain_label` fields.
- 1.3 Given the production Lambda code does not match the local source (handler.mjs with `extractCitationsFromRAG`), when the developer runs `sam sync` from the `backend/` directory, then the deployed Lambda SHALL reflect the current source code including citation processing logic.

### Requirement 2: No Conflicting LLM-Generated Citations

**User Story:** As a student using the Wildcat AI Concierge, I want a single consistent citation format (programmatic `[N]` badges) so I am not confused by duplicate or conflicting source references.

**Acceptance Criteria:**

- 2.1 Given the system prompt is loaded into the LLM context, when the LLM generates a response, then the response SHALL NOT contain LLM-generated source-attribution hyperlinks (e.g., `[Source Name](URL)` used for citing where information came from).
- 2.2 Given the system prompt is loaded into the LLM context, when the LLM generates a response, then the response SHALL NOT contain a "Referencias", "Sources", or "References" section at the end.
- 2.3 Given the system prompt includes citation instructions, then the `## Citations` section SHALL explicitly instruct the LLM not to generate numbered citation markers or source/reference sections.
- 2.4 Given the LLM response mentions a specific actionable resource (campus map, form, app, office page, restaurant website) and the URL clearly matches from search results, then the response SHALL include that URL as an inline markdown hyperlink (this is an actionable link, not a citation).

### Requirement 3: File Upload Size Limit Reduced

**User Story:** As a student uploading a file to the Concierge, I want clear feedback when my file is too large so I don't encounter cryptic server errors.

**Acceptance Criteria:**

- 3.1 Given the `FileUploader.tsx` component defines `MAX_FILE_SIZE`, then the value SHALL be `3.5 * 1024 * 1024` (3.5 MB) to ensure base64-encoded payloads remain under Lambda's 6 MB synchronous limit.
- 3.2 Given a user selects a file larger than 3.5 MB, when the file is validated client-side, then the system SHALL display an error message indicating the file exceeds the 3.5 MB limit.
- 3.3 Given the FileUploader button has a tooltip, then the tooltip SHALL indicate "max 3.5 MB" as the file size limit.

### Requirement 4: IAM Permission for Converse API

**User Story:** As a DevOps engineer deploying the Concierge, I want the Lambda IAM policy to include all required Bedrock permissions so file analysis requests succeed without manual policy edits.

**Acceptance Criteria:**

- 4.1 Given the `template.yaml` Policy statement for Bedrock actions, then the Action list SHALL include `bedrock:Converse` alongside `bedrock:InvokeModel`.
- 4.2 Given the Lambda function invokes `ConverseCommand` for file analysis, when the function is deployed, then the IAM role SHALL permit the `bedrock:Converse` action on the configured Bedrock model resource.

### Requirement 5: CONVERSE_MODEL_ID Environment Variable

**User Story:** As a DevOps engineer deploying the Concierge, I want the Converse model ID configurable via `template.yaml` environment variables so I can change models without editing code.

**Acceptance Criteria:**

- 5.1 Given the `template.yaml` Globals section defines Function environment variables, then `CONVERSE_MODEL_ID` SHALL be defined with a valid default value (e.g., `anthropic.claude-3-haiku-20240307-v1:0`).
- 5.2 Given the handler reads `process.env.CONVERSE_MODEL_ID` at runtime, when the Lambda is deployed with the updated template, then the environment variable SHALL be available without code changes.

### Requirement 6: Preservation — Existing Behavior Unchanged

**User Story:** As a student using the Wildcat AI Concierge, I want all existing chat, file upload, and health check functionality to continue working exactly as before after the bugfix is deployed.

**Acceptance Criteria:**

- 6.1 Given a user sends a text-only chat message (no file attached), when the Lambda processes the request, then it SHALL CONTINUE TO route through `RetrieveAndGenerateCommand` and return Knowledge Base answers.
- 6.2 Given an LLM response mentions an actionable resource with a URL present in search results, then the markdown hyperlink for that resource SHALL CONTINUE TO appear inline in the response.
- 6.3 Given a user attaches a file smaller than 3.5 MB, when the request is processed, then the system SHALL CONTINUE TO handle it through the Retrieve + Converse flow and return a valid response.
- 6.4 Given the system generates source metadata objects, then each object SHALL CONTINUE TO include `title`, `url`, `excerpt`, `citation_index`, `chunk_text`, and `domain_label` fields.
- 6.5 Given a request to `/api/v1/health`, then the endpoint SHALL CONTINUE TO return health status with configuration details.

## Traceability

| Requirement | Bugfix.md Clause | Design Property |
|-------------|-----------------|-----------------|
| 1.1, 1.2 | 2.1 | Property 1 |
| 2.1, 2.2, 2.3, 2.4 | 2.2 | Property 2 |
| 3.1, 3.2, 3.3 | 2.3 | Property 3 |
| 4.1, 4.2 | 2.4 | Property 4 |
| 5.1, 5.2 | 2.5 | Property 4 |
| 6.1–6.5 | 3.1–3.5 | Property 5 |
