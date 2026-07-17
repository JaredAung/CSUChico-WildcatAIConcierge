# Citation Deploy Fix — Bugfix Design

## Overview

Three related bugs prevent the Wildcat AI Concierge citation system from working correctly in production:

1. The `extractCitationsFromRAG` function in `handler.mjs` works locally but was never deployed via `sam sync`, so production responses lack `[N]` markers and return empty `sources[]`.
2. The system prompt in `prompt.mjs` instructs the LLM to generate its own markdown hyperlink citations, which conflicts with the programmatic `[N]` badge system.
3. The frontend `FileUploader.tsx` allows 10 MB files, but base64 encoding inflates payloads beyond Lambda's 6 MB synchronous limit.

The fix involves: deploying current code, updating prompt text to remove conflicting citation instructions, reducing the client file-size limit, and adding missing IAM permission and environment variable for the Converse API.

## Glossary

- **Bug_Condition (C)**: The set of conditions triggering these three bugs — undeployed code, conflicting prompt instructions, and oversized payloads
- **Property (P)**: Correct behavior — badges appear, no conflicting LLM citations, file uploads within Lambda limits succeed
- **Preservation**: Existing behaviors that must remain unchanged — text-only chat via RAG, actionable resource links, small file uploads, health endpoint
- **extractCitationsFromRAG**: Function in `backend/src/handler.mjs` that processes Bedrock citations and injects `[N]` markers into answer text
- **AGENT_INSTRUCTIONS**: System prompt exported from `backend/src/prompt.mjs`, injected into the RAG prompt template at runtime
- **handleFileChat**: Function in `backend/src/handler.mjs` that handles file-attached chat via Retrieve + Converse flow
- **MAX_FILE_SIZE**: Constant in `frontend/components/chat/FileUploader.tsx` controlling client-side upload limit

## Bug Details

### Bug Condition

The bugs manifest across three distinct input paths that share a common theme: the citation and file-upload system is not production-ready due to deployment gaps and conflicting instructions.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ChatRequest | FileUploadRequest
  OUTPUT: boolean

  // Bug 1: Citations not deployed
  LET codeNotDeployed = productionLambdaCode != localSourceCode

  // Bug 2: Conflicting prompt citations
  LET promptConflicts = AGENT_INSTRUCTIONS.contains("Always use inline hyperlinks in markdown format")
                        AND extractCitationsFromRAG.isEnabled

  // Bug 3: File too large for Lambda
  LET fileTooLarge = input.hasFile
                     AND input.file.size > 3.5MB
                     AND base64Encode(input.file).size > 6MB

  RETURN codeNotDeployed OR promptConflicts OR fileTooLarge
END FUNCTION
```

### Examples

- User sends "Where do I park?" → production returns plain text without `[N]` markers and empty `sources[]` (Bug 1)
- User sends "How do I get to Meriam Library?" → LLM response includes `[Chico State Interactive Campus Map](URL)` as a citation AND `extractCitationsFromRAG` would inject `[1]` markers referencing the same source, creating duplicate/conflicting citations (Bug 2)
- User attaches a 5 MB PDF → base64 encoding inflates to ~6.7 MB, exceeding Lambda's 6 MB limit → 413/502 error (Bug 3)
- User attaches a 3 MB image → base64 inflates to ~4 MB, within Lambda limit → should succeed (not a bug condition)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Text-only chat messages route through `RetrieveAndGenerateCommand` and return Knowledge Base answers as before
- When the LLM mentions a specific actionable resource (campus map link, form URL, app page) with a URL present in search results, that markdown hyperlink continues to appear inline in the response
- Files smaller than 3.5 MB continue to process through the Retrieve + Converse flow successfully
- Source objects continue to include `title`, `url`, `excerpt`, `citation_index`, `chunk_text`, and `domain_label` fields
- The `/api/v1/health` endpoint continues to return health status and configuration details
- Mouse/keyboard interactions with the FileUploader component work as before for files under the new limit

**Scope:**
All inputs that do NOT involve the three bug conditions should be completely unaffected by this fix. This includes:
- Normal text-only chat queries (after deployment, these will gain citations — an enhancement, not a regression)
- File uploads under 3.5 MB
- Health check requests
- CORS preflight requests

## Hypothesized Root Cause

Based on the bug description, the confirmed issues are:

1. **Undeployed Code (Bug 1)**: The developer added `extractCitationsFromRAG` and the citation helper functions to `handler.mjs` locally but never ran `sam sync` or `sam deploy` from the `backend/` directory. The production Lambda still runs the previous version without citation processing.

2. **Conflicting Prompt Instructions (Bug 2)**: The `## Citations` section in `prompt.mjs` tells the LLM: "Always use inline hyperlinks in markdown format: [visible text](URL)". This was written before the programmatic badge system existed. Now that `extractCitationsFromRAG` injects `[N]` markers, the LLM-generated hyperlink citations create visual confusion and semantic duplication.

3. **Mismatched Size Limits (Bug 3)**: `FileUploader.tsx` sets `MAX_FILE_SIZE = 10 * 1024 * 1024` (10 MB). Base64 encoding inflates data by ~33%, so a 5 MB file becomes ~6.7 MB in the JSON payload body. Lambda's synchronous invocation limit is 6 MB. The client limit needs to be low enough that even after base64 inflation, the total payload stays under 6 MB. A 3.5 MB raw file → ~4.7 MB base64 + JSON overhead ≈ ~5 MB total, well within the limit.

4. **Missing IAM Permission (Bug 3 adjacent)**: The `template.yaml` Policies section grants `bedrock:InvokeModel` but not `bedrock:Converse`. The `handleFileChat` function uses `ConverseCommand`, which requires the `bedrock:Converse` IAM action.

5. **Missing Environment Variable (Bug 3 adjacent)**: The handler reads `process.env.CONVERSE_MODEL_ID` but `template.yaml` does not define it in the `Globals.Function.Environment.Variables` section, so operators cannot configure the Converse model without editing code.

## Correctness Properties

Property 1: Bug Condition - Citation Badges Appear in Production

_For any_ chat request processed by the deployed Lambda where Bedrock returns citations with span data, the `extractCitationsFromRAG` function SHALL inject `[N]` markers into the answer text at correct positions and return a populated `sources[]` array with citation metadata.

**Validates: Requirements 2.1**

Property 2: Bug Condition - No Conflicting Prompt Citations

_For any_ LLM response generated using the updated system prompt, the response SHALL NOT contain LLM-generated source-attribution hyperlinks or a "Referencias" section; only actionable resource links (maps, forms, apps, office pages) with URLs present in search results SHALL appear as markdown hyperlinks.

**Validates: Requirements 2.2**

Property 3: Bug Condition - File Upload Size Rejection

_For any_ file upload where the raw file size exceeds 3.5 MB, the client SHALL reject the file with a clear error message before sending it to the server, preventing Lambda payload-too-large errors.

**Validates: Requirements 2.3**

Property 4: Bug Condition - IAM and Environment Configuration

_For any_ file upload processed by the Lambda function that invokes `ConverseCommand`, the IAM policy SHALL include `bedrock:Converse` permission and the `CONVERSE_MODEL_ID` environment variable SHALL be defined in `template.yaml`.

**Validates: Requirements 2.4, 2.5**

Property 5: Preservation - Existing Chat and Upload Behavior

_For any_ input that is NOT affected by the bug conditions (text-only chat, files under 3.5 MB, health checks), the fixed system SHALL produce the same behavior as before the fix, preserving Knowledge Base routing, actionable hyperlinks, source metadata fields, and health endpoint responses.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `backend/src/prompt.mjs`

**Change**: Replace the `## Citations` section

**Specific Changes**:
1. **Remove source-attribution citation instructions**: Delete the lines that tell the LLM to "Always use inline hyperlinks in markdown format" for source attribution
2. **Keep actionable resource links**: Retain the instruction to hyperlink actionable resources (maps, forms, apps, office pages) when the URL clearly matches from search results
3. **Add explicit prohibition**: Add instruction that the LLM must NOT generate its own numbered citation markers or a references/sources section

**New `## Citations` section:**
```
## Citations
- Do NOT generate numbered citation markers like [1], [2], etc. — those are handled automatically by the system.
- Do NOT include a "Sources", "References", or "Referencias" section at the end of your response.
- When you mention a specific actionable resource — a map, form, app, tool, office page, events page, or external site — hyperlink it ONLY if the URL from the search results clearly and directly matches what you are describing. Example: [Chico State Interactive Campus Map](https://www.csuchico.edu/maps/campus)
- For restaurants and businesses, link their name to their website URL when available from search results. Example: [Chada Thai](https://www.chadathaicuisinechico.com/)
- Only use URLs that appear in the search results. Never invent or guess URLs.
- If no URL strongly matches what you are describing, leave it as plain text.
```

---

**File**: `frontend/components/chat/FileUploader.tsx`

**Change**: Reduce `MAX_FILE_SIZE` constant and update error message

**Specific Changes**:
1. **Change constant**: `const MAX_FILE_SIZE = 3.5 * 1024 * 1024` (3.5 MB)
2. **Update error message**: Change `'File exceeds 10 MB limit'` to `'File exceeds 3.5 MB limit'`
3. **Update tooltip**: Change `"max 10 MB"` to `"max 3.5 MB"` in the button title attribute

---

**File**: `backend/template.yaml`

**Change**: Add `bedrock:Converse` IAM action and `CONVERSE_MODEL_ID` environment variable

**Specific Changes**:
1. **Add IAM action**: Add `- bedrock:Converse` to the Policy statement's Action list alongside `bedrock:InvokeModel`
2. **Add environment variable**: Add `CONVERSE_MODEL_ID: anthropic.claude-3-haiku-20240307-v1:0` to `Globals.Function.Environment.Variables`

---

**Deployment**: `sam sync` from `backend/` directory

**Change**: Deploy the current code (including `extractCitationsFromRAG`) to production Lambda

**Specific Steps**:
1. Run `sam sync --stack-name wildcat-ai-concierge` from the `backend/` directory after making the above code changes
2. This ensures all handler changes (citation processing, file upload handling) are live in production

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Verify current production behavior shows the bugs, and inspect source code to confirm root causes.

**Test Cases**:
1. **Citation Badge Test**: Send a chat request to production API → verify response has empty `sources[]` and no `[N]` markers (confirms Bug 1 — code not deployed)
2. **Prompt Conflict Test**: Inspect `prompt.mjs` and send a query that triggers a campus resource mention → observe LLM generates `[visible text](URL)` style citations (confirms Bug 2)
3. **File Size Test**: Attempt to upload a 5 MB PDF via the frontend → observe 413/502 error from Lambda (confirms Bug 3)
4. **IAM Permission Test**: Check `template.yaml` for `bedrock:Converse` action → confirm it is missing (confirms Bug 3 adjacent)

**Expected Counterexamples**:
- Production responses lack citation badges entirely
- LLM generates markdown hyperlinks that duplicate what the badge system would produce
- File uploads between 3.5–10 MB fail with payload errors

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  IF input.type == "chat" THEN
    ASSERT result.sources.length > 0
    ASSERT result.answer.contains("[N]") markers at correct positions
    ASSERT NOT result.answer.contains("Referencias")
    ASSERT NOT result.answer.matches(LLM_GENERATED_CITATION_PATTERN)
  ELSE IF input.type == "fileUpload" AND input.file.size > 3.5MB THEN
    ASSERT clientRejects(input) with clear error message
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original system.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT fixedSystem(input).behavior == originalSystem(input).behavior
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many text queries to verify RAG routing still works
- It tests various file sizes under 3.5 MB to confirm upload success
- It catches edge cases in citation processing that manual tests might miss

**Test Plan**: Observe behavior on UNFIXED code first for text-only chat and small file uploads, then write property-based tests capturing that behavior continues after fix.

**Test Cases**:
1. **Text Chat Preservation**: Verify text-only queries continue to route through `RetrieveAndGenerateCommand` and return answers
2. **Actionable Link Preservation**: Verify the LLM still includes hyperlinks for actionable resources (maps, forms) when URLs match search results
3. **Small File Upload Preservation**: Verify files under 3.5 MB continue to process through Retrieve + Converse flow
4. **Health Endpoint Preservation**: Verify `/api/v1/health` continues returning status and config
5. **Source Metadata Preservation**: Verify source objects retain all required fields (title, url, excerpt, citation_index, chunk_text, domain_label)

### Unit Tests

- Test `extractCitationsFromRAG` with mock Bedrock citation data containing span offsets → verify `[N]` markers injected at correct positions
- Test `extractCitationsFromRAG` with empty citations → verify no markers, empty sources
- Test `extractCitationsFromRAG` deduplication → verify same URL referenced twice produces one source entry
- Test that the updated prompt text does not contain "Always use inline hyperlinks"
- Test that `MAX_FILE_SIZE` equals `3.5 * 1024 * 1024`

### Property-Based Tests

- Generate random answer text and citation span arrays → verify `extractCitationsFromRAG` always produces valid markers at in-bounds positions and never corrupts the answer text
- Generate random file sizes between 0–10 MB → verify files > 3.5 MB are rejected client-side and files ≤ 3.5 MB are accepted
- Generate random chat requests without files → verify all route through the standard RAG flow and return valid response structure

### Integration Tests

- Deploy to a test stack and send a chat query → verify response includes `[N]` markers and populated `sources[]`
- Deploy to a test stack and send a query mentioning a campus map → verify LLM includes the actionable hyperlink but does NOT generate source-attribution citations
- Deploy to a test stack and upload a 3 MB PDF → verify successful Converse response
- Deploy to a test stack and confirm `CONVERSE_MODEL_ID` env var is set and `bedrock:Converse` permission is granted via CloudFormation stack resources
