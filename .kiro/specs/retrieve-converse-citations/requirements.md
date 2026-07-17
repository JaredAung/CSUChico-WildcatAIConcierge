# Requirements Document

## Introduction

The Wildcat Navigator chatbot currently uses Bedrock's `RetrieveAndGenerate` API for its main chat flow. This single-call API returns phantom citations — citation spans with empty `retrievedReferences` arrays — which means no inline citation badges or source documents appear in the frontend. This feature replaces the `RetrieveAndGenerate` approach with a two-step Retrieve + Converse pattern (already proven in the `handleFileChat` code path) so that every chat response includes properly attributed inline citations and a populated SourcePanel.

## Glossary

- **Chat_Handler**: The `handleChat` function in `handler.mjs` that processes POST `/api/v1/chat` requests without file attachments.
- **Retrieve_Step**: A call to the Bedrock `RetrieveCommand` API that queries the knowledge base and returns ranked document chunks with full metadata (URLs, content text, scores).
- **Converse_Step**: A call to the Bedrock `ConverseCommand` API that sends the retrieved context and user query to the language model and returns a generated answer.
- **Citation_Marker**: An inline text pattern `[N]` (where N is a positive integer) placed by the language model in its response to reference a numbered source.
- **Source_Object**: A JSON object in the response `sources[]` array containing `title`, `url`, `citation_index`, `chunk_text`, `domain_label`, and optional `excerpt` and `relevance_score` fields.
- **System_Prompt**: The instruction text sent to the Converse model as the `system` parameter, defining the model's behavior and citation conventions.
- **Reference_Section**: A trailing "References", "Sources", or "Referencias" section that the language model may append to its answer, which must be stripped before delivery.
- **Knowledge_Base**: The AWS Bedrock Knowledge Base identified by `BEDROCK_KNOWLEDGE_BASE_ID`, containing CSU Chico campus information.
- **Message_History**: The array of prior user and assistant messages in the current conversation, used to provide multi-turn context.

## Requirements

### Requirement 1: Replace RetrieveAndGenerate with Retrieve + Converse

**User Story:** As a student using the chatbot, I want answers that include working inline citations and source documents, so that I can verify the information and explore original sources.

#### Acceptance Criteria

1. WHEN a chat request without a file attachment is received, THE Chat_Handler SHALL call the Retrieve_Step to query the Knowledge_Base with the user's message context.
2. WHEN the Retrieve_Step returns document chunks, THE Chat_Handler SHALL construct a numbered context block where each chunk is labelled `[Source N]` (N starting at 1) and pass it along with the user query to the Converse_Step.
3. WHEN the Converse_Step returns a generated answer, THE Chat_Handler SHALL return the answer text in the `answer` field of the response.
4. THE Chat_Handler SHALL NOT call `RetrieveAndGenerateCommand` for non-file chat requests.
5. WHEN the Retrieve_Step returns zero chunks, THE Chat_Handler SHALL still call the Converse_Step with just the user query (without context) and return whatever answer the model generates.

### Requirement 2: Build Sources Array from Retrieve Results

**User Story:** As a student, I want to see the source documents that informed the chatbot's answer, so that I can read the original content.

#### Acceptance Criteria

1. WHEN the Retrieve_Step returns document chunks, THE Chat_Handler SHALL build a `sources` array containing one Source_Object per unique URL.
2. THE Chat_Handler SHALL assign a `citation_index` to each Source_Object matching the `[Source N]` label used in the context block sent to the model.
3. THE Chat_Handler SHALL populate the `url` field of each Source_Object using the web URL from chunk metadata, falling back to S3 URI metadata fields when the primary location is an S3 path.
4. THE Chat_Handler SHALL populate the `domain_label` field by extracting the hostname's first segment (after removing `www.` prefix) from the source URL.
5. THE Chat_Handler SHALL populate the `chunk_text` field with up to 400 characters of the retrieved chunk's text content.
6. THE Chat_Handler SHALL populate the `title` field from metadata, falling back to the last path segment of the URL when metadata title is unavailable.
7. THE Chat_Handler SHALL deduplicate sources by normalized URL so that no two Source_Objects share the same base URL.

### Requirement 3: Update System Prompt for Inline Citations

**User Story:** As a developer, I want the language model to place citation markers in the correct positions in its response, so that the frontend can render clickable citation badges.

#### Acceptance Criteria

1. THE System_Prompt SHALL instruct the model to place `[N]` Citation_Markers inline after sentences that use information from `[Source N]`.
2. THE System_Prompt SHALL NOT contain the instruction "Do NOT generate numbered citation markers like [1], [2], etc."
3. THE System_Prompt SHALL instruct the model to NOT include a trailing Reference_Section at the end of its response.
4. THE System_Prompt SHALL instruct the model to only cite sources that are numbered in the provided context block.

### Requirement 4: Preserve Multi-Turn Conversation Context

**User Story:** As a student having a multi-message conversation, I want the chatbot to remember earlier messages, so that follow-up questions are answered in context.

#### Acceptance Criteria

1. WHEN the chat request contains multiple messages in `messages[]`, THE Chat_Handler SHALL include prior conversation turns in the Converse_Step message history.
2. THE Chat_Handler SHALL format prior messages using Bedrock Converse API's `messages` array structure with `role` and `content` fields.
3. THE Chat_Handler SHALL use only the latest user message as the retrieval query for the Retrieve_Step.

### Requirement 5: Preserve Language Support

**User Story:** As a Spanish-speaking student, I want to receive answers in Spanish when I write in Spanish, so that I can understand the chatbot's responses.

#### Acceptance Criteria

1. THE System_Prompt SHALL instruct the model to respond in Spanish when the user writes in Spanish.
2. THE System_Prompt SHALL instruct the model to use retrieved English sources to inform Spanish answers.

### Requirement 6: Post-Processing Safety Nets

**User Story:** As a developer, I want safety-net post-processing to remain active, so that any model-generated reference sections are stripped before the response is delivered.

#### Acceptance Criteria

1. WHEN the Converse_Step returns an answer, THE Chat_Handler SHALL apply the `stripReferenceSection` function to remove any trailing Reference_Section before returning the response.
2. THE Chat_Handler SHALL preserve the existing `stripReferenceSection` logic without modification.

### Requirement 7: Preserve Existing Code Paths

**User Story:** As a developer, I want to ensure that existing working code paths are unaffected by this change, so that file uploads and health checks continue to work.

#### Acceptance Criteria

1. THE Chat_Handler SHALL continue to route file upload requests (with `body.file` containing `content` and `mime_type`) to the existing `handleFileChat` function without modification.
2. WHEN a GET request is received at `/api/v1/health`, THE handler SHALL return a health status response.
3. THE `handleFileChat` function SHALL NOT be modified by this feature.

### Requirement 8: Error Handling for Retrieve + Converse

**User Story:** As a student, I want clear error messages when something goes wrong, so that I know to try again rather than receiving a broken response.

#### Acceptance Criteria

1. IF the Retrieve_Step fails, THEN THE Chat_Handler SHALL return a 502 response with a descriptive error message including the error code.
2. IF the Converse_Step fails, THEN THE Chat_Handler SHALL return a 502 response with a descriptive error message including the error code.
3. IF the Retrieve_Step or Converse_Step exceeds 30 seconds, THEN THE Chat_Handler SHALL abort the request and return a 504 timeout response.

### Requirement 9: Session ID Continuity

**User Story:** As a student in an ongoing conversation, I want my session to be tracked consistently, so that the backend can maintain context across requests.

#### Acceptance Criteria

1. WHEN the chat request includes a `session_id`, THE Chat_Handler SHALL return the same `session_id` in the response.
2. WHEN the chat request does not include a `session_id`, THE Chat_Handler SHALL generate a new UUID and return it as `session_id` in the response.

### Requirement 10: Remove Dead Citation Extraction Code

**User Story:** As a developer, I want to remove code that is no longer used after the migration, so that the codebase stays clean and maintainable.

#### Acceptance Criteria

1. WHEN the migration to Retrieve + Converse is complete, THE Chat_Handler SHALL NOT call `extractCitationsFromRAG` in the non-file chat code path.
2. THE Chat_Handler MAY retain `extractCitationsFromRAG` as an exported utility for backward compatibility or testing purposes.
