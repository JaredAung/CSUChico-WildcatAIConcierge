# Requirements Document

## Introduction

Campus Navigation & Location Sharing adds opt-in geolocation capabilities to the Wildcat AI Concierge. When users enable location sharing, their coordinates enrich all LLM responses with proximity context (nearest services, walking distances). Independently, the LLM detects navigation intent from conversation and the system surfaces actionable Google Maps and Apple Maps links via a DirectionsCard component. These two concerns — location enrichment and navigation intent — are orthogonal: directions work without location (no origin), and location enrichment works without navigation intent.

## Glossary

- **Concierge**: The Wildcat AI Concierge chat system (frontend + backend) that answers campus questions
- **Location_Toggle**: A persistent UI control in the chat input bar allowing users to opt in or out of sharing their browser geolocation
- **DirectionsCard**: A UI component rendered below a chat message that displays actionable map links to a destination
- **Navigation_Marker**: A structured token `[[NAV:destination_name]]` embedded by the LLM in its response text to signal navigation intent
- **Navigation_Field**: A structured JSON field `navigation: { wants_directions: boolean, destination_name: string }` returned by the backend API in the chat response
- **Chat_Backend**: The AWS Lambda function handling POST /api/v1/chat requests with Bedrock integration
- **Map_Link**: A URL pointing to Google Maps or Apple Maps with destination (and optionally origin) parameters
- **User_Location**: A JSON object `{ latitude: number, longitude: number }` representing the user's current coordinates

## Requirements

### Requirement 1: Location Opt-In Toggle

**User Story:** As a user, I want a persistent toggle to share my location, so that the concierge can provide proximity-aware answers without asking me each time.

#### Acceptance Criteria

1. THE Location_Toggle SHALL render in the chat input bar immediately to the left of the language selector, and SHALL visually indicate whether it is in the enabled or disabled state
2. WHEN the user activates the Location_Toggle, THE Concierge SHALL request browser geolocation permission via the Geolocation API
3. WHEN the browser grants geolocation permission, THE Location_Toggle SHALL persist the enabled state in localStorage and transition to the enabled visual state
4. WHEN the user deactivates the Location_Toggle, THE Concierge SHALL stop sending User_Location with chat requests and remove the stored state from localStorage
5. WHEN the page loads with a previously persisted enabled state, THE Location_Toggle SHALL check the current browser geolocation permission status before restoring; IF permission is still granted, THEN THE Location_Toggle SHALL restore the enabled state and resume geolocation tracking without re-prompting the user; IF permission has been revoked, THEN THE Location_Toggle SHALL revert to the disabled state and remove the persisted state from localStorage
6. IF the browser denies geolocation permission, THEN THE Location_Toggle SHALL revert to the disabled state and display a non-blocking inline message near the toggle indicating that geolocation permission was denied, visible for 5 seconds before automatically dismissing
7. WHILE the Concierge is awaiting the browser geolocation permission prompt or acquiring the initial position fix, THE Location_Toggle SHALL display a loading indicator and remain non-interactive until the permission result or position is received or a timeout of 10 seconds elapses

### Requirement 2: Location-Enriched Chat Requests

**User Story:** As a user with location sharing enabled, I want every chat response to be aware of my proximity, so that I receive relevant nearby recommendations without explicitly asking for directions.

#### Acceptance Criteria

1. WHILE the Location_Toggle is enabled, THE Concierge SHALL include the User_Location object in every POST /api/v1/chat request payload
2. WHILE User_Location is present in the chat request with latitude in the range -90 to 90 and longitude in the range -180 to 180, THE Chat_Backend SHALL append a proximity context segment to the LLM prompt that includes the user's latitude and longitude values and instructs the LLM to prefer nearby places and include estimated walking distances when recommending locations or services
3. WHILE User_Location is absent from the chat request, THE Chat_Backend SHALL omit proximity context from the LLM prompt and respond without location-aware enrichment
4. IF User_Location is present but contains latitude outside -90 to 90 or longitude outside -180 to 180 or non-numeric values, THEN THE Chat_Backend SHALL discard the User_Location, omit proximity context from the LLM prompt, and process the request as if User_Location were absent

### Requirement 3: Navigation Intent Detection

**User Story:** As a user asking how to get somewhere, I want the system to detect my intent and offer directions, so that I receive actionable map links without extra steps.

#### Acceptance Criteria

1. WHEN the user's message expresses intent to travel to, get directions to, find the route to, or physically reach a campus location or local place, THE LLM SHALL include a Navigation_Marker in its response text in the format `[[NAV:destination_name]]`
2. WHEN the user's message asks general information about a place without expressing intent to physically travel there, THE LLM SHALL omit the Navigation_Marker from its response
3. THE Chat_Backend SHALL extract the Navigation_Marker from the LLM response text, strip it from the answer returned to the client, and populate the Navigation_Field in the API response as `{ wants_directions: true, destination_name: "<extracted_value>" }` where extracted_value is the destination_name captured from the marker
4. WHEN no Navigation_Marker is present in the LLM response, THE Chat_Backend SHALL return the Navigation_Field as `{ wants_directions: false, destination_name: "" }`
5. IF the extracted destination_name exceeds 200 characters, THEN THE Chat_Backend SHALL truncate it to 200 characters before populating the Navigation_Field

### Requirement 4: DirectionsCard Rendering

**User Story:** As a user who asked for directions, I want to see clickable map links below the response, so that I can open navigation in my preferred maps app with one tap.

#### Acceptance Criteria

1. WHEN the API response contains a Navigation_Field with `wants_directions: true`, THE Concierge SHALL render a DirectionsCard below the associated chat message
2. WHEN the API response contains a Navigation_Field with `wants_directions: false`, THE Concierge SHALL not render a DirectionsCard
3. THE DirectionsCard SHALL display the destination_name as a heading, followed by a Google Maps link and an Apple Maps link that each open in a new browser tab, using the destination_name as the destination query parameter
4. WHILE User_Location is available, THE DirectionsCard SHALL include the user's coordinates as the origin parameter in both Map_Links
5. WHILE User_Location is not available, THE DirectionsCard SHALL omit the origin parameter from the Map_Links and display a text message indicating the user can enable the Location_Toggle for personalized directions

### Requirement 5: Map Link Construction

**User Story:** As a user tapping a map link, I want to be taken directly to a navigation view in Google Maps or Apple Maps, so that I can start walking directions immediately.

#### Acceptance Criteria

1. THE Concierge SHALL construct the Google Maps link using the format `https://www.google.com/maps/dir/?api=1&destination={destination_name}` with the destination_name URL-encoded
2. THE Concierge SHALL construct the Apple Maps link using the format `https://maps.apple.com/?daddr={destination_name}` with the destination_name URL-encoded
3. WHILE User_Location is available, THE Concierge SHALL append `&origin={latitude},{longitude}` to the Google Maps link and `&saddr={latitude},{longitude}` to the Apple Maps link
4. THE Concierge SHALL pass destination_name as a human-readable string to the maps services without performing geocoding
5. THE Map_Links SHALL open in a new browser tab with `target="_blank"` and `rel="noopener noreferrer"` attributes
6. IF the destination_name does not contain the substring "Chico", THEN THE Concierge SHALL append ", Chico, CA" to the destination_name before URL-encoding to improve Maps disambiguation

### Requirement 6: Navigation Marker Extraction

**User Story:** As a developer, I want the backend to reliably parse the LLM's navigation signal, so that the frontend receives clean structured data.

#### Acceptance Criteria

1. THE Chat_Backend SHALL detect the Navigation_Marker using the regex pattern `\[\[NAV:(.+?)\]\]` applied to the raw LLM response text
2. WHEN multiple Navigation_Markers are present, THE Chat_Backend SHALL extract the destination_name from the first occurrence, populate the Navigation_Field with `wants_directions: true` and that destination_name, and ignore subsequent markers
3. THE Chat_Backend SHALL remove all Navigation_Marker occurrences from the answer text before returning it to the client
4. IF the extracted destination_name is an empty string, contains only whitespace, or exceeds 200 characters, THEN THE Chat_Backend SHALL treat it as no navigation intent and return the Navigation_Field as `{ wants_directions: false, destination_name: "" }`
5. WHEN a valid Navigation_Marker is extracted, THE Chat_Backend SHALL return the Navigation_Field as `{ wants_directions: true, destination_name: "<extracted value trimmed of leading and trailing whitespace>" }` in the API response

### Requirement 7: Geolocation Hook Behavior

**User Story:** As a developer, I want a reusable geolocation hook that manages permission state and coordinate updates, so that location logic is encapsulated and testable.

#### Acceptance Criteria

1. WHILE the useGeolocation hook is mounted and enabled, THE useGeolocation hook SHALL register a browser watchPosition watcher to receive coordinate updates
2. WHEN the hook receives its first position update, THE useGeolocation hook SHALL transition from a null-coordinates state to exposing the latitude and longitude values in its return object
3. WHEN the hook is active and receives a subsequent position update, THE useGeolocation hook SHALL replace the previously exposed latitude and longitude with the latest values in its return object
4. THE useGeolocation hook SHALL expose a permission state value in its return object that reflects the current Geolocation API permission status as one of: "granted", "denied", or "prompt"
5. WHEN the hook is disabled or the consuming component unmounts, THE useGeolocation hook SHALL call clearWatch to stop tracking and release geolocation resources
6. IF the watchPosition API reports a PositionError, THEN THE useGeolocation hook SHALL expose the error object in its return value and retain the last successfully received coordinates
7. IF the watchPosition API reports a PositionError and no coordinates have been previously received, THEN THE useGeolocation hook SHALL expose the error object and maintain null coordinates in its return value

### Requirement 8: LLM Prompt Engineering for Navigation

**User Story:** As a developer, I want clear prompt instructions that teach the LLM when to emit the navigation marker, so that detection accuracy is high without false positives.

#### Acceptance Criteria

1. THE Chat_Backend SHALL include prompt instructions directing the LLM to append `[[NAV:destination_name]]` as the last line of its response when the user's message contains explicit directional language such as "how do I get to," "take me to," "directions to," "walk to," "find my way to," or "where is" combined with a named destination
2. THE prompt instructions SHALL direct the LLM to omit the Navigation_Marker when the user asks about a place's hours, services, policies, events, or contact information without using directional language indicating a desire to physically travel there
3. THE prompt instructions SHALL direct the LLM to use the official name of the destination as it appears in knowledge base documents or the campus map (e.g., "Meriam Library" not "library building," "Bell Memorial Union" not "the student union")
4. IF the user's message expresses navigation intent but does not identify a resolvable destination name (e.g., "How do I get to the nearest bathroom?" or "Take me to that place"), THEN THE Chat_Backend prompt instructions SHALL direct the LLM to omit the Navigation_Marker and instead ask the user to clarify the specific destination
5. THE prompt instructions SHALL direct the LLM to emit the Navigation_Marker for queries starting with "Where is" followed by a specific named location, treating these as navigation intent
