# Implementation Plan: Retrieve + Converse Citations

## Overview

Replace the `RetrieveAndGenerate` single-call approach in `handleChat` with a two-step Retrieve → Converse → Post-process flow. This involves updating the system prompt to instruct the model to emit `[N]` citation markers, implementing helper functions for retrieval/context assembly/source building, rewriting `handleChat` to orchestrate the new flow, and cleaning up diagnostic logging.

## Tasks

- [x] 1. Update system prompt for inline citations
  - [x] 1.1 Modify `prompt.mjs` to update citation instructions
    - Remove the line `"Do NOT generate numbered citation markers like [1], [2], etc."`
    - Add instructions for the model to place `[N]` markers inline after sentences using info from `[Source N]`
    - Keep the anti-reference-section instruction
    - Add instruction to only cite source numbers that appear in the provided context block
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.1, 5.2_

- [x] 2. Implement helper functions in `handler.mjs`
  - [x] 2.1 Implement `extractRetrievalQuery(messages)`
    - Export the function so it can be tested
    - Extract the latest user message text from the messages array
    - Return trimmed string; return empty string if no user messages exist
    - _Requirements: 4.3_

  - [x] 2.2 Implement `buildSources(chunks)`
    - Export the function so it can be tested
    - Map retrieved chunks to Source_Object format with `title`, `url`, `citation_index`, `chunk_text`, `domain_label`, `excerpt`, `relevance_score`
    - Deduplicate by normalized URL using the existing `normalizeUrl` helper
    - Assign `citation_index` matching the chunk's 1-based position
    - Use `deriveDomainLabel` and `buildTextFragment` for URL enrichment
    - Truncate `chunk_text` and `excerpt` to 400 characters
    - Handle S3 URI fallback to metadata web URL fields
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 2.3 Implement `buildContextBlock(chunks)`
    - Export the function so it can be tested
    - Format chunks as `[Source 1]: <text>\n\n[Source 2]: <text>\n\n...`
    - Return empty string if chunks array is empty
    - _Requirements: 1.2_

  - [x] 2.4 Implement `buildConverseMessages(messages, contextBlock)`
    - Export the function so it can be tested
    - Transform client message history into Bedrock Converse API format: `{role, content: [{text}]}`
    - Augment the final user message with the KB context block prepended
    - Ensure messages alternate user/assistant as required by the Converse API
    - _Requirements: 4.1, 4.2_

  - [x] 2.5 Implement `retrieveChunks(query, options)`
    - Call `RetrieveCommand` with `knowledgeBaseId`, `retrievalQuery: { text: query }`, `numberOfResults: 5`
    - Accept optional `abortSignal` for timeout handling
    - Return the `retrievalResults` array from the response
    - _Requirements: 1.1_

  - [x] 2.6 Implement `converseWithModel(converseMessages, abortSignal)`
    - Call `ConverseCommand` with `modelId: CONVERSE_MODEL_ID`, `system: [{ text: AGENT_INSTRUCTIONS }]`, and the prepared messages
    - Extract and return the text content from the response
    - _Requirements: 1.3_

- [x] 3. Checkpoint - Verify helpers compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Write property-based tests for helper functions
  - [x] 4.1 Write property test for `buildContextBlock`
    - **Property 1: Context Block Numbering Consistency**
    - **Validates: Requirements 1.2**
    - Test file: `backend/src/handler.retrieve-converse.property.test.mjs`

  - [x] 4.2 Write property test for `buildSources` (URL deduplication)
    - **Property 2: Source Deduplication by Normalized URL**
    - **Validates: Requirements 2.1, 2.7**

  - [x] 4.3 Write property test for index consistency between context and sources
    - **Property 3: Citation Index Consistency Between Context and Sources**
    - **Validates: Requirements 2.2**

  - [x] 4.4 Write property test for chunk text truncation
    - **Property 4: Chunk Text Truncation Invariant**
    - **Validates: Requirements 2.5**

  - [x] 4.5 Write property test for `buildConverseMessages`
    - **Property 5: Multi-Turn Message Formatting Preserves All Turns**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 4.6 Write property test for `extractRetrievalQuery`
    - **Property 6: Retrieval Query Uses Only Latest User Message**
    - **Validates: Requirements 4.3**

  - [x] 4.7 Write property test for error responses
    - **Property 7: Error Responses Include Error Code**
    - **Validates: Requirements 8.1, 8.2**

  - [x] 4.8 Write property test for session ID passthrough
    - **Property 8: Session ID Passthrough**
    - **Validates: Requirements 9.1**

- [x] 5. Rewrite `handleChat` to use Retrieve + Converse flow
  - [x] 5.1 Replace `handleChat` internals with new orchestration
    - Remove the `RetrieveAndGenerateCommand` call
    - Remove requirement for `MODEL_ARN` in the precondition check (only `KNOWLEDGE_BASE_ID` needed)
    - Wire: `extractRetrievalQuery` → `retrieveChunks` → `buildSources` + `buildContextBlock` → `buildConverseMessages` → `converseWithModel` → `stripReferenceSection`
    - Add 30-second AbortController timeout wrapping both Retrieve and Converse calls
    - Handle zero-chunk case: still call Converse with just the user question
    - Return response shape: `{ answer, sources, session_id, model_used: "bedrock-converse:...", is_mock: false }`
    - Route file uploads to `handleFileChat` unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 7.1, 8.1, 8.2, 8.3, 9.1, 9.2, 10.1_

  - [x] 5.2 Update health endpoint to reflect new mode
    - Change status check from `KNOWLEDGE_BASE_ID && MODEL_ARN` to `KNOWLEDGE_BASE_ID` (MODEL_ARN no longer required for chat)
    - Update `mode` field to `"retrieve-and-converse"` or similar
    - _Requirements: 7.2_

- [x] 6. Checkpoint - Run all tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Remove diagnostic logging
  - [x] 7.1 Remove `CITATION_DEBUG` and `CITATION_RAW` console.log statements from `handleChat`
    - These were temporary diagnostics for the RetrieveAndGenerate flow and are no longer needed
    - _Requirements: 10.1_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The frontend requires zero changes — `preprocessCitationMarkers` already converts `[N]` to CitationBadge
- Deploy command: `cd backend && sam build && sam deploy --no-confirm-changeset`
- Test command: `cd backend/src && npx vitest run`
- The existing `handleFileChat` function serves as a reference implementation for the Retrieve + Converse pattern

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "2.6"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["4.7", "4.8", "7.1"] },
    { "id": 6, "tasks": [] }
  ]
}
```
