# Challenge Overview: Wildcat AI Concierge — Conversational access to campus services, policies, and facility resources

## Project Objectives
- Deliver a single conversational interface that answers campus service questions and guides users through processes end-to-end.
- Enable self-service for accommodation requests, event participation, and facility rental workflows, including forms, deadlines, fees, and approvals.
- Improve experience for students, families/visitors, employees, individuals with disabilities, and community members by surfacing hard-to-find information in plain language.
- Reduce calls/emails for basic process info, lower facility-reservation abandonment, and cut time to locate forms and answers.
- Leave room to grow toward well-being/basic-needs guidance and multilingual (Spanish) support without a rewrite.

## Current Workflow
- Information is fragmented across multiple Chico State websites, department pages, and reservation systems.
- Users hunt across offices (ARC, ADA, University Public Engagement, Risk Management, Facilities, Event Services, Athletics) to complete tasks.
- Users rely on Google searches or contacting numerous offices, often without knowing the correct terminology.
- Manual artifacts: PDF forms, policy documents, FAQs, event cost/registration docs maintained outside the website.
- A separate reservation system exists for events; Concept3D (Google-based) provides campus map data.

## Key Pain Points
- Critical services (e.g., ASL interpreter requests) are not discoverable via normal search and require insider terminology.
- Facility rental processes (fees, insurance, approvals, responsible office) are buried, requiring tribal knowledge to navigate.
- Users spend significant time searching, sifting, and escalating across departments to reach the right contact.
- High volume of repetitive, plain-language questions from students, families, and community members that could be self-served.
- Information lives in disparate systems and PDFs, not centralized or API-accessible (e.g., map/reservation data).

## Ideal Solution Vision
- A public-facing conversational chatbot (web/mobile), no authentication required, with intelligent routing to the correct office when data is incomplete — addresses discoverability and escalation pain points.
- Example: "I'm deaf and want to attend a concert at Laxson Auditorium — how do I request an interpreter?" → identifies event, explains accommodation process, timelines, contacts, and links to request forms.
- RAG over vetted campus content: policies, forms, FAQs, event docs, and scraped website content, with source-linked answers.
- Optional surfaces: step-by-step checklists for facility rentals; quick answers for high-frequency questions (e.g., nearest accessible restroom, dining).
- Extension path: Spanish translation, well-being/basic-needs concierge, and dynamic map queries via Concept3D/Localist API (stretch) — supports the plain-language, multilingual objective.

## Data Availability
- Primary sources: Chico State public websites (scrapable) plus high-quality PDF documentation for event registration, costs, and facility rental not available online (to be provided by sponsor).
- Supplementary: top 5–10 high-frequency questions with vetted answers and their source locations (to be provided for RAG calibration); ARC/ADA accommodation procedures; Risk Management requirements.
- Human resources: SMEs from participating departments; sponsor to support production hand-off.
- Known gaps/restricted data: event reservation system and Concept3D map data require programmatic/API access (temporary access key possible) — treat map-based queries as a stretch goal.