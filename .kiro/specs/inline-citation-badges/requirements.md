# Requirements Document

## Introduction

The Wildcat AI Concierge currently returns source URLs in a flat list with no connection to which part of the answer they support. This feature surfaces the existing Bedrock Agent citation data as inline clickable domain-labeled badges (Perplexity-style) that link directly to source pages, with verbatim chunk pull-quotes in the expandable source panel. A reach feature adds file/image upload via a two-step Retrieve + Converse flow for multimodal support.

## Glossary

- **Citation_Extractor**: The backend module that processes raw InvokeAgent citation data, assigns stable 1-based indices to unique source URLs, extracts chunk text and domain labels, and inserts `[N]` markers into the answer text.
- **Citation_Badge**: A pill-shaped, clickable inline UI element rendered in the assistant message that displays a domain label (e.g. `csuchico`, `library`) and links to the source URL.
- **Domain_Label**: A short readable identifier derived from a source URL's hostname (e.g. `csuchico` from `www.csuchico.edu`), used for badge display text.
- **Chunk_Text**: The verbatim text excerpt from a retrieved knowledge base document, provided by Bedrock Agent in `retrievedReferences[].content.text`.
- **Source_Panel**: The collapsible panel below an assistant message that displays source cards with citation details.
- **Citation_Index**: A stable 1-based integer assigned to each unique source URL within a single response. The same URL cited in multiple places reuses the same index.
- **Message_Bubble**: The React component (`MessageBubble.tsx`) that renders assistant messages using ReactMarkdown with custom components.
- **File_Uploader**: The reach-feature UI component that allows users to attach files or images to their query for multimodal processing.
- **Converse_Flow**: A two-step backend process that first retrieves relevant knowledge base chunks, then invokes the Converse API with the retrieved context and user-uploaded file/image for multimodal answers.
- **Text_Fragment**: A URL fragment using the `#:~:text=` syntax that instructs supporting browsers to scroll to and highlight a specific text passage on the target page. Supported in Chrome, Edge, and Safari; gracefully ignored by unsupported browsers.

## Requirements

### Requirement 1: Citation Extraction and Index Assignment

**User Story:** As a student using the Wildcat AI Concierge, I want each source backing the answer to have a stable numbered reference, so that I can identify which parts of the answer come from which sources.

#### Acceptance Criteria

1. WHEN the backend receives InvokeAgent response citations, THE Citation_Extractor SHALL assign a 1-based Citation_Index to each unique source URL within that single response, where uniqueness is determined by case-sensitive string equality of the full URI after trimming trailing slashes.
2. WHEN the same source URL appears in multiple citations within a single response, THE Citation_Extractor SHALL reuse the previously assigned Citation_Index for that URL rather than allocating a new index.
3. WHEN a citation contains a `retrievedReferences` entry with a location URI, THE Citation_Extractor SHALL extract the Chunk_Text from `content.text` for that reference, truncated to a maximum of 400 characters.
4. WHEN a citation contains a source URL, THE Citation_Extractor SHALL derive the Domain_Label by extracting the hostname, removing the `www.` prefix, and taking the first segment before the first dot.
5. WHEN the Citation_Extractor processes a streamed chunk that has associated attribution citations, THE Citation_Extractor SHALL append a `[N]` marker at the end of that chunk's text in the answer, where N is the Citation_Index of the cited source.
6. IF a citation's `retrievedReferences` entry has no resolvable location URI, THEN THE Citation_Extractor SHALL skip that reference without assigning a Citation_Index and without inserting a marker.
7. IF a streamed chunk references multiple distinct sources, THEN THE Citation_Extractor SHALL append one `[N]` marker per unique source at the end of that chunk, ordered by ascending Citation_Index (e.g., `[1][3]`).
8. IF the InvokeAgent response contains zero citations, THEN THE Citation_Extractor SHALL return the answer text unmodified with no `[N]` markers and an empty sources list.

### Requirement 2: Extended Source Data Model

**User Story:** As a frontend developer, I want the Source type to include citation index, chunk text, and domain label fields, so that the UI can render rich citation badges and pull-quotes.

#### Acceptance Criteria

1. THE Source type SHALL include an optional `citation_index` field of type number representing the 1-based position of the source in the citations list, with a minimum value of 1 and a maximum value of 50.
2. THE Source type SHALL include an optional `chunk_text` field of type string containing the verbatim retrieved excerpt, with a maximum length of 2000 characters.
3. THE Source type SHALL include an optional `domain_label` field of type string containing the derived domain label (e.g., "csuchico", "library"), with a maximum length of 100 characters.
4. WHEN the backend returns a source without chunk text available, THE Citation_Extractor SHALL set the `chunk_text` field to an empty string (`""`).
5. IF the backend returns a `citation_index` value less than 1 or not an integer, THEN THE System SHALL treat the field as absent and not render a citation badge for that source.
6. THE Source type SHALL retain backward compatibility with the existing `title`, `url`, `relevance_score`, and `excerpt` fields such that omitting all three new fields (`citation_index`, `chunk_text`, `domain_label`) produces no runtime errors and existing UI components render without changes.
7. WHEN the backend returns a source with a `domain_label` field that is an empty string, THE System SHALL treat the domain label as absent and not render a domain badge for that source.

### Requirement 3: Inline Citation Badge Rendering

**User Story:** As a student reading an answer, I want to see clickable domain-labeled badges inline where citations occur, so that I can quickly identify and visit the supporting source.

#### Acceptance Criteria

1. WHEN the assistant message content contains a `[N]` marker where N is a 1-based integer matching an index in the sources array, THE Message_Bubble SHALL render a Citation_Badge inline in place of the marker text.
2. THE Citation_Badge SHALL display the Domain_Label (the hostname extracted from the source URL, excluding any "www." prefix, e.g. "csuchico") inside a pill-shaped element that uses a distinct background color and border to differentiate it from surrounding prose text.
3. WHEN the user clicks a Citation_Badge, THE Message_Bubble SHALL open the corresponding source URL in a new browser tab using `target="_blank"` with `rel="noopener noreferrer"`.
4. WHEN two or more `[N]` markers appear with no intervening non-whitespace characters between them, THE Message_Bubble SHALL render them as horizontally grouped badges separated by 4px of spacing.
5. THE Citation_Badge SHALL include an `aria-label` attribute with the format "Source N: {domain}" (e.g. "Source 1: csuchico") and a `role` attribute of `link`.
6. IF a `[N]` marker references an index that does not correspond to any entry in the sources array, THEN THE Message_Bubble SHALL render the `[N]` marker as plain text without a badge.
7. IF a source entry exists for the given index but its URL property is empty or undefined, THEN THE Message_Bubble SHALL render the Citation_Badge as a non-clickable element displaying the source title or the marker text, without link behavior.

### Requirement 4: Source Panel with Citation Context

**User Story:** As a student exploring sources, I want to see the citation number, domain label, and a verbatim pull-quote in each source card, so that I can understand what evidence backs the answer.

#### Acceptance Criteria

1. THE Source_Panel SHALL display the Citation_Index as a numbered badge (displaying the integer value) on each source card that has a Citation_Index.
2. THE Source_Panel SHALL display the Domain_Label adjacent to the citation number badge on each source card that has a Citation_Index.
3. WHEN a source has a Chunk_Text that is not null, not undefined, and not an empty or whitespace-only string, THE Source_Panel SHALL display the Chunk_Text as a blockquote-styled pull-quote, truncated to a maximum of 300 characters with an ellipsis if it exceeds that length.
4. WHEN a source has a Chunk_Text that is null, undefined, or an empty or whitespace-only string, THE Source_Panel SHALL omit the pull-quote section and display only the title and link.
5. THE Source_Panel SHALL order source cards by Citation_Index in ascending numeric order.
6. THE Source_Panel SHALL retain the existing external link icon that opens the source URL in a new tab.
7. IF a source does not have a Citation_Index, THEN THE Source_Panel SHALL render that source using the existing card layout (document-type badge, relevance score, title, excerpt, and external link) without a citation badge or pull-quote.
8. IF a source has a Citation_Index but no Domain_Label, THEN THE Source_Panel SHALL display the citation number badge without a Domain_Label.

### Requirement 5: Backward Compatibility and Non-Regression

**User Story:** As an existing user, I want the chat experience to remain unchanged for responses that have no citation data, so that the system does not break when citation data is unavailable.

#### Acceptance Criteria

1. WHEN the backend response `sources` array is empty or the `sources` field is absent, THE Message_Bubble SHALL render the answer as plain markdown without any inline citation badge elements or superscript markers.
2. WHEN the backend response contains sources where none of the source objects include a `citation_index` field, THE Source_Panel SHALL render using the existing behavior: document-type badges derived from URL or title, relevance score display, and excerpt text, with no pull-quote elements.
3. THE existing `ConverseCommand` fallback path in the backend SHALL remain present and invocable, returning a valid `ChatResponse` with `answer`, `sources`, and `session_id` fields when the InvokeAgent path is unavailable.
4. WHEN an answer contains bracket patterns that do not match the strict citation marker pattern `[N]` where N is an integer from 1 to 20 inclusive (e.g., `[text]`, `[0]`, `[21]`, or markdown links `[label](url)`), THE Message_Bubble SHALL render those bracket patterns as plain text without converting them to citation badges.
5. WHEN the backend response contains a `sources` array with 1 or more source objects but the answer text contains zero valid `[N]` citation markers, THE Message_Bubble SHALL render the answer as plain markdown and THE Source_Panel SHALL display sources using the existing document-type badge layout without associating any source to specific answer passages.
6. IF the backend response JSON is missing expected fields (e.g., `sources` is null, `answer` is empty string, or `session_id` is absent), THEN THE System SHALL render the response without errors, treating missing `sources` as an empty array, displaying a fallback message for empty `answer`, and generating a local session identifier for missing `session_id`.

### Requirement 6: File and Image Upload (Reach Feature)

**User Story:** As a student, I want to attach a file or image to my question, so that the AI can analyze my document and provide contextual answers.

#### Acceptance Criteria

1. THE File_Uploader SHALL provide a clickable button in the chat input area to select files for upload.
2. WHEN the user selects a file, THE File_Uploader SHALL display a preview thumbnail (for images) or a filename chip truncated to 30 characters (for non-image files) in the input area before sending, and SHALL provide a dismiss control to remove the attached file.
3. WHEN a message includes an attached file, THE backend SHALL use the Converse_Flow: first retrieving relevant KB chunks via the Bedrock Retrieve API, then invoking the Converse API with both the retrieved context and the uploaded file content as a multimodal content block.
4. IF the uploaded file exceeds the maximum allowed size (10 MB), THEN THE File_Uploader SHALL display an error message indicating the size limit and prevent submission.
5. IF the uploaded file type is not one of the accepted types (image/png, image/jpeg, image/gif, image/webp, application/pdf), THEN THE File_Uploader SHALL display an error message listing those accepted file types and prevent submission.
6. WHEN the Converse_Flow produces a response, THE backend SHALL return it in the same ChatResponse format with sources and citations.
7. IF the Converse_Flow fails or times out within 30 seconds, THEN THE backend SHALL return an error response indicating that file analysis was unsuccessful, and THE frontend SHALL display the error to the user while preserving the message input content.
8. THE File_Uploader SHALL accept at most 1 file per message.
9. WHILE a file upload and Converse_Flow request is in progress, THE File_Uploader SHALL disable the send button and display a progress indicator until the response is received or an error occurs.

### Requirement 7: Text Fragment Deep-Linking (Optional Enhancement)

**User Story:** As a student clicking a citation badge, I want the source page to scroll directly to the relevant passage, so that I can immediately see the evidence without manually searching the page.

#### Acceptance Criteria

1. WHEN the Citation_Extractor constructs a source URL for a citation, THE Citation_Extractor SHALL append a Text_Fragment (`#:~:text=`) to the URL using a short phrase extracted from the first 8 words of the Chunk_Text, URL-encoded per RFC 3986.
2. IF the Chunk_Text is empty, null, or contains fewer than 3 words, THEN THE Citation_Extractor SHALL use the base URL without appending a Text_Fragment.
3. THE Text_Fragment phrase SHALL be extracted from the beginning of the Chunk_Text, trimmed of leading/trailing whitespace, and limited to the first 8 space-delimited words to avoid overly long URL fragments.
4. IF the Text_Fragment construction fails (e.g., URL parsing error, encoding error), THEN THE Citation_Extractor SHALL fall back to the original base URL without a fragment, and SHALL NOT prevent the citation from being returned.
5. WHEN a user clicks a Citation_Badge in a browser that supports Text_Fragments (Chrome, Edge, Safari), THE browser SHALL scroll to and highlight the matching text passage on the source page.
6. WHEN a user clicks a Citation_Badge in a browser that does not support Text_Fragments (e.g., Firefox), THE browser SHALL load the source page at the top without error, gracefully ignoring the fragment.
7. THE Source_Panel external link SHALL use the same Text_Fragment-enhanced URL as the inline Citation_Badge for that source.
8. IF the source URL already contains a fragment identifier (e.g., `#section`), THEN THE Citation_Extractor SHALL NOT append a Text_Fragment to avoid malformed URLs, and SHALL use the URL as-is.
