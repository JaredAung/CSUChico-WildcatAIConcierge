# Implementation Plan: Campus Navigation

## Overview

This plan implements opt-in geolocation and navigation intent detection for the Wildcat AI Concierge. The work is split into frontend hooks/components (TypeScript/React), a backend extraction utility and prompt changes (JavaScript ESM), and integration wiring. Each task builds incrementally so there is no orphaned code.

## Tasks

- [ ] 1. Create the useGeolocation hook and map link utility
  - [ ] 1.1 Implement `useGeolocation` hook (`frontend/lib/hooks/useGeolocation.ts`)
    - Create a React hook that wraps `navigator.geolocation.watchPosition()` and `clearWatch()`
    - Manage permission state via `navigator.permissions.query({ name: 'geolocation' })`
    - Persist enabled state in localStorage under key `wildcat-nav-location-enabled`
    - On mount with persisted enabled state, check permission before restoring watch
    - Expose `{ coords, permissionState, error, isLoading, enable, disable, isEnabled }` return interface
    - Include a 10-second timeout for initial position fix
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ] 1.2 Implement `buildMapLinks` utility (`frontend/lib/mapLinks.ts`)
    - Accept `destination: string` and optional `origin: { latitude, longitude } | null`
    - If destination does not contain "Chico" (case-insensitive), append ", Chico, CA"
    - URL-encode the final destination string
    - Construct Google Maps URL: `https://www.google.com/maps/dir/?api=1&destination={encoded}`
    - Construct Apple Maps URL: `https://maps.apple.com/?daddr={encoded}`
    - If origin provided, append `&origin={lat},{lng}` (Google) and `&saddr={lat},{lng}` (Apple)
    - Return `{ google: string, apple: string }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [ ] 1.3 Write property tests for `buildMapLinks`
    - **Property 4: Map link construction with Chico disambiguation**
    - **Property 5: Map link origin inclusion**
    - **Validates: Requirements 5.6, 5.1, 5.2, 5.3**

- [ ] 2. Build DirectionsCard and LocationToggle components
  - [ ] 2.1 Implement `DirectionsCard` component (`frontend/components/chat/DirectionsCard.tsx`)
    - Accept props `{ destination: string, userLocation?: { latitude, longitude } | null }`
    - Display destination name as heading
    - Render Google Maps and Apple Maps link buttons using `buildMapLinks`
    - Links open with `target="_blank"` and `rel="noopener noreferrer"`
    - When location unavailable, show helper text suggesting enabling the toggle
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.5_

  - [ ] 2.2 Implement `LocationToggle` component (`frontend/components/chat/LocationToggle.tsx`)
    - Render inline in the chat input bar, to the left of the language selector
    - Consume `useGeolocation` hook for state management
    - Visual states: disabled (default), loading (spinner), enabled (active indicator)
    - On permission denial, show non-blocking inline toast (auto-dismiss 5s)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ] 2.3 Write unit tests for DirectionsCard and LocationToggle
    - Test DirectionsCard renders with/without location, long destination names
    - Test LocationToggle visual state transitions (disabled → loading → enabled → disabled)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 1.1, 1.6, 1.7_

- [ ] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Backend prompt engineering and navigation extraction
  - [ ] 4.1 Add navigation intent prompt instructions (`backend/src/prompt.mjs`)
    - Append a "Navigation Intent" section to `AGENT_INSTRUCTIONS`
    - Include directional language triggers: "how do I get to," "take me to," "directions to," "walk to," "find my way to," "where is" + named destination
    - Instruct LLM to use official destination names from knowledge base
    - Instruct LLM to omit marker for general info queries without directional language
    - Instruct LLM to ask for clarification when destination is ambiguous
    - Instruct LLM to emit at most one `[[NAV:destination_name]]` marker as last line of response
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 4.2 Implement `extractNavigation` function (`backend/src/handler.mjs`)
    - Apply regex `/\[\[NAV:(.+?)\]\]/g` to raw LLM response text
    - If no match: return `{ cleanText: text, navigation: { wants_directions: false, destination_name: "" } }`
    - If match: extract destination from first capture group, trim whitespace
    - If destination is empty, whitespace-only, or exceeds 200 chars: treat as no intent
    - Strip ALL `[[NAV:...]]` occurrences from text regardless of validity
    - Return `{ cleanText, navigation: { wants_directions: true, destination_name } }`
    - Export the function for testing
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 4.3 Add user location validation and proximity context injection (`backend/src/handler.mjs`)
    - In `handleChat`, extract `user_location` from request body
    - Validate latitude (−90 to 90) and longitude (−180 to 180) are numeric and in range
    - If valid: append proximity context to system prompt with lat/lng values
    - If invalid or absent: skip — no proximity context injected
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ] 4.4 Write property tests for `extractNavigation`
    - **Property 1: Navigation marker extraction round-trip**
    - **Property 2: Absent marker yields no navigation intent**
    - **Property 3: Invalid destination treated as no intent**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [ ] 4.5 Write property test for user location validation
    - **Property 6: User location validation**
    - **Validates: Requirements 2.3, 2.4**

- [ ] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Wire location into chat request — frontend API layer
  - [ ] 6.1 Extend frontend types (`frontend/lib/types.ts`)
    - Add optional `user_location: { latitude: number; longitude: number }` to `ChatRequest`
    - Add optional `navigation: { wants_directions: boolean; destination_name: string }` to `ChatResponse`
    - _Requirements: 2.1, 3.3, 4.1_

  - [ ] 6.2 Update `sendMessage` in API layer (`frontend/lib/api.ts`)
    - Accept optional `user_location` parameter and include it in the POST body when provided
    - Parse `navigation` field from response and return it to the caller
    - _Requirements: 2.1_

  - [ ] 6.3 Integrate location and navigation in chat page (`frontend/app/chat/page.tsx`)
    - Instantiate `useGeolocation` hook in the chat page
    - Pass `coords` to `sendMessage` when the hook is enabled
    - Render `LocationToggle` in the chat input bar
    - _Requirements: 1.1, 2.1_

- [ ] 7. Render DirectionsCard in the message flow
  - [ ] 7.1 Integrate DirectionsCard rendering (`frontend/app/chat/page.tsx`)
    - After each assistant message, check if response contains `navigation.wants_directions === true`
    - If true, render `DirectionsCard` below the message with `destination` and current `userLocation`
    - If false or absent, render nothing
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 7.2 Wire backend response — call `extractNavigation` and include navigation in response (`backend/src/handler.mjs`)
    - After receiving LLM response, call `extractNavigation` on the raw text
    - Use `cleanText` as the answer returned to the client
    - Include `navigation` field in the JSON response
    - _Requirements: 3.3, 3.4, 6.1, 6.2, 6.3_

  - [ ] 7.3 Write integration tests for end-to-end navigation flow
    - Test: chat request with `user_location` → proximity context in prompt
    - Test: mocked LLM response with `[[NAV:...]]` → navigation field in API response, marker stripped
    - Test: frontend renders DirectionsCard when `wants_directions: true`
    - _Requirements: 2.2, 3.3, 4.1_

- [ ] 8. Final checkpoint — end-to-end integration and polish
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Frontend uses TypeScript/React; backend uses JavaScript ESM (`.mjs`)
- `fast-check` is used for property-based tests (already in devDependencies)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "4.1"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2", "4.2", "4.3"] },
    { "id": 2, "tasks": ["2.3", "4.4", "4.5", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3"] },
    { "id": 4, "tasks": ["7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3"] }
  ]
}
```
