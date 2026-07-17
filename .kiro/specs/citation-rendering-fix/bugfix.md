# Bugfix Requirements Document

## Introduction

After the initial citation deploy fix, three related bugs were discovered in the citation rendering pipeline. Citation badges render at the bottom of the response instead of inline with cited text, the LLM continues to generate a "References" section despite explicit prompt prohibition, and badge links to S3-sourced content navigate to blank pages because S3 URIs are prioritized over navigable web URLs. Together these issues degrade the citation UX — badges are misplaced, redundant reference sections clutter the response, and some citation links are non-functional.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN Bedrock RetrieveAndGenerate returns citation spans with `span.end` positions clustered at the end of the generated text THEN the system injects `[N]` markers at the bottom of the answer (below the main content) rather than inline next to the relevant sentences

1.2 WHEN the LLM generates a response THEN the system returns a "📌 References" or "References" section at the end of the answer despite the prompt explicitly prohibiting such sections

1.3 WHEN the knowledge base source has both an `s3Location.uri` (e.g. `s3://bucket/downtowninfo/file.md`) and a `webLocation.url` or metadata `source_url` THEN the system uses the S3 URI as the badge link URL, which is not a navigable web address and results in a blank page when clicked

1.4 WHEN the knowledge base source only has an `s3Location.uri` and the metadata contains a `source_url` or `x-amz-bedrock-kb-source-uri` field with a valid web URL THEN the system ignores the metadata web URL and uses the non-navigable S3 URI

### Expected Behavior (Correct)

2.1 WHEN Bedrock RetrieveAndGenerate returns citation spans with `span.end` positions clustered at the end of the generated text THEN the system SHALL strip or redistribute trailing citation markers so that `[N]` markers do not appear as a block below the main answer content (either relocate them to the last relevant sentence or remove markers that cannot be meaningfully placed inline)

2.2 WHEN the LLM generates a response containing a "References", "Sources", "📌 References", or "Referencias" section THEN the system SHALL strip that section from the answer text in post-processing before returning it to the frontend

2.3 WHEN the knowledge base source has both an `s3Location.uri` and a `webLocation.url` THEN the system SHALL prefer `webLocation.url` as the citation badge link URL

2.4 WHEN the knowledge base source only has an `s3Location.uri` THEN the system SHALL check metadata fields (`source_url`, `x-amz-bedrock-kb-source-uri`) for a valid web URL and use that URL as the badge link instead of the raw S3 URI

### Unchanged Behavior (Regression Prevention)

3.1 WHEN Bedrock RetrieveAndGenerate returns citation spans with `span.end` positions that correspond to inline positions within the answer text THEN the system SHALL CONTINUE TO inject `[N]` markers at those inline positions correctly

3.2 WHEN the LLM generates a response without any "References" or "Sources" section THEN the system SHALL CONTINUE TO return the answer text unchanged (no content inadvertently stripped)

3.3 WHEN the knowledge base source has a `webLocation.url` and no `s3Location.uri` THEN the system SHALL CONTINUE TO use the `webLocation.url` as the badge link URL

3.4 WHEN the knowledge base source has only an `s3Location.uri` with no web URL available in any field (webLocation, metadata source_url, or x-amz-bedrock-kb-source-uri) THEN the system SHALL CONTINUE TO use the S3 URI as a fallback (maintaining `deriveDomainLabel` functionality for display purposes)

3.5 WHEN citation badges are rendered with valid web URLs THEN the system SHALL CONTINUE TO open those links in a new tab via the CitationBadge component without any change to behavior

3.6 WHEN the preprocessCitationMarkers function processes `[N]` markers that have valid corresponding sources THEN the system SHALL CONTINUE TO convert them into `<cite-badge>` elements for inline rendering
