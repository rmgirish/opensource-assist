"""FastAPI main application entrypoint for open-source-assist."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.core.config import settings
from backend.core.database import engine
from backend.services.qdrant_service import qdrant_service
from backend.api.routes.search import router as search_router
from backend.api.routes.learning import router as learning_router
from backend.api.routes.chatbot import router as chatbot_router
from backend.api.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context manager for startup and shutdown hooks."""
    # Startup: Ensure Qdrant collection and payload indexes exist
    try:
        await qdrant_service.ensure_collection_exists()
    except Exception as exc:
        # In testing or standalone offline environments, allow graceful continuation
        print(f"Notice: Qdrant startup collection check: {exc}")

    yield

    # Shutdown: Cleanly close client connections and DB connection pool
    await qdrant_service.close()
    await engine.dispose()


app = FastAPI(
    title="Open Source Assist API",
    version="0.1.0",
    description=(
        "Production-grade backend for semantic search, exploration, and mentorship "
        "across open-source repositories using Qdrant vector database and AI workflows."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware for frontend React / Vite client
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ALLOW_ORIGINS.split(",")],
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(search_router, prefix=settings.API_V1_PREFIX)
app.include_router(learning_router, prefix=settings.API_V1_PREFIX)
app.include_router(chatbot_router, prefix=settings.API_V1_PREFIX)
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Health check endpoint for container orchestrators and load balancers."""
    return {"status": "healthy", "service": "open-source-assist-backend"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=settings.SERVER_RELOAD,
    )
