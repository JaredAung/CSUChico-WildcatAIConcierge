# Bugfix Requirements Document

## Introduction

The `buildSources` and `referencesToSources` functions in `handler.mjs` produce source objects that contain non-HTTP URLs (S3 URIs, empty strings) and append text fragment hashes (`#:~:text=...`) to URLs. This causes two UX problems: (1) un-clickable source badges appear in the frontend when a source resolves to an S3 URI or empty string, and (2) text fragments scroll the user to text that may no longer exist on the live page, creating a confusing scroll-to-nothing experience. The fix filters out non-HTTP sources entirely and removes text fragment generation from the source-building pipeline.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a retrieved chunk resolves to an S3 URI (e.g., `s3://bucket/key`) because no HTTP metadata fallback exists THEN the system includes a source object with an un-clickable S3 URL in the response

1.2 WHEN a retrieved chunk resolves to an empty string URL (no location or metadata URLs available) THEN the system includes a source object with an empty or invalid `url` field in the response

1.3 WHEN a retrieved chunk has a valid HTTP URL and chunk text with 3+ words THEN the system appends a `#:~:text=...` text fragment to the URL, which may scroll the user to non-existent text on the live page

1.4 WHEN `referencesToSources` processes citations containing S3 URIs with no HTTP fallback THEN the system includes source objects with un-clickable S3 URLs in the file-upload flow response

1.5 WHEN `referencesToSources` processes citations with valid HTTP URLs THEN the system appends text fragments to those URLs via `buildTextFragment`, causing scroll-to-nothing UX

### Expected Behavior (Correct)

2.1 WHEN a retrieved chunk resolves to an S3 URI with no HTTP metadata fallback THEN the system SHALL skip that chunk entirely and not include it in the sources array

2.2 WHEN a retrieved chunk resolves to an empty string URL THEN the system SHALL skip that chunk entirely and not include it in the sources array

2.3 WHEN a retrieved chunk has a valid HTTP/HTTPS URL THEN the system SHALL use the base URL without any text fragment appended

2.4 WHEN `referencesToSources` processes a citation that resolves to an S3 URI with no HTTP fallback THEN the system SHALL skip that citation and not include it in the sources array

2.5 WHEN `referencesToSources` processes a citation with a valid HTTP/HTTPS URL THEN the system SHALL use the base URL without any text fragment appended

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a retrieved chunk has a valid HTTP/HTTPS URL from `webLocation` or metadata fallback THEN the system SHALL CONTINUE TO include it in the sources array with correct title, domain_label, excerpt, and citation_index

3.2 WHEN multiple chunks share the same normalized HTTP URL THEN the system SHALL CONTINUE TO deduplicate them, keeping only the first occurrence

3.3 WHEN chunks are processed by `buildSources` THEN the system SHALL CONTINUE TO assign `citation_index` values matching each chunk's 1-based position in the input array (so context block references `[Source N]` remain valid)

3.4 WHEN the `buildTextFragment` function is called directly (e.g., in tests or other callers) THEN the system SHALL CONTINUE TO return a properly constructed text fragment URL (the function itself is preserved, just not called during source building)

3.5 WHEN the file-upload flow calls `referencesToSources` with citations containing valid HTTP URLs THEN the system SHALL CONTINUE TO return properly structured source objects with title, domain_label, excerpt, and citation_index
