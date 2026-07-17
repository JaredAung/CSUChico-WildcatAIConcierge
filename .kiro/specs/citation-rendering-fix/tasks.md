# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Citation Rendering Bugs (Trailing Markers, Reference Section, S3 URI Priority)
  - **IMPORTANT**: Write this property-based test BEFORE implementing the fix
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate all three bugs exist
  - **Test file**: `backend/src/handler.citation-bug.property.test.mjs`
  - **Framework**: vitest + fast-check (both in devDependencies)
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug condition:
    - **Trailing marker cluster**: Generate answer text (100-2000 chars) with 2+ citations having `span.end` clustered at >= 95% of text length. Assert that after `extractCitationsFromRAG`, the annotated answer does NOT have `[N]` markers in the trailing 5% (will FAIL on unfixed code because markers pile up at the end)
    - **Reference section passthrough**: Generate answer text followed by `\n\n📌 References\n1. Source A\n2. Source B`. Call `extractCitationsFromRAG` then verify the returned text does NOT contain a reference section matching `/\n#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:]/i` (will FAIL on unfixed code because no stripping exists)
    - **S3 URI priority**: Generate citation references with both `s3Location.uri = "s3://bucket/path"` AND `webLocation.url = "https://example.com/page"`. Assert that the source URL in the result uses `webLocation.url`, not the S3 URI (will FAIL on unfixed code because S3 is prioritized via `||` order)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found:
    - Trailing cluster: markers `[1][2][3]` at position 198+ in 200-char answer
    - Reference section: `📌 References` text present in returned answer
    - S3 priority: source URL is `s3://bucket/path` instead of `https://example.com/page`
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Correct Citation Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Test file**: `backend/src/handler.citation-preserve.property.test.mjs`
  - **Framework**: vitest + fast-check
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: `extractCitationsFromRAG` with inline markers at distributed positions (span.end < 95% of text length) injects markers correctly at those positions
    - Observe: answer text without any reference section pattern passes through `extractCitationsFromRAG` unchanged (no content stripped)
    - Observe: citation with only `webLocation.url` (no `s3Location`) produces source with that web URL
    - Observe: citation with only `s3Location.uri` and NO metadata web URL produces source with the S3 URI
  - Write property-based tests capturing observed behavior patterns:
    - **Inline marker preservation**: For all answer texts (50-2000 chars) with citation spans at random distributed positions (all `span.end` < 90% of text length), assert markers are injected at the correct positions matching `[N]` format
    - **Clean answer passthrough**: For all answer texts that do NOT contain patterns matching `/\n#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:]/i`, assert the answer is returned unchanged by any future `stripReferenceSection` post-processing
    - **Web-only URL sources**: For all citation references with `webLocation.url` and no `s3Location.uri`, assert the resulting source URL equals the web URL (with text fragment appended when applicable)
    - **S3-only fallback (no web available)**: For all citation references with only `s3Location.uri` and metadata that does NOT contain a URL starting with `http`, assert the source URL uses the S3 URI
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix citation rendering bugs

  - [x] 3.1 Implement URL priority fix and metadata fallback
    - In `extractCitationsFromRAG`: flip URL resolution from `s3Location.uri || webLocation.url || ...` to `webLocation.url || confluenceLocation.url || salesforceLocation.url || sharePointLocation.url || s3Location.uri`
    - In `extractCitationsFromRAG`: after URL resolution, if result starts with `s3://`, check `ref.metadata?.source_url` and `ref.metadata?.['x-amz-bedrock-kb-source-uri']` for values starting with `http`; use first valid web URL found
    - In `referencesToSources`: apply same URL priority flip and metadata fallback logic for consistency
    - _Bug_Condition: isBugCondition(input) where citation has s3Location.uri AND webLocation.url AND selectedUrl == s3Uri_
    - _Expected_Behavior: source URL uses webLocation.url when available; falls back to metadata web URL; uses S3 URI only as last resort_
    - _Preservation: Sources with only webLocation.url continue to use web URL; sources with only s3Location.uri and no metadata web URL continue to use S3 URI_
    - _Requirements: 2.3, 2.4, 3.3, 3.4_

  - [x] 3.2 Implement trailing marker cluster detection and stripping
    - In `extractCitationsFromRAG`: after injecting all markers, detect insertions where `insertion.end >= originalLength * 0.95` and count >= 2
    - When trailing cluster detected: strip those trailing `[N]` markers from `annotatedAnswer` using regex `/(\[\d+\])+\s*$/`
    - Sources array remains unchanged (references still available) — only inline markers are removed
    - _Bug_Condition: isBugCondition(input) where count(markers at position >= 95% of text length) >= 2_
    - _Expected_Behavior: no block of [N] markers appears detached at the end of the answer_
    - _Preservation: Inline markers at positions < 95% of text length remain unchanged_
    - _Requirements: 2.1, 3.1_

  - [x] 3.3 Implement `stripReferenceSection` post-processing in `handleChat`
    - Add exported function `stripReferenceSection(answer)` that applies regex `/\n+#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:].*/si` and trims the result
    - In `handleChat`: call `stripReferenceSection(annotatedAnswer)` after `extractCitationsFromRAG` returns, before assigning to `answer`
    - Test all variants: "References", "Sources", "📌 References", "Referencias", with heading markers `#`, `##`, `###`
    - _Bug_Condition: isBugCondition(input) where answer contains trailing reference section pattern_
    - _Expected_Behavior: reference section and all content after it is stripped from answer_
    - _Preservation: Answers without reference sections are returned unchanged_
    - _Requirements: 2.2, 3.2_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Citation Rendering Bugs Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all three bug conditions
    - When this test passes, it confirms:
      - Trailing markers are stripped from annotated answers
      - Reference sections are stripped from responses
      - Web URLs are preferred over S3 URIs
    - Run: `cd backend/src && npx vitest run handler.citation-bug.property.test.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Correct Citation Behavior Still Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run: `cd backend/src && npx vitest run handler.citation-preserve.property.test.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation properties still hold after fix:
      - Inline markers at distributed positions still injected correctly
      - Clean answers without reference sections unchanged
      - Web-only URL sources still use web URL
      - S3-only sources with no web fallback still use S3 URI

- [x] 4. Deploy
  - Run `sam sync --stack-name wildcat-ai-concierge` from `backend/` directory
  - Verify deployment completes without errors
  - Test health endpoint: `GET /api/v1/health` returns `status: "ok"`

- [x] 5. Checkpoint - Ensure all tests pass
  - Run full test suite: `cd backend/src && npx vitest run`
  - Verify all property-based tests pass (bug condition + preservation)
  - Verify health endpoint responds correctly after deploy
  - Ask the user if questions arise
