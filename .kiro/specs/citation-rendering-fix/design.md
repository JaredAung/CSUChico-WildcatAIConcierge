# Citation Rendering Fix — Bugfix Design

## Overview

Three related bugs degrade the citation UX in the Wildcat AI Concierge. Citation `[N]` markers pile up at the bottom of responses when Bedrock clusters spans at the end of the text. The LLM still emits "References" sections despite prompt instructions. Badge links use non-navigable S3 URIs instead of available web URLs. The fix targets `backend/src/handler.mjs` (all three bugs) with minimal, scoped changes to `extractCitationsFromRAG`, the post-processing pipeline in `handleChat`, and URL resolution logic in both `extractCitationsFromRAG` and `referencesToSources`.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger any of the three citation rendering bugs — trailing marker clusters, LLM-generated reference sections, or S3 URI badge links
- **Property (P)**: The desired behavior — markers positioned inline, no trailing reference sections, and navigable web URLs on badges
- **Preservation**: Existing behaviors that must remain unchanged — inline markers at correct positions, clean answers without false stripping, S3 fallback when no web URL exists
- **`extractCitationsFromRAG`**: Function in `backend/src/handler.mjs` that processes Bedrock RAG citations with span data, injects `[N]` markers into the answer text, and builds the sources array
- **`referencesToSources`**: Function in `backend/src/handler.mjs` that maps KB citation refs to frontend `Source[]` with enriched fields (URL, domain label, fragment)
- **`preprocessCitationMarkers`**: Function in `frontend/components/chat/MessageBubble.tsx` that converts `[N]` markers to `<cite-badge>` HTML elements for rendering
- **Trailing marker cluster**: A group of `[N]` markers that appear at or near the end of the answer text (within the last 5% of characters), separated from the main content by whitespace or newlines

## Bug Details

### Bug Condition

The bug manifests through three independent conditions. Any one of them degrades the citation UX. The system either places markers at the bottom of the answer, allows reference sections through, or links badges to non-navigable S3 URIs.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { answerText: string, citations: Array, llmOutput: string }
  OUTPUT: boolean
  
  // Condition 1: Trailing marker cluster
  LET trailingMarkers = markers inserted at positions >= (length(answerText) * 0.95)
  LET hasTrailingCluster = count(trailingMarkers) >= 2
  
  // Condition 2: LLM-generated reference section
  LET refPattern = /\n#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*\n/i
  LET hasReferenceSection = refPattern.test(llmOutput)
  
  // Condition 3: S3 URI used when web URL is available
  LET hasS3Uri = citation.location.s3Location.uri EXISTS
  LET hasWebUrl = citation.location.webLocation.url EXISTS
                  OR citation.metadata.source_url EXISTS
                  OR citation.metadata['x-amz-bedrock-kb-source-uri'] starts with 'http'
  LET usesS3WhenWebAvailable = hasS3Uri AND hasWebUrl AND selectedUrl == s3Uri
  
  RETURN hasTrailingCluster OR hasReferenceSection OR usesS3WhenWebAvailable
END FUNCTION
```

### Examples

- **Trailing markers**: Answer is 500 chars. Bedrock returns 3 citations all with `span.end = 498`. Result: `...last sentence.[1][2][3]` appears as a dangling block at the bottom — should be stripped or redistributed to the last content paragraph.
- **Reference section**: LLM responds with answer text followed by `\n\n📌 References\n1. Source A\n2. Source B` — the trailing section should be stripped.
- **S3 URI over web URL**: A citation has `s3Location.uri = "s3://bucket/downtown/chadathai.md"` AND `webLocation.url = "https://www.chadathaicuisinechico.com/"` — the badge link should use the web URL, not the S3 URI.
- **S3 URI with metadata web URL**: A citation has only `s3Location.uri` but `metadata.source_url = "https://example.com/page"` — the badge link should use the metadata URL.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Citation markers that correspond to inline positions within the body of the answer text must continue to be injected at those positions correctly (Requirement 3.1)
- Answers that do not contain any "References" or "Sources" sections must be returned unchanged — no content inadvertently stripped (Requirement 3.2)
- Sources with only `webLocation.url` and no `s3Location.uri` must continue to use the web URL (Requirement 3.3)
- Sources with only `s3Location.uri` and no web URL available anywhere (not in webLocation, not in metadata) must continue to use the S3 URI as fallback with `deriveDomainLabel` functioning correctly (Requirement 3.4)
- CitationBadge component link behavior (new tab, `noopener noreferrer`) must remain unchanged (Requirement 3.5)
- `preprocessCitationMarkers` must continue to convert valid `[N]` markers to `<cite-badge>` elements (Requirement 3.6)

**Scope:**
All inputs that do NOT involve trailing marker clusters, LLM reference sections, or S3-over-web URL priority should be completely unaffected by this fix. This includes:
- Answers with well-distributed inline citation markers
- Answers without any trailing "References" text
- Sources that only have web URLs
- Sources with only S3 URIs and no metadata web URL fallback
- All non-citation-related response handling (health check, error responses, file upload flow)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Trailing Marker Cluster (Bug 1)**: `extractCitationsFromRAG` inserts `[N]` markers at `span.end` positions without checking whether those positions cluster at the end of the text. Bedrock's span data sometimes groups all citations at the final character position, causing markers to pile up at the bottom. The function has no logic to detect or redistribute trailing clusters.

2. **LLM Reference Sections (Bug 2)**: The prompt in `prompt.mjs` instructs the LLM not to generate reference sections, but LLMs are non-deterministic and sometimes ignore instructions. There is no post-processing step in `handleChat` to strip these sections from the response text after `extractCitationsFromRAG` returns.

3. **S3 URI Priority (Bug 3)**: In both `extractCitationsFromRAG` and `referencesToSources`, the URL extraction logic uses:
   ```javascript
   const uri =
     ref.location?.s3Location?.uri ||
     ref.location?.webLocation?.url || ...
   ```
   This prioritizes `s3Location.uri` over `webLocation.url` due to the `||` short-circuit order. Additionally, metadata fields (`source_url`, `x-amz-bedrock-kb-source-uri`) are never checked as web URL fallbacks — `x-amz-bedrock-kb-source-uri` is only used for the display title.

## Correctness Properties

Property 1: Bug Condition — Trailing Marker Cluster Detection and Removal

_For any_ answer text where `extractCitationsFromRAG` would inject 2 or more citation markers at positions within the last 5% of the text (trailing cluster), the fixed function SHALL either redistribute those markers to the end of the last content paragraph or strip them entirely, so that no block of markers appears detached from the main content.

**Validates: Requirements 2.1**

Property 2: Bug Condition — LLM Reference Section Stripping

_For any_ LLM response containing a trailing section matching the pattern `\n` followed by an optional heading marker and one of "References", "Sources", "📌 References", or "Referencias", the fixed post-processing pipeline SHALL strip that section and all content following it from the answer text before returning it to the frontend.

**Validates: Requirements 2.2**

Property 3: Bug Condition — Web URL Priority Over S3 URI

_For any_ citation reference that has both `s3Location.uri` and `webLocation.url`, the fixed URL resolution logic SHALL use `webLocation.url` as the badge link URL. For references with only `s3Location.uri` but metadata containing `source_url` or an `x-amz-bedrock-kb-source-uri` value starting with `http`, the fixed logic SHALL use that metadata web URL.

**Validates: Requirements 2.3, 2.4**

Property 4: Preservation — Inline Marker Injection Unchanged

_For any_ answer text where citation markers are injected at inline positions (not trailing clusters), the fixed function SHALL produce the same annotated answer as the original function, preserving correct inline marker placement.

**Validates: Requirements 3.1, 3.6**

Property 5: Preservation — Clean Answer Passthrough

_For any_ answer text that does NOT contain a trailing "References"/"Sources"/"Referencias" section, the fixed post-processing pipeline SHALL return the answer text unchanged, with no content inadvertently stripped.

**Validates: Requirements 3.2**

Property 6: Preservation — S3 URI Fallback When No Web URL Exists

_For any_ citation reference that has only `s3Location.uri` with no `webLocation.url` and no metadata web URL (`source_url` or `x-amz-bedrock-kb-source-uri` starting with `http`), the fixed URL resolution logic SHALL continue to use the S3 URI as the badge link, maintaining `deriveDomainLabel` functionality.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `backend/src/handler.mjs`

**Function**: `extractCitationsFromRAG`

**Specific Changes**:

1. **Flip URL priority order**: Change the URL extraction from `s3Location.uri || webLocation.url || ...` to `webLocation.url || confluenceLocation || salesforceLocation || sharePointLocation || s3Location.uri`. This ensures web URLs are preferred when available.

2. **Add metadata web URL fallback**: After resolving the location-based URL, if the result is an S3 URI (starts with `s3://`), check `ref.metadata?.source_url` and `ref.metadata?.['x-amz-bedrock-kb-source-uri']` for a value starting with `http`. Use the first valid web URL found.

3. **Detect and handle trailing marker clusters**: After injecting all markers, detect whether markers cluster at the end of the text (positions within last 5% of the original text length and at least 2 markers). If a trailing cluster is detected, strip those trailing markers from the annotated answer (the sources array still contains the references — they just won't have inline markers).

**Function**: `referencesToSources`

4. **Flip URL priority order** (same as #1): Apply the same URL resolution logic change to keep both functions consistent.

5. **Add metadata web URL fallback** (same as #2): Apply the same metadata fallback logic.

**Function**: `handleChat`

6. **Add post-processing reference section strip**: After `extractCitationsFromRAG` returns, apply a regex to strip any trailing "References"/"Sources"/"📌 References"/"Referencias" section from the `annotatedAnswer`. The regex should match a newline followed by optional heading markers (`#`, `##`, `###`) and the section title, then remove everything from that point to the end of the string.

### Pseudocode for URL Resolution (Changes 1–2)

```
FUNCTION resolveSourceUrl(ref)
  // Prefer web locations over S3
  LET url = ref.location?.webLocation?.url
          || ref.location?.confluenceLocation?.url
          || ref.location?.salesforceLocation?.url
          || ref.location?.sharePointLocation?.url
          || ref.location?.s3Location?.uri
          || ''
  
  // If we ended up with an S3 URI, check metadata for web URL fallback
  IF url starts with 's3://' THEN
    LET metaSourceUrl = ref.metadata?.source_url || ''
    LET metaBedrockUri = ref.metadata?.['x-amz-bedrock-kb-source-uri'] || ''
    IF metaSourceUrl starts with 'http' THEN
      url = metaSourceUrl
    ELSE IF metaBedrockUri starts with 'http' THEN
      url = metaBedrockUri
    END IF
  END IF
  
  RETURN url
END FUNCTION
```

### Pseudocode for Trailing Marker Detection (Change 3)

```
FUNCTION removeTrailingMarkerCluster(annotatedAnswer, originalLength, insertions)
  // Identify insertions in the trailing 5% of the original text
  LET threshold = originalLength * 0.95
  LET trailingInsertions = insertions WHERE insertion.end >= threshold
  
  IF count(trailingInsertions) >= 2 THEN
    // Strip all [N] markers that were injected at trailing positions
    // by trimming the annotated answer of trailing marker patterns
    LET cleaned = annotatedAnswer.replace(/(\[\\d+\])+\s*$/, '')
    RETURN cleaned.trimEnd()
  END IF
  
  RETURN annotatedAnswer
END FUNCTION
```

### Pseudocode for Reference Section Stripping (Change 6)

```
FUNCTION stripReferenceSection(answer)
  // Match trailing reference sections with various heading formats
  LET pattern = /\n+#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:].*/si
  RETURN answer.replace(pattern, '').trimEnd()
END FUNCTION
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise `extractCitationsFromRAG` and the `handleChat` post-processing with inputs that trigger each bug condition. Run on the UNFIXED code to observe failures.

**Test Cases**:
1. **Trailing Cluster Test**: Call `extractCitationsFromRAG` with an answer of 200 chars and 3 citations all having `span.end = 198`. Verify markers appear at the bottom (will demonstrate bug on unfixed code).
2. **Reference Section Test**: Simulate an answer containing `\n\n📌 References\n1. Source A\n2. Source B`. Verify it passes through unstripped (will demonstrate bug on unfixed code).
3. **S3 URI Priority Test**: Call `extractCitationsFromRAG` with a citation that has both `s3Location.uri` and `webLocation.url`. Verify the source URL is the S3 URI (will demonstrate bug on unfixed code).
4. **Metadata Fallback Test**: Call `extractCitationsFromRAG` with a citation having only `s3Location.uri` and `metadata.source_url` with a web URL. Verify the S3 URI is used (will demonstrate bug on unfixed code).

**Expected Counterexamples**:
- Markers `[1][2][3]` appear at character position 198+ in a 200-char answer
- Reference section text is included in the returned answer
- Source URLs are `s3://bucket/path` instead of `https://example.com`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := extractCitationsFromRAG_fixed(input.answerText, input.citations)
  result := stripReferenceSection(result.annotatedAnswer)
  ASSERT NOT hasTrailingMarkerCluster(result)
  ASSERT NOT hasReferenceSection(result)
  ASSERT allSourceUrlsAreWebWhenAvailable(result.sources)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT extractCitationsFromRAG_original(input) = extractCitationsFromRAG_fixed(input)
  ASSERT stripReferenceSection(cleanAnswer) = cleanAnswer
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss (e.g., text containing "[1]" as content, not a marker)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for well-formed inputs (inline markers, clean answers, web-only URLs), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Inline Marker Preservation**: Generate random answer texts with citation spans at distributed inline positions; verify markers are injected identically by both original and fixed functions.
2. **Clean Answer Preservation**: Generate random answer texts without reference sections; verify `stripReferenceSection` returns them unchanged.
3. **Web URL Preservation**: Generate citation references with only `webLocation.url`; verify URL resolution returns the same web URL.
4. **S3 Fallback Preservation**: Generate citation references with only `s3Location.uri` and no metadata web URL; verify S3 URI is still used.

### Unit Tests

- Test `extractCitationsFromRAG` with trailing marker clusters (2+, 3+ markers at end)
- Test `extractCitationsFromRAG` with distributed inline markers (no change expected)
- Test reference section stripping for each variant: "References", "Sources", "📌 References", "Referencias"
- Test reference section stripping does not affect answers without reference sections
- Test URL resolution with `webLocation.url` + `s3Location.uri` → prefers web
- Test URL resolution with only `s3Location.uri` + `metadata.source_url` → uses metadata
- Test URL resolution with only `s3Location.uri` and no metadata web URL → uses S3
- Test `deriveDomainLabel` still works correctly with web URLs
- Test edge case: answer text is empty or citations array is empty

### Property-Based Tests

- Generate random answer texts (length 50–2000) with random span positions; verify no trailing marker cluster in output when spans are distributed
- Generate random answer texts with forced trailing spans; verify markers are stripped
- Generate random strings and verify `stripReferenceSection` only removes content matching the reference section pattern
- Generate random citation reference objects with varying URL field combinations; verify correct URL priority resolution

### Integration Tests

- Test full `handleChat` flow (mocked Bedrock) with response containing trailing citations → verify clean answer
- Test full `handleChat` flow with LLM-generated reference section → verify section is stripped
- Test full `handleChat` flow with S3+web citations → verify source URLs are web URLs
- Test that `preprocessCitationMarkers` in the frontend still correctly renders badges after backend changes
