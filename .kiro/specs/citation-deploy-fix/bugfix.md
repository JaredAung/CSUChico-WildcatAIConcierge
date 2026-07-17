# Bugfix Requirements Document

## Introduction

Three related bugs prevent the Wildcat AI Concierge citation system from working correctly in production:

1. **Citation badges never appear** — The `extractCitationsFromRAG` code in `handler.mjs` has never been deployed to AWS Lambda, so responses lack `[N]` markers and the `sources[]` array is empty in production.
2. **Prompt generates conflicting inline citations** — The system prompt instructs the LLM to produce its own markdown hyperlink citations (`[visible text](URL)`), which conflicts with the badge-based `[N]` citation system that `extractCitationsFromRAG` produces.
3. **File upload fails for files near the advertised limit** — The frontend allows files up to 10 MB, but after base64 encoding (~33% inflation) the payload exceeds Lambda's 6 MB synchronous invocation limit, causing 413/502 errors.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user sends a chat message in production THEN the system returns responses without `[N]` citation markers and with an empty `sources[]` array because the latest handler code has not been deployed

1.2 WHEN the LLM generates a response using the system prompt THEN the system produces markdown hyperlink citations (e.g. `[Chico State Interactive Campus Map](URL)`) that conflict with the badge-based `[N]` markers injected by `extractCitationsFromRAG`

1.3 WHEN a user attaches a file between 3.5 MB and 10 MB THEN the system fails with a payload-too-large or gateway error because the base64-encoded body exceeds Lambda's 6 MB synchronous invocation limit

1.4 WHEN the Lambda function attempts to call `bedrock:Converse` for file analysis THEN the call may fail because the IAM policy does not include the `bedrock:Converse` permission

1.5 WHEN the Lambda function reads `CONVERSE_MODEL_ID` from environment variables THEN it falls back to the hardcoded default because the variable is not defined in `template.yaml`

### Expected Behavior (Correct)

2.1 WHEN a user sends a chat message in production THEN the system SHALL return responses with `[N]` citation markers at appropriate positions and a populated `sources[]` array containing citation metadata (title, url, excerpt, citation_index, domain_label)

2.2 WHEN the LLM generates a response THEN the system SHALL NOT produce its own inline citation references or a "Referencias" section; only actionable resource links (maps, forms, apps, office pages) SHALL appear as markdown hyperlinks in the response text

2.3 WHEN a user attaches a file THEN the system SHALL reject files larger than 3.5 MB on the client side with a clear error message indicating the reduced limit

2.4 WHEN the Lambda function calls `bedrock:Converse` for file analysis THEN the IAM policy SHALL include the `bedrock:Converse` action to allow the call to succeed

2.5 WHEN the Lambda function reads `CONVERSE_MODEL_ID` THEN the environment variable SHALL be defined in `template.yaml` so operators can configure the model without code changes

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user sends a text-only chat message (no file) THEN the system SHALL CONTINUE TO route through `RetrieveAndGenerateCommand` and return answers from the Bedrock Knowledge Base

3.2 WHEN the LLM response mentions a specific actionable resource (map, form, app, tool, office page) with a URL present in search results THEN the system SHALL CONTINUE TO include that markdown hyperlink inline in the response

3.3 WHEN a user attaches a file smaller than 3.5 MB THEN the system SHALL CONTINUE TO process it through the Retrieve + Converse flow and return a valid response

3.4 WHEN the system generates sources metadata THEN the system SHALL CONTINUE TO include `title`, `url`, `excerpt`, `citation_index`, `chunk_text`, and `domain_label` fields in each source object

3.5 WHEN a user sends a request to `/api/v1/health` THEN the system SHALL CONTINUE TO return the health status with configuration details
