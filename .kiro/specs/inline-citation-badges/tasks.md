# Implementation Plan: Inline Citation Badges

## Overview

Transform the Wildcat AI Concierge's citation experience from a disconnected source list into inline, clickable domain-labeled badges. Implementation proceeds backend-first (citation extraction and enrichment), then frontend types, followed by UI components, and finally the reach feature (file upload). Property-based tests validate correctness properties defined in the design.

## Tasks

- [x] 1. Backend citation extraction and enrichment
  - [x] 1.1 Implement helper functions `normalizeUrl`, `deriveDomainLabel`, and `buildTextFragment` in `backend/src/handler.mjs`
    - Add `normalizeUrl(url)` — trims trailing slashes for deduplication
    - Add `deriveDomainLabel(url)` — extracts hostname, strips `www.`, returns first segment before first dot
    - Add `buildTextFragment(baseUrl, chunkText)` — appends `#:~:text=<first 8 words URL-encoded>` if chunk has ≥ 3 words and URL has no existing fragment; returns base URL unchanged otherwise
    - _Requirements: 1.4, 7.1, 7.2, 7.3, 7.4, 7.8_

  - [x] 1.2 Implement `extractCitations(completion)` function in `backend/src/handler.mjs`
    - Replace `consumeAgentCompletion` + `referencesToSources` with a single `extractCitations()` that iterates the stream
    - Maintain `urlToIndex` Map and `nextIndex` counter for stable 1-based index assignment
    - For each chunk with `attribution.citations`: resolve URI, assign/reuse index, extract `chunk_text` (truncated to 400 chars), derive `domain_label`, append `[N]` markers ordered by ascending index
    - Handle trace-based KB refs (`knowledgeBaseLookupOutput`) identically
    - Skip references with no resolvable URI
    - Build text-fragment-enhanced URLs via `buildTextFragment()`
    - Return `{ answer, sources }` where sources include `citation_index`, `chunk_text`, `domain_label`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 7.1, 7.7_

  - [x] 1.3 Wire `extractCitations()` into `handleChat()` replacing existing `consumeAgentCompletion` + `referencesToSources` calls
    - Update the `handleChat` function to call `extractCitations(result.completion)` directly
    - Ensure response format remains `{ answer, sources, session_id, model_used, is_mock }`
    - Keep backward compatibility: when no citations exist, answer is unmodified and sources is empty
    - _Requirements: 1.8, 5.3_

  - [x] 1.4 Write property tests for `normalizeUrl`, `deriveDomainLabel`, and `buildTextFragment`
    - **Property 3: Domain Label Derivation** — generate random valid URLs, verify first subdomain segment after stripping www.
    - **Property 9: Text Fragment Construction** — generate URLs and chunk text, verify #:~:text= appended correctly or URL returned unchanged
    - **Validates: Requirements 1.4, 7.1, 7.2, 7.3, 7.8**

  - [x] 1.5 Write property tests for `extractCitations` index assignment and marker insertion
    - **Property 1: Index Assignment Bijectivity** — generate citation lists with duplicate URLs, verify exactly integers 1..N assigned
    - **Property 2: Chunk Text Truncation Bound** — generate random strings 0–5000 chars, verify output ≤ 400 chars
    - **Property 4: Marker Insertion and Ordering** — generate chunks with 1–5 source references, verify correct [N] marker count and ascending order
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.7**

- [x] 2. Frontend type extension and citation badge component
  - [x] 2.1 Extend the `Source` interface in `frontend/lib/types.ts`
    - Add optional `citation_index?: number` field (1-based, min 1, max 50)
    - Add optional `chunk_text?: string` field (max 2000 chars)
    - Add optional `domain_label?: string` field (max 100 chars)
    - Ensure existing fields remain unchanged for backward compatibility
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 2.2 Create `CitationBadge` component at `frontend/components/chat/CitationBadge.tsx`
    - Accept props: `index: number`, `domainLabel?: string`, `url?: string`, `className?: string`
    - Render pill-shaped element with distinct background color and border
    - If `url` is present and non-empty: render as `<a>` with `target="_blank"` and `rel="noopener noreferrer"`
    - If `url` is absent/empty: render as `<span>` showing domain label or `[N]` text, non-clickable
    - Include `aria-label="Source N: {domain}"` and `role="link"` when clickable
    - Style with Tailwind classes consistent with existing badge/UI components
    - _Requirements: 3.2, 3.3, 3.5, 3.7_

  - [x] 2.3 Write property test for CitationBadge aria-label format
    - **Property 6: Aria-Label Format Consistency** — generate random index/domain combinations, verify aria-label equals `Source ${N}: ${D}`
    - **Validates: Requirements 3.5**

  - [x] 2.4 Write property test for invalid citation index rejection
    - **Property 11: Invalid Citation Index Rejection** — generate invalid numeric/non-numeric values (0, -1, 1.5, NaN, null), verify no badge rendered
    - **Validates: Requirements 2.5**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. ReactMarkdown citation pre-processor in MessageBubble
  - [x] 4.1 Implement citation marker pre-processor and integrate into `MessageBubble.tsx`
    - Add a `sources` prop to `MessageBubbleProps` (accepting `Source[]`)
    - Create a pre-processing function that uses regex to find `[N]` patterns (N = integer 1–20) in the message content
    - Only convert `[N]` when a source with matching `citation_index` exists in the sources array
    - Protect markdown links `[text](url)` from false-positive matches
    - Replace valid markers with `<cite-badge data-index="N" />` or equivalent custom syntax
    - Register a custom component in ReactMarkdown's `components` map that renders `CitationBadge`
    - Handle grouped markers (adjacent `[N][M]`) with 4px horizontal spacing
    - Pass through invalid patterns as plain text
    - _Requirements: 3.1, 3.4, 3.6, 5.1, 5.4, 5.5_

  - [x] 4.2 Update `chat/page.tsx` to pass `sources` to `MessageBubble`
    - Pass `msg.meta.sources` to the `MessageBubble` component in the message rendering loop
    - Ensure backward compatibility: when sources is empty or undefined, no badge rendering occurs
    - _Requirements: 5.1, 5.5_

  - [x] 4.3 Write property test for citation marker parsing selectivity
    - **Property 5: Citation Marker Parsing Selectivity** — generate text with mixed valid/invalid bracket patterns, verify only valid [N] markers with matching sources are converted to badges
    - **Validates: Requirements 3.1, 5.4**

- [x] 5. Enhanced SourcePanel with citation context
  - [x] 5.1 Enhance `SourcePanel.tsx` to display citation badges and pull-quotes
    - Sort sources with `citation_index` by ascending index
    - For sources with `citation_index`: render numbered badge (circle with index), domain label adjacent to badge, and blockquote-styled pull-quote from `chunk_text` (truncated to 300 chars with ellipsis)
    - For sources with `citation_index` but no `domain_label`: show badge without domain label
    - For sources without `citation_index`: render using existing layout unchanged (document-type badge, relevance score, excerpt)
    - Omit pull-quote section when `chunk_text` is null, undefined, empty, or whitespace-only
    - Use the text-fragment-enhanced URL for the external link
    - Retain existing external link icon behavior
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 7.7_

  - [x] 5.2 Write property tests for SourcePanel display truncation and ordering
    - **Property 7: Source Panel Display Truncation** — generate chunk_text of varying lengths around 300-char boundary, verify truncation with ellipsis
    - **Property 8: Source Panel Ordering Invariant** — generate source arrays with random citation indices, verify ascending order
    - **Validates: Requirements 4.3, 4.5**

  - [x] 5.3 Write property test for text fragment URL consistency
    - **Property 10: Text Fragment URL Consistency** — generate sources with citation_index, verify badge URL equals panel external link URL
    - **Validates: Requirements 7.7**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Backward compatibility and graceful degradation
  - [x] 7.1 Add defensive handling for missing/malformed backend response fields
    - In the frontend API layer or chat page: treat missing `sources` as empty array, display fallback message for empty `answer`, generate local session identifier for missing `session_id`
    - Ensure the ConverseCommand fallback path in the backend remains present and invocable
    - Verify that responses with no citation fields render identically to current behavior
    - _Requirements: 5.2, 5.3, 5.6_

  - [x] 7.2 Write unit tests for backward compatibility scenarios
    - Test response with empty sources array renders plain markdown
    - Test response with sources but no `citation_index` fields renders existing layout
    - Test response with answer containing no valid `[N]` markers renders plain markdown with sources in existing format
    - Test response with null/undefined sources, empty answer, missing session_id
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

- [x] 8. File and image upload reach feature (Converse Flow)
  - [x] 8.1 Implement backend Retrieve + Converse flow in `backend/src/handler.mjs`
    - Detect `file` field in request body (`{ content: base64, mime_type: string, filename: string }`)
    - Call `RetrieveCommand` to get relevant KB chunks
    - Call `ConverseCommand` with user query, file content as multimodal content block, and retrieved chunks as context
    - Process response into same `ChatResponse` format with sources and citations
    - Implement 30-second timeout; return error response on timeout/failure
    - _Requirements: 6.3, 6.6, 6.7_

  - [x] 8.2 Create `FileUploader` component at `frontend/components/chat/FileUploader.tsx`
    - Render clickable attachment button in the chat input area
    - Validate file type (image/png, image/jpeg, image/gif, image/webp, application/pdf)
    - Validate file size (≤ 10 MB)
    - Display error messages for invalid file type or size
    - Show preview thumbnail for images, filename chip (truncated to 30 chars) for non-image files
    - Provide dismiss control to remove attached file
    - Limit to 1 file per message
    - Disable send button and display progress indicator while upload in progress
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.8, 6.9_

  - [x] 8.3 Integrate `FileUploader` into `chat/page.tsx` and API layer
    - Add file state management to `ChatContent` component
    - Update `sendMessage` API call to include file data when attached
    - Handle error responses from Converse_Flow, preserve message input content on failure
    - Clear file attachment after successful send
    - _Requirements: 6.3, 6.7, 6.9_

  - [x] 8.4 Write integration tests for file upload flow
    - Test file validation (type, size) prevents submission
    - Test successful file upload produces valid ChatResponse
    - Test timeout/error handling preserves user input
    - _Requirements: 6.4, 6.5, 6.7_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- The backend implementation language is JavaScript (Node.js ESM); the frontend is TypeScript/React (Next.js)
- The `extractCitations()` function replaces both `consumeAgentCompletion()` and `referencesToSources()` — it combines stream consumption with citation processing in a single pass

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.3", "2.4"] },
    { "id": 3, "tasks": ["1.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1"] },
    { "id": 5, "tasks": ["4.3", "5.2", "5.3"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1"] },
    { "id": 8, "tasks": ["8.2"] },
    { "id": 9, "tasks": ["8.3"] },
    { "id": 10, "tasks": ["8.4"] }
  ]
}
```
