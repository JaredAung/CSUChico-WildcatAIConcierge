"""
Pydantic models for the Wildcat AI Concierge API.
"""
from __future__ import annotations

import uuid
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ── Primitive building blocks ─────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """A single turn in a conversation."""
    role: Literal["user", "assistant", "system"] = Field(
        ..., description="Message author: 'user', 'assistant', or 'system'"
    )
    content: str = Field(..., min_length=1, description="Message text")


class Source(BaseModel):
    """A knowledge-base document chunk returned alongside an answer."""
    title: str = Field(..., description="Human-readable document title")
    url: str = Field(default="", description="Link to the original resource")
    excerpt: str = Field(..., description="Relevant snippet from the document")
    type: Literal["website", "pdf", "policy", "faq"] = Field(
        default="website", description="Document category"
    )


class Department(BaseModel):
    """CSU Chico campus department contact information."""
    name: str = Field(..., description="Official department name")
    phone: str = Field(default="", description="Main contact phone number")
    email: str = Field(default="", description="Primary contact email")
    website: str = Field(default="", description="Department website URL")
    office: str = Field(default="", description="Campus building / room")


# ── Workflow models ───────────────────────────────────────────────────────────

class WorkflowStep(BaseModel):
    """One step in a multi-step campus process."""
    step_number: int = Field(..., ge=1)
    title: str = Field(..., description="Short step name")
    description: str = Field(..., description="What the student/staff must do")
    status: Literal["pending", "in_progress", "completed"] = Field(default="pending")
    forms: List[str] = Field(default_factory=list, description="Required form names or IDs")
    department: str = Field(..., description="Responsible campus department")


class WorkflowCard(BaseModel):
    """A complete multi-step workflow presented to the user."""
    title: str = Field(..., description="Workflow title, e.g. 'Facility Rental Process'")
    steps: List[WorkflowStep] = Field(..., min_length=1)
    estimated_days: str = Field(..., description="Typical turnaround, e.g. '10-14 business days'")
    required_forms: List[str] = Field(default_factory=list)
    responsible_offices: List[str] = Field(default_factory=list)


# ── Request / Response ────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Incoming chat payload from the frontend."""
    messages: List[ChatMessage] = Field(..., min_length=1)
    session_id: Optional[str] = Field(
        default=None,
        description="Opaque session identifier; generated server-side if omitted",
    )


class ChatResponse(BaseModel):
    """Full response returned by the /chat endpoint."""
    answer: str = Field(..., description="AI-generated answer text")
    sources: List[Source] = Field(default_factory=list)
    departments: List[Department] = Field(default_factory=list)
    workflow: Optional[WorkflowCard] = Field(
        default=None, description="Step-by-step workflow card when applicable"
    )
    confidence: float = Field(..., ge=0.0, le=1.0, description="Retrieval confidence score")
    session_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Session identifier echoed back (or newly generated)",
    )
    detected_language: str = Field(
        default="en",
        description="Detected language of the user's message: 'en' or 'es'",
    )


# ── Knowledge endpoint models ─────────────────────────────────────────────────

class SuggestedQuestionsResponse(BaseModel):
    questions: List[str]


class DepartmentsResponse(BaseModel):
    departments: List[Department]
