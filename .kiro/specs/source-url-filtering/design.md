# Source URL Filtering Bugfix Design

## Overview

The `buildSources` and `referencesToSources` functions in `handler.mjs` currently emit source objects with non-HTTP URLs (S3 URIs, empty strings) and append text fragment hashes to all URLs. This produces un-clickable badges in the frontend and scroll-to-nothing behavior. The fix introduces an `isHttpUrl` guard that filters out non-HTTP sources before they enter the response, and removes `buildTextFragment` calls from the source-building pipeline so URLs are returned as-is.

## Glossary

- **Bug_Condition (C)**: A retrieved chunk or citation resolves to a non-HTTP URL (S3 URI, empty string) OR any URL has a text fragment appended by `buildTextFragment`
- **Property (P)**: Sources in the response contain only clickable HTTP/HTTPS URLs without text fragments
- **Preservation**: HTTP/HTTPS sources continue to appear with correct title, domain_label, excerpt, citation_index, and deduplication behavior
- **`buildSources`**: Function in `handler.mjs` that transforms raw KB retrieval chunks into the frontend `sources[]` array
- **`referencesToSources`**: Function in `handler.mjs` that transforms RetrieveAndGenerate citation refs into the frontend `sources[]` array (used in file-upload flow)
- **`buildTextFragment`**: Exported helper that appends `#:~:text=<words>` to a URL — will be preserved as an export but no longer called during source building
- **`isHttpUrl`**: New helper that returns `true` only when a URL starts with `http://` or `https://`

## Bug Details

### Bug Condition

The bug manifests when either source-building function (`buildSources` or `referencesToSources`) processes a chunk/citation whose resolved URL is not a valid HTTP/HTTPS URL, or when `buildTextFragment` appends a text fragment hash to an otherwise valid URL.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { resolvedUrl: string, chunkText: string }
  OUTPUT: boolean

  LET url = input.resolvedUrl
  LET isNonHttp = NOT (url.startsWith("http://") OR url.startsWith("https://"))
  LET hasTextFragment = buildTextFragment(url, input.chunkText) !== url

  RETURN isNonHttp OR hasTextFragment
END FUNCTION
```

### Examples

- Chunk with `location.s3Location.uri = "s3://kb-bucket/docs/guide.md"` and no HTTP metadata → current code emits source with `url: "s3://kb-bucket/docs/guide.md"` (un-clickable). Expected: chunk is skipped entirely.
- Chunk with empty string URL (no location, no metadata) → current code emits source with `url: ""`. Expected: chunk is skipped entirely.
- Chunk with `webLocation.url = "https://www.csuchico.edu/admissions"` and chunk text "Welcome to CSU Chico admissions page for new students" → current code emits `url: "https://www.csuchico.edu/admissions#:~:text=Welcome%20to%20CSU%20Chico%20admissions%20page%20for%20new%20students"`. Expected: `url: "https://www.csuchico.edu/admissions"`.
- Citation in file-upload flow with `s3Location.uri = "s3://bucket/file.pdf"` and no HTTP fallback → current code emits un-clickable source. Expected: citation is skipped.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- HTTP/HTTPS sources continue to appear in the response with correct `title`, `domain_label`, `excerpt`, and `citation_index`
- Deduplication by normalized URL continues to work — only the first occurrence of a URL is kept
- `citation_index` still maps to the chunk's 1-based position in the input array (context block `[Source N]` references remain valid)
- The exported `buildTextFragment` function continues to work correctly when called directly
- The file-upload flow continues to return properly structured source objects for HTTP URLs

**Scope:**
All inputs that resolve to valid HTTP/HTTPS URLs should continue to produce source objects — just without text fragment suffixes. Only non-HTTP URLs (S3 URIs, empty strings) are filtered out.

## Hypothesized Root Cause

Based on the bug description, the issues are:

1. **No URL protocol validation**: Neither `buildSources` nor `referencesToSources` checks whether the resolved URL is actually an HTTP/HTTPS URL before including it in the output. S3 URIs (`s3://...`) and empty strings pass through unchecked.

2. **Unconditional text fragment generation**: Both functions call `buildTextFragment(url, chunkText)` on every source, appending `#:~:text=...` hashes. These fragments reference text from the KB chunk which may not match the current live page content, causing scroll-to-nothing.

3. **Missing early-exit for empty URLs**: When all URL resolution paths fail (no webLocation, no S3 fallback, no metadata), the chunk still gets processed with `url = ""` and added to sources.

## Correctness Properties

Property 1: Bug Condition - Non-HTTP URLs Excluded From Sources

_For any_ chunk or citation where the resolved URL does not start with `http://` or `https://`, the fixed `buildSources` and `referencesToSources` functions SHALL NOT include that chunk/citation in the returned sources array.

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Bug Condition - No Text Fragments Appended

_For any_ chunk or citation with a valid HTTP/HTTPS URL, the fixed `buildSources` and `referencesToSources` functions SHALL use the base URL directly without appending any `#:~:text=...` text fragment.

**Validates: Requirements 2.3, 2.5**

Property 3: Preservation - HTTP Sources Retained With Correct Fields

_For any_ chunk or citation where the resolved URL starts with `http://` or `https://`, the fixed functions SHALL produce a source object with the same `title`, `domain_label`, `excerpt`, `citation_index`, and `chunk_text` fields as the original functions would (minus the text fragment on the URL).

**Validates: Requirements 3.1, 3.3, 3.5**

Property 4: Preservation - Deduplication Unchanged

_For any_ set of chunks where multiple chunks share the same normalized HTTP URL, the fixed `buildSources` function SHALL continue to deduplicate them, keeping only the first occurrence.

**Validates: Requirements 3.2**

Property 5: Preservation - buildTextFragment Export Unchanged

_For any_ direct call to `buildTextFragment(baseUrl, chunkText)`, the function SHALL continue to return a properly constructed text fragment URL, unchanged from its current implementation.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `backend/src/handler.mjs`

**New Helper Function**: `isHttpUrl`

1. **Add `isHttpUrl` helper** (near the other citation helpers):
   ```javascript
   export function isHttpUrl(url) {
     if (typeof url !== 'string') return false
     return url.startsWith('http://') || url.startsWith('https://')
   }
   ```

**Function**: `buildSources`

2. **Filter non-HTTP URLs**: After the URL resolution logic (the existing block that sets `url`), add a guard:
   - After `url` is resolved, check `if (!isHttpUrl(url)) continue` — skip the chunk entirely

3. **Remove `buildTextFragment` call**: Replace `const enrichedUrl = buildTextFragment(url, chunkText)` with direct use of `url`. Update the source object to use `url` directly instead of `enrichedUrl || url`.

**Function**: `referencesToSources`

4. **Filter non-HTTP URLs**: After the URI resolution logic (after S3 fallback handling), add:
   - `if (!isHttpUrl(uri)) continue` — skip the citation ref entirely

5. **Remove `buildTextFragment` call**: Replace `const fragmentUrl = buildTextFragment(uri, excerpt)` with direct use of `uri`. Update the source object to use `uri` directly instead of `fragmentUrl || uri`.

**Preserved**: `buildTextFragment` export

6. **Keep `buildTextFragment` unchanged**: The function remains exported and functional — it is simply no longer called within `buildSources` or `referencesToSources`.

**Function**: `extractCitationsFromRAG`

7. **Apply same filtering in `extractCitationsFromRAG`**: This function also builds sources from citations. Apply the same `isHttpUrl` guard and remove `buildTextFragment` call:
   - After URI resolution and S3 fallback logic, add `if (!isHttpUrl(uri)) continue`
   - Replace `const fragmentUrl = buildTextFragment(uri, excerpt)` with direct use of `uri`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that call `buildSources` and `referencesToSources` with chunks/citations containing S3 URIs, empty URLs, and valid HTTP URLs with chunk text. Assert the current (unfixed) code produces problematic source objects.

**Test Cases**:
1. **S3 URI in buildSources**: Pass a chunk with only `s3Location.uri` and no HTTP metadata — verify unfixed code includes it (will demonstrate bug)
2. **Empty URL in buildSources**: Pass a chunk with no location or metadata — verify unfixed code includes source with empty URL (will demonstrate bug)
3. **Text fragment on HTTP URL**: Pass a chunk with valid HTTP URL and 3+ word text — verify unfixed code appends `#:~:text=...` (will demonstrate bug)
4. **S3 URI in referencesToSources**: Pass citation with S3 URI only — verify unfixed code includes it (will demonstrate bug)

**Expected Counterexamples**:
- `buildSources([{location: {type: 'S3', s3Location: {uri: 's3://bucket/key'}}}])` returns sources with `url: "s3://bucket/key"`
- `buildSources([{location: {}}])` returns sources with `url: ""`
- `buildSources([{location: {type: 'WEB', webLocation: {url: 'https://example.com'}}, content: {text: 'hello world foo bar'}}])` returns source with `url` containing `#:~:text=`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL chunk WHERE isBugCondition(chunk) DO
  sources := buildSources_fixed([chunk])
  IF chunk.resolvedUrl is non-HTTP:
    ASSERT sources.length == 0
  ELSE:
    ASSERT sources[0].url does NOT contain "#:~:text="
    ASSERT sources[0].url == chunk.resolvedUrl (base URL only)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (valid HTTP URLs that wouldn't get text fragments), the fixed function produces the same result as the original function (minus text fragment differences).

**Pseudocode:**
```
FOR ALL chunk WHERE isHttpUrl(chunk.resolvedUrl) DO
  sources_fixed := buildSources_fixed([chunk])
  ASSERT sources_fixed.length == 1
  ASSERT sources_fixed[0].title == expected_title
  ASSERT sources_fixed[0].domain_label == expected_domain_label
  ASSERT sources_fixed[0].citation_index == expected_index
  ASSERT sources_fixed[0].url starts with "http://" OR "https://"
  ASSERT sources_fixed[0].url does NOT contain "#:~:text="
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many URL patterns automatically across the HTTP URL domain
- It catches edge cases in URL normalization and deduplication
- It provides strong guarantees that HTTP sources are still correctly emitted

**Test Cases**:
1. **HTTP URL preservation**: Verify that chunks with valid HTTP URLs produce source objects with correct fields
2. **Deduplication preservation**: Verify that duplicate HTTP URLs are still deduplicated correctly
3. **Citation index preservation**: Verify that citation_index still reflects the chunk's 1-based position
4. **buildTextFragment direct call**: Verify the exported function still works correctly when called directly

### Unit Tests

- Test `isHttpUrl` with HTTP, HTTPS, S3, empty, null, and non-string inputs
- Test `buildSources` filters out S3 URIs and empty URLs
- Test `buildSources` does not append text fragments to HTTP URLs
- Test `referencesToSources` filters out S3 URIs and empty URLs
- Test `referencesToSources` does not append text fragments to HTTP URLs
- Test `extractCitationsFromRAG` filters out non-HTTP sources

### Property-Based Tests

- Generate random chunk arrays with mixed HTTP/S3/empty URLs and verify only HTTP sources appear in output
- Generate random HTTP URLs and verify `buildSources` returns them without text fragments
- Generate random chunk arrays and verify `citation_index` always equals the chunk's 1-based position
- Verify `buildTextFragment` still produces correct output for any valid URL + text combination

### Integration Tests

- Test full `handleChat` flow with chunks that include a mix of HTTP and S3 sources — verify response only contains HTTP sources
- Test file-upload flow via `handleFileChat` with mixed citations — verify only HTTP sources in response
- Test that frontend can render all sources in the response as clickable links
