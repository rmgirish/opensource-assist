# API Contract Changelog

This document tracks all FastAPI endpoint contracts, request payloads, and response structures for the `open-source-assist` project.

---

## [v0.1.0] - 2026-09-21: Semantic Search & Ingestion Endpoints

### 1. Semantic Repository Search
* **Endpoint**: `POST /api/v1/search`
* **Status**: `200 OK`
* **Description**: Performs dense semantic similarity search over indexed open-source repositories using Qdrant vector database and reranks results using logarithmic popularity normalization combined with the Multiplicative Gate strategy.
* **Headers**:
  * `Content-Type: application/json`
  * `Authorization: Bearer <token>` (Optional)
* **Request Body** (`RepoSearchRequest`):
  ```json
  {
    "query": "lightweight async web framework for microservices",
    "popularity_weight": 0.3,
    "filters": {
      "language": "Python",
      "min_stars": 50,
      "license": "MIT",
      "topic": "fastapi"
    },
    "limit": 20,
    "offset": 0
  }
  ```
* **Response Body** (`RepoSearchResponse`):
  ```json
  {
    "query": "lightweight async web framework for microservices",
    "total": 1,
    "limit": 20,
    "offset": 0,
    "items": [
      {
        "repo_id": 89229960,
        "full_name": "tiangolo/fastapi",
        "html_url": "https://github.com/tiangolo/fastapi",
        "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
        "language": "Python",
        "stars": 75420,
        "forks": 6400,
        "open_issues": 412,
        "license": "MIT",
        "topics": ["fastapi", "asyncio", "python", "rest-api"],
        "pushed_at": "2026-09-20T14:32:00Z",
        "scores": {
          "semantic_score": 0.885,
          "popularity_score": 0.942,
          "final_score": 1.1351,
          "strategy": "MultiplicativeGateStrategy"
        }
      }
    ],
    "strategy": "MultiplicativeGateStrategy",
    "duration_ms": 14.82
  }
  ```

---

### 2. Batch Repository Ingestion (Internal)
* **Endpoint**: `POST /api/v1/internal/ingest`
* **Status**: `201 Created`
* **Description**: Sourcing/ingestion contract for indexing repository records into Qdrant. Computes dense embeddings and batch upserts points into the configured collection.
* **Request Body** (`BatchRepoIngestRequest`):
  ```json
  {
    "repositories": [
      {
        "repo_id": 89229960,
        "full_name": "tiangolo/fastapi",
        "html_url": "https://github.com/tiangolo/fastapi",
        "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
        "language": "Python",
        "stars": 75420,
        "forks": 6400,
        "open_issues": 412,
        "license": "MIT",
        "topics": ["fastapi", "asyncio", "python", "rest-api"],
        "pushed_at": "2026-09-20T14:32:00Z",
        "readme_summary": "High performance ASGI web framework built with Starlette and Pydantic."
      }
    ]
  }
  ```
* **Response Body** (`BatchRepoIngestResponse`):
  ```json
  {
    "inserted_count": 1,
    "collection_name": "open_source_repositories",
    "duration_ms": 182.4
  }
  ```

---

### 3. System Health Check
* **Endpoint**: `GET /health`
* **Status**: `200 OK`
* **Response**:
  ```json
  {
    "status": "healthy",
    "service": "open-source-assist-backend"
  }
  ```

---

## [v0.2.0] - 2026-09-22: AI Learning Materials & Citation Agent Endpoint

### 4. Skill-Tailored Online Learning Materials & Citations
* **Endpoint**: `POST /api/v1/learning/materials`
* **Status**: `200 OK`
* **Description**: Executes an AI Agent workflow powered by Gemini API (`gemini-3.5-flash`) and LangGraph to generate personalized step-by-step learning modules and citeable online resources.
* **Request Body** (`LearningMaterialRequest`):
  ```json
  {
    "topic": "FastAPI Async Microservices",
    "skill_level": "intermediate",
    "user_context": "2 years of Python background",
    "limit": 5
  }
  ```
* **Response Body** (`LearningMaterialResponse`):
  ```json
  {
    "topic": "FastAPI Async Microservices",
    "skill_level": "intermediate",
    "summary": "Curated Intermediate-level learning materials for FastAPI Async Microservices.",
    "modules": [],
    "cited_materials": [],
    "duration_ms": 142.5,
    "model_used": "gemini-3.5-flash"
  }
  ```

---

## [v0.3.0] - 2026-09-24: Skill-Aware AI Chatbot Endpoint

### 5. Skill-Calibrated Developer Q&A
* **Endpoint**: `POST /api/v1/chatbot/query`
* **Status**: `200 OK`
* **Description**: Executes a skill-aware Q&A agent workflow powered by LiteLLM (Gemini `gemini-3.5-flash`) and LangGraph. Calibrates explanation depth, code complexity, technical vocabulary, and citations strictly to the user's skill level, experience, tech stack, and learning goals.
* **Headers**:
  * `Content-Type: application/json`
  * `Authorization: Bearer <token>` (Optional)
* **Request Body** (`ChatbotRequest`):
  ```json
  {
    "question": "How do I implement async exception boundaries and context cleanup in FastAPI?",
    "skill_profile": {
      "skill_level": "intermediate",
      "tech_stack": ["Python", "FastAPI", "Docker"],
      "experience_years": 2.5,
      "learning_goals": ["Master microservice architecture and async error isolation"]
    }
  }
  ```
* **Response Body** (`ChatbotResponse`):
  ```json
  {
    "question": "How do I implement async exception boundaries and context cleanup in FastAPI?",
    "skill_level_used": "intermediate",
    "answer": "Here is an intermediate architectural breakdown addressing 'How do I implement async exception boundaries...'. Focusing on modular separation, async processing, and structured error boundaries.",
    "code_snippets": [
      {
        "language": "python",
        "code": "import asyncio\nimport logging\n\nlogger = logging.getLogger(__name__)\n\nasync def process_task(task_id: int) -> dict[str, str]:\n    logger.info(f'Executing task {task_id}')\n    await asyncio.sleep(0.1)\n    return {'status': 'completed', 'task_id': str(task_id)}",
        "explanation": "Demonstrates asynchronous function execution, non-blocking I/O, and structured logging."
      }
    ],
    "cited_references": [
      {
        "title": "Official Guide & Reference: How do I implement async exception boundar...",
        "url": "https://docs.reference.org/search?q=how+do+i+implement+async+exception+boundar...",
        "material_type": "official_docs",
        "difficulty_level": "intermediate",
        "snippet": "Official technical documentation and API reference.",
        "relevance_rationale": "Authoritative documentation adapted for Intermediate proficiency level.",
        "topics": ["Python", "FastAPI", "Docker"]
      }
    ],
    "suggested_followups": [
      "How can I handle concurrency limits and task cancellation gracefully?",
      "What are the best practices for unit testing this async handler?"
    ],
    "duration_ms": 115.4,
    "model_used": "gemini-3.5-flash"
  }
  ```

---

## [v0.4.0] - 2026-09-24: Authentication & Verification Endpoints

### 6. User Signup (Initiation)
* **Endpoint**: `POST /api/v1/auth/signup`
* **Status**: `200 OK`
* **Request Body**: `{ "email": "user@example.com", "password": "password123", "confirm_password": "password123" }`
* **Response Body**: `{ "message": "Verification code sent to your email" }`
* **Description**: Validates payload and stages an ephemeral OTP. Does not create a user record in the primary `users` table until verified.

### 7. Verify Signup OTP & Registration Finalization
* **Endpoint**: `POST /api/v1/auth/verify-signup-otp`
* **Status**: `201 Created`
* **Request Body**: `{ "email": "user@example.com", "otp": "123456" }`
* **Response Body**: `{ "access_token": "<jwt>", "token_type": "bearer", "message": "User registered and verified successfully" }`
* **Description**: Verifies the 6-digit registration code, creates the verified user with UUID in PostgreSQL, consumes the OTP, and returns a signed bearer access token.

### 8. User Login
* **Endpoint**: `POST /api/v1/auth/login`
* **Status**: `200 OK`
* **Request Body**: `{ "email": "user@example.com", "password": "password123" }`
* **Response Body**: `{ "access_token": "<jwt>", "token_type": "bearer" }`

### 9. Request Password Reset
* **Endpoint**: `POST /api/v1/auth/forgot-password`
* **Status**: `200 OK`
* **Request Body**: `{ "email": "user@example.com" }`
* **Response Body**: `{ "message": "If the account exists, a reset code has been sent" }`

### 10. Reset Password
* **Endpoint**: `POST /api/v1/auth/reset-password`
* **Status**: `200 OK`
* **Request Body**: `{ "email": "user@example.com", "otp": "123456", "new_password": "newpassword123" }`
* **Response Body**: `{ "message": "Password reset successfully" }`
* OTPs expire after five minutes and can be redeemed only once.

### 11. Current User Profile
* **Endpoint**: `GET /api/v1/auth/me`
* **Status**: `200 OK`
* **Headers**: `Authorization: Bearer <jwt>`
* **Response Body**: `{ "id": "<uuid>", "email": "user@example.com" }`


