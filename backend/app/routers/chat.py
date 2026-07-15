"""
Chat router — main conversational endpoint for the Wildcat AI Concierge.
"""
from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import APIRouter, HTTPException, Request

from app.models import (
    ChatRequest,
    ChatResponse,
    Department,
    Source,
)
from app.routers.knowledge import _DEPARTMENTS
from app.workflow_engine import get_workflow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Helper — metadata dict → Source model
# ---------------------------------------------------------------------------

def _meta_to_source(meta: dict, excerpt: str = "") -> Source:
    doc_type = meta.get("type", "website")
    if doc_type not in {"website", "pdf", "policy", "faq"}:
        doc_type = "website"
    return Source(
        title=meta.get("title", "Campus Resource"),
        url=meta.get("url", ""),
        excerpt=excerpt[:300] if excerpt else meta.get("title", ""),
        type=doc_type,
    )


# ---------------------------------------------------------------------------
# Helper — keyword-based fallback department routing
# ---------------------------------------------------------------------------

_DEPT_KEYWORDS: dict[str, List[str]] = {
    "Financial Aid Office": ["financial aid", "fafsa", "scholarship", "grant", "loan", "tuition"],
    "Admissions Office": ["apply", "admission", "application", "transfer", "freshmen"],
    "Office of the Registrar": ["register", "registration", "transcript", "graduation", "enroll"],
    "Accessibility Resource Center (ARC)": ["accommodation", "disability", "arc", "accessibility"],
    "Student Health Services": ["health", "medical", "counseling", "mental health", "sick"],
    "Housing & Residence Life": ["housing", "dorm", "residence", "room", "hall"],
    "University Parking Services": ["parking", "permit", "lot", "park"],
    "Career Center": ["career", "job", "internship", "resume", "interview"],
    "Meriam Library": ["library", "research", "book", "journal", "study room"],
    "Information Technology (ITSS)": ["it", "wifi", "portal", "canvas", "email", "password"],
}


def _route_to_departments(question: str) -> List[Department]:
    """Return departments whose keywords match the question."""
    q_lower = question.lower()
    matched: List[Department] = []
    for dept in _DEPARTMENTS:
        keywords = _DEPT_KEYWORDS.get(dept.name, [])
        if any(kw in q_lower for kw in keywords):
            matched.append(dept)
    return matched[:3]  # cap at 3 departments


# ---------------------------------------------------------------------------
# POST /chat
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=ChatResponse,
    summary="Send a message and receive an AI-generated answer",
)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """
    Main chat endpoint.

    1. Extracts the latest user message.
    2. Runs RAG retrieval to find relevant knowledge-base chunks.
    3. Detects workflow intent and attaches a WorkflowCard if applicable.
    4. Falls back to keyword-based department routing on errors.
    5. Returns a structured ChatResponse.
    """
    # Resolve session id
    session_id = body.session_id or str(uuid.uuid4())

    # Extract the latest user turn
    user_messages = [m for m in body.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=422, detail="No user message found in messages list.")
    question = user_messages[-1].content.strip()

    # Build chat history for context (exclude the last user message)
    history = [
        {"role": m.role, "content": m.content}
        for m in body.messages[:-1]
        if m.role in {"user", "assistant"}
    ]

    try:
        # Retrieve RAG engine from app state (set during lifespan startup)
        rag_engine = request.app.state.rag_engine

        # Query the RAG engine
        answer, raw_metadatas, confidence, language = rag_engine.query(question, history)

        # Convert metadata dicts to Source models (pair with document text when available)
        sources: List[Source] = [
            _meta_to_source(meta, meta.get("title", ""))
            for meta in raw_metadatas
            if meta
        ]

        # Detect workflow intent
        workflow_type = rag_engine.detect_workflow_intent(question)
        workflow = get_workflow(workflow_type) if workflow_type else None

        # Department routing (always attach relevant departments)
        departments = _route_to_departments(question)

        return ChatResponse(
            answer=answer,
            sources=sources,
            departments=departments,
            workflow=workflow,
            confidence=round(confidence, 4),
            session_id=session_id,
            detected_language=language,
        )

    except Exception as exc:  # noqa: BLE001
        logger.exception("RAG query failed for session %s: %s", session_id, exc)

        # Graceful fallback — department routing only
        fallback_departments = _route_to_departments(question)
        fallback_answer = (
            "I'm having trouble retrieving information right now. "
            "Here are the campus departments that may be able to help you:"
        )
        if not fallback_departments:
            fallback_answer = (
                "I'm experiencing a technical issue. Please visit csuchico.edu "
                "or call the main campus line at (530) 898-6116 for assistance."
            )

        return ChatResponse(
            answer=fallback_answer,
            sources=[],
            departments=fallback_departments,
            workflow=None,
            confidence=0.0,
            session_id=session_id,
            detected_language="en",
        )
