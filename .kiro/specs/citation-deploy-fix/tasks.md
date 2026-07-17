# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Citation Injection and File Size Rejection
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - **Scoped PBT Approach**: Two property-based tests using vitest + fast-check:
    1. **extractCitationsFromRAG property**: For any answer text and valid citation array with span data, `extractCitationsFromRAG(answerText, citations)` SHALL inject `[N]` markers at positions within bounds of the answer text and return a non-empty `sources[]` array with required fields (`title`, `url`, `excerpt`, `citation_index`, `chunk_text`, `domain_label`). Generate random answer strings and mock citation objects with valid span `{start, end}` values. Assert markers are injected and sources are populated.
    2. **File size validation property**: For any file size > 3.5 MB (generate random sizes between 3.5 MB and 10 MB), the `MAX_FILE_SIZE` constant in `FileUploader.tsx` should reject the file. Currently `MAX_FILE_SIZE = 10 * 1024 * 1024`, so files between 3.5–10 MB pass validation — this confirms the bug.
  - Test file: `backend/src/handler.citation-bug.property.test.mjs` for backend, verify `MAX_FILE_SIZE` value in frontend test
  - Run tests on UNFIXED code — expect FAILURE (this confirms the bugs exist)
  - Document counterexamples: files between 3.5–10 MB are accepted when they should be rejected
  - _Requirements: 1.1, 1.2, 3.1, 3.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Chat and Upload Behavior Preserved
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code:
    - `extractCitationsFromRAG('', [])` returns `{ annotatedAnswer: '', sources: [] }`
    - `extractCitationsFromRAG('Hello world', null)` returns `{ annotatedAnswer: 'Hello world', sources: [] }`
    - `extractCitationsFromRAG('Answer text', [])` returns `{ annotatedAnswer: 'Answer text', sources: [] }`
    - Files under current limit (10 MB) pass validation — after fix, files under new limit (3.5 MB) must still pass
  - Write property-based tests capturing observed behavior:
    1. **Empty/null citations preservation**: For all non-empty answer strings with empty or null citations, `extractCitationsFromRAG` returns the answer unchanged and empty sources array
    2. **Small file acceptance**: For any file size between 0 and 3.5 MB (exclusive), the file SHALL pass client-side validation (both before and after fix)
    3. **Source metadata fields**: For any valid citation input producing sources, each source object SHALL contain all required fields: `title`, `url`, `excerpt`, `citation_index`, `chunk_text`, `domain_label`
  - Test file: `backend/src/handler.citation-preserve.property.test.mjs`
  - Run tests on UNFIXED code — **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Fix for citation deploy issues (prompt conflict, file size limit, IAM permission, env var)

  - [x] 3.1 Update prompt.mjs — Replace the `## Citations` section
    - Remove the line: `Always use inline hyperlinks in markdown format: [visible text](URL)`
    - Remove: `When multiple sources support an answer, cite the most specific one inline.`
    - Add explicit prohibition: `Do NOT generate numbered citation markers like [1], [2], etc.`
    - Add explicit prohibition: `Do NOT include a "Sources", "References", or "Referencias" section`
    - Keep actionable resource link instructions (maps, forms, apps, restaurants)
    - New `## Citations` section content:
      ```
      ## Citations
      - Do NOT generate numbered citation markers like [1], [2], etc. — those are handled automatically by the system.
      - Do NOT include a "Sources", "References", or "Referencias" section at the end of your response.
      - When you mention a specific actionable resource — a map, form, app, tool, office page, events page, or external site — hyperlink it ONLY if the URL from the search results clearly and directly matches what you are describing. Example: [Chico State Interactive Campus Map](https://www.csuchico.edu/maps/campus)
      - For restaurants and businesses, link their name to their website URL when available from search results. Example: [Chada Thai](https://www.chadathaicuisinechico.com/)
      - Only use URLs that appear in the search results. Never invent or guess URLs.
      - If no URL strongly matches what you are describing, leave it as plain text.
      ```
    - _Bug_Condition: AGENT_INSTRUCTIONS.contains("Always use inline hyperlinks in markdown format") AND extractCitationsFromRAG.isEnabled_
    - _Expected_Behavior: Prompt SHALL NOT instruct LLM to generate source-attribution citations_
    - _Preservation: Actionable resource links (maps, forms, restaurants) continue to be hyperlinked_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Update FileUploader.tsx — Reduce MAX_FILE_SIZE to 3.5 MB
    - Change `const MAX_FILE_SIZE = 10 * 1024 * 1024` to `const MAX_FILE_SIZE = 3.5 * 1024 * 1024`
    - Change error message from `'File exceeds 10 MB limit'` to `'File exceeds 3.5 MB limit'`
    - Change tooltip from `"max 10 MB"` to `"max 3.5 MB"` in the Button title attribute
    - _Bug_Condition: input.hasFile AND input.file.size > 3.5MB AND base64Encode(input.file).size > 6MB_
    - _Expected_Behavior: Client rejects files > 3.5 MB with clear error message_
    - _Preservation: Files under 3.5 MB continue to process through Retrieve + Converse flow_
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.3 Update template.yaml — Add IAM permission and environment variable
    - Add `- bedrock:Converse` to the Policy statement Action list (alongside bedrock:InvokeModel)
    - Add `CONVERSE_MODEL_ID: anthropic.claude-3-haiku-20240307-v1:0` to Globals.Function.Environment.Variables
    - _Bug_Condition: IAM policy missing bedrock:Converse AND CONVERSE_MODEL_ID not in template.yaml_
    - _Expected_Behavior: Lambda has permission to call ConverseCommand; model ID is configurable via env var_
    - _Preservation: Existing bedrock:RetrieveAndGenerate, bedrock:Retrieve, bedrock:InvokeModel permissions unchanged_
    - _Requirements: 4.1, 4.2, 5.1, 5.2_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Citation Injection and File Size Rejection
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - After the prompt fix and file size fix, the property tests should now PASS:
      - `extractCitationsFromRAG` still works correctly (was already correct, just undeployed)
      - `MAX_FILE_SIZE` now equals `3.5 * 1024 * 1024`, so files > 3.5 MB are correctly rejected
    - Run: `npx vitest --run handler.citation-bug.property.test.mjs` from `backend/src/`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 1.1, 1.2, 3.1, 3.2_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Chat and Upload Behavior Preserved
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `npx vitest --run handler.citation-preserve.property.test.mjs` from `backend/src/`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation properties hold: empty citations unchanged, small files accepted, source metadata complete
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4. Deploy to production
  - Run `sam sync --stack-name wildcat-ai-concierge` from the `backend/` directory
  - This deploys: updated handler.mjs (with extractCitationsFromRAG), updated prompt.mjs, updated template.yaml (IAM + env var)
  - Verify deployment completes without errors
  - _Requirements: 1.3_

- [x] 5. Checkpoint — Ensure all tests pass and deployment succeeds
  - Run full test suite: `npx vitest --run` from `backend/src/`
  - Verify all property tests pass (bug condition + preservation)
  - Verify deployment is live: hit `/api/v1/health` endpoint to confirm Lambda is updated
  - Confirm `extractCitationsFromRAG` is active in production (send a test chat query, verify `[N]` markers and populated `sources[]`)
  - Confirm file uploads > 3.5 MB are rejected client-side
  - Confirm file uploads < 3.5 MB succeed through Retrieve + Converse flow
  - Ensure all tests pass, ask the user if questions arise.
