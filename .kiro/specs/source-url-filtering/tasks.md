# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Non-HTTP URLs and Text Fragments in Sources
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases:
    - S3 URI chunks (`s3://bucket/key`) with no HTTP metadata in `buildSources` → should NOT appear in sources
    - Empty URL chunks (no location/metadata) in `buildSources` → should NOT appear in sources
    - Valid HTTP URL chunks with 3+ word text in `buildSources` → URL should NOT contain `#:~:text=`
    - S3 URI citations in `referencesToSources` → should NOT appear in sources
    - S3 URI citations in `extractCitationsFromRAG` → should NOT appear in sources
  - Test file: `backend/src/handler.source-url-bug.property.test.mjs`
  - Import `buildSources`, `extractCitationsFromRAG` from `./handler.mjs`; use fast-check for property generation
  - Run test on UNFIXED code: `cd backend/src && npx vitest run handler.source-url-bug.property.test.mjs`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - HTTP Sources Retained With Correct Fields
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (valid HTTP URLs)
  - Test file: `backend/src/handler.source-url-preserve.property.test.mjs`
  - Observe: `buildSources` with valid HTTP URL chunks produces source objects with correct title, domain_label, excerpt, citation_index
  - Observe: Deduplication by normalized URL still keeps only first occurrence
  - Observe: `citation_index` matches the chunk's 1-based position in input array
  - Observe: `buildTextFragment` called directly still returns correct text fragment URLs
  - Observe: `referencesToSources` with valid HTTP URL citations produces correct source objects
  - Write property-based tests capturing observed behavior patterns:
    - For all chunks with HTTP/HTTPS URLs: source object has non-empty title, correct domain_label, excerpt ≤ 400 chars, and citation_index = position + 1
    - For duplicate HTTP URLs: only first occurrence appears in sources
    - For direct `buildTextFragment` calls: function still returns `#:~:text=` for 3+ word text
  - Run tests on UNFIXED code: `cd backend/src && npx vitest run handler.source-url-preserve.property.test.mjs`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for source URL filtering

  - [x] 3.1 Add `isHttpUrl` helper function
    - Add new exported function `isHttpUrl(url)` near other citation helpers in `backend/src/handler.mjs`
    - Returns `false` if `typeof url !== 'string'`
    - Returns `true` only when `url.startsWith('http://') || url.startsWith('https://')`
    - _Bug_Condition: isBugCondition(input) where resolvedUrl does NOT start with http:// or https://_
    - _Expected_Behavior: Non-HTTP URLs excluded from sources array_
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.2 Fix `buildSources` - add guard and remove `buildTextFragment` call
    - After URL resolution logic (after `url` is set), add: `if (!isHttpUrl(url)) continue`
    - Remove the line `const enrichedUrl = buildTextFragment(url, chunkText)`
    - Change source object to use `url` directly instead of `enrichedUrl || url`
    - _Bug_Condition: isBugCondition(input) where resolvedUrl is S3/empty OR buildTextFragment modifies URL_
    - _Expected_Behavior: Only HTTP/HTTPS URLs in sources, no text fragments appended_
    - _Preservation: HTTP sources still have correct title, domain_label, excerpt, citation_index, deduplication_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 3.3 Fix `referencesToSources` - add guard and remove `buildTextFragment` call
    - After S3 metadata fallback logic (after final `uri` value), add: `if (!isHttpUrl(uri)) continue`
    - Remove the line `const fragmentUrl = buildTextFragment(uri, excerpt)`
    - Change source object to use `uri` directly instead of `fragmentUrl || uri`
    - _Bug_Condition: isBugCondition(input) where citation resolves to S3 URI or gets text fragment_
    - _Expected_Behavior: Only HTTP/HTTPS URLs in file-upload sources, no text fragments_
    - _Preservation: HTTP citations still produce correct source objects with all fields_
    - _Requirements: 2.4, 2.5, 3.5_

  - [x] 3.4 Fix `extractCitationsFromRAG` - add guard and remove `buildTextFragment` call
    - After S3 metadata fallback logic in the source-building section, add: `if (!isHttpUrl(uri)) continue`
    - Remove the line `const fragmentUrl = buildTextFragment(uri, excerpt)`
    - Change source object to use `uri` directly instead of `fragmentUrl || uri`
    - _Bug_Condition: isBugCondition(input) where citation URI is S3 or gets text fragment_
    - _Expected_Behavior: Only HTTP/HTTPS URLs in extractCitationsFromRAG sources_
    - _Preservation: HTTP citations still produce correct sources with domain_label, excerpt, citation_index_
    - _Requirements: 2.4, 2.5, 3.1, 3.3_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Non-HTTP URLs and Text Fragments in Sources
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run: `cd backend/src && npx vitest run handler.source-url-bug.property.test.mjs`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** - HTTP Sources Retained With Correct Fields
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run: `cd backend/src && npx vitest run handler.source-url-preserve.property.test.mjs`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `cd backend/src && npx vitest run`
  - Ensure all tests pass including existing tests (handler.test.mjs, handler.property.test.mjs, handler.citation-bug.property.test.mjs, handler.citation-preserve.property.test.mjs)
  - Ensure no regressions in any existing functionality
  - Ask the user if questions arise
