"""
Wildcat AI Concierge — FastAPI application entry point.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.rag_engine import get_rag_engine
from app.routers import chat as chat_router
from app.routers import knowledge as knowledge_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — initialise / tear down heavy resources
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialise the RAG engine on startup; clean up on shutdown."""
    settings = get_settings()
    logger.info(
        "Starting %s v%s  [dev_mode=%s]",
        settings.app_name,
        settings.app_version,
        settings.dev_mode,
    )

    engine = get_rag_engine()
    try:
        engine.initialize()
        logger.info("RAG engine initialised successfully.")
    except Exception as exc:  # noqa: BLE001
        logger.error("RAG engine failed to initialise: %s — running in degraded mode.", exc)

    # Attach to app state so routers can access it via request.app.state
    app.state.rag_engine = engine

    yield  # application is running

    logger.info("Shutting down %s.", settings.app_name)


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "AI-powered campus concierge for California State University, Chico. "
            "Answers student and staff questions using RAG over the CSU Chico "
            "knowledge base and provides step-by-step workflow guidance."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ─────────────────────────────────────────────────────────────
    app.include_router(chat_router.router, prefix="/api/v1")
    app.include_router(knowledge_router.router, prefix="/api/v1")

    # ── Health check ────────────────────────────────────────────────────────
    @app.get("/health", tags=["health"], summary="Service health check")
    async def health_check() -> JSONResponse:
        mode = "dev" if (settings.dev_mode or not settings.bedrock_configured) else "prod"
        return JSONResponse(
            content={
                "status": "ok",
                "version": settings.app_version,
                "mode": mode,
            }
        )

    @app.get("/api/v1/health", tags=["health"], summary="Versioned health check")
    async def health_check_versioned() -> JSONResponse:
        mode = "dev" if (settings.dev_mode or not settings.bedrock_configured) else "prod"
        return JSONResponse(
            content={
                "status": "ok",
                "version": settings.app_version,
                "mode": mode,
            }
        )

    return app


# ---------------------------------------------------------------------------
# Application instance (imported by uvicorn)
# ---------------------------------------------------------------------------
app = create_app()
