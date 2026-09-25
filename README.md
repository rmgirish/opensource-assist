# Open Source Assist — System Documentation

Welcome to the comprehensive technical documentation for the **Open Source Assist** semantic search and repository discovery module.

This module provides an asynchronous, high-throughput semantic search engine that indexes open-source software repositories into **Qdrant Vector Database** and re-ranks results using a **Multiplicative Gate** popularity weighting algorithm.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| **[1. Architecture & Design](doc/search_module/architecture.md)** | System architecture, separation of concerns, concurrency model, Python GIL avoidance, and Qdrant Server topology. |
| **[2. Search & Ranking Engine](doc/search_module/search_and_ranking.md)** | Mathematical formulation of semantic similarity, logarithmic popularity normalization, and the Strategy pattern. |
| **[3. Teammate Integration Guide](doc/integration/search_integration_backend.md)** | Integration guide for teammate modules (Ingestion, RAG, and Auth hooks). |
| **[4. Deployment & Operations](doc/deployment_and_operations.md)** | Docker Compose configuration, Qdrant Cloud deployment, environment configuration, database seeding, and testing with `uv`. |
| **[5. API Contract & Changelog](API_CONTRACT.md)** | Formal versioned API contracts, HTTP endpoints, status codes, and request/response JSON schemas. |

---

## 🚀 Key Features Overview

* **Dense Semantic Search**: Natural language query understanding powered by local 384-dimensional embeddings (`FastEmbed` / `bge-small-en-v1.5`), eliminating external embedding API costs and latency.
* **Logarithmic Popularity Normalization**: Dampens steep Power-Law star and fork distributions so massive projects do not swamp emerging or mid-sized repositories.
* **Multiplicative Gate Ranking**:
  $$\text{FinalScore} = S_{\text{semantic}} \times (1 + \alpha \cdot P_{\text{popularity}})$$
  Guarantees semantic relevance remains mandatory while popular and battle-tested repositories receive a proportionate boost.
* **Extensible Strategy Pattern**: Decoupled ranking engine (`ScoringStrategy`) allowing new heuristics (Linear Hybrid, Reciprocal Rank Fusion) to be plugged in dynamically.
* **Production-Grade Qdrant Server**:
  * Standalone client architecture communicating strictly via HTTP REST and gRPC.
  * Zero file-lock contentions between multiple Uvicorn workers or teammate ingestion scripts.
  * HNSW vector indexing with Cosine distance and microsecond payload indexing (`language`, `license`, `topics`, `stars`).
* **Clean Architecture & Strict Typings**:
  * 100% asynchronous Python 3.12+ code managed with `uv`.
  * Routers contain zero business logic.
  * Pydantic v2 models with explicit `Field` documentation for OpenAPI contract generation.
  * Built-in health check and cluster readiness probes.

## Authentication

The backend includes PostgreSQL-backed authentication routes under the versioned API prefix:

* `POST /api/v1/auth/signup`
* `POST /api/v1/auth/login`
* `POST /api/v1/auth/forgot-password`
* `POST /api/v1/auth/reset-password`

Copy `.env.example` to `.env`, set `DATABASE_URL` and a long random `JWT_SECRET_KEY`, then apply the schema migration with:

```powershell
uv run alembic upgrade head
uv run uvicorn backend.main:app --reload
```

Reset codes expire after five minutes, are persisted as HMAC digests, and are single-use. Email delivery is currently represented by the mock mailer in `backend/scripts/mailer.py`.

