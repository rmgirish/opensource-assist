# OpenSource Assist

Find your first open-source project to contribute to — described in plain language, ranked by meaning.

**OpenSource Assist** pairs a React + Vite landing/dashboard app with a FastAPI backend that indexes open-source repositories into **Qdrant** (vector database), ranks them by semantic similarity blended with popularity, generates AI learning roadmaps, and answers skill-aware questions via a LangGraph chatbot. Accounts are real: email-verified signup (6-digit OTP), JWT sessions, and password reset.

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, TanStack Query, Zustand |
| Backend | FastAPI (Python 3.12+), `uv`, SQLAlchemy (async) + Alembic |
| Search | Qdrant + FastEmbed (`bge-small-en-v1.5`, 384-dim, local ONNX — no embedding API needed) |
| AI | LangGraph + LiteLLM (Gemini via `GEMINI_API_KEY`; template fallback without a key) |
| Auth | JWT (HS256), bcrypt password hashing, single-use HMAC-hashed OTPs, SMTP email |

---

## 🚀 Quick start (fresh clone)

### Prerequisites

- **Node.js 20+** and npm
- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** — `pip install uv` (or `irm https://astral.sh/uv/install.ps1 | iex` on Windows)
- **Docker Desktop** (runs Qdrant)

### 1. Clone and install

```bash
git clone https://github.com/rmgirish/opensource-assist.git
cd opensource-assist

# Frontend dependencies
npm install

# Backend dependencies (creates .venv)
uv sync
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | What to set |
|---|---|
| `JWT_SECRET_KEY` | **Required.** Any long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `DATABASE_URL` | PostgreSQL (default) **or** zero-install SQLite for local dev: `sqlite+aiosqlite:///./osa_local.db` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `MAIL_FROM` | **Required for signup.** For Gmail: an [App Password](https://myaccount.google.com/apppasswords) (2FA must be on), `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_START_TLS=true`. Never commit real credentials. |
| `QDRANT_URL` | `http://localhost:6333` (the compose default) |
| `GEMINI_API_KEY` | Optional — enables real AI answers in chatbot/learning; leave blank to use built-in template fallbacks |

### 3. Start Qdrant

```bash
docker compose up -d          # Qdrant on :6333 (dashboard at /dashboard)
```

### 4. Create the database schema

```bash
uv run alembic upgrade head   # creates `users` and `otps` tables
```

### 5. Seed sample repositories (first run)

The search index ships empty. Ingest a starter set:

```bash
uv run python -m backend.scripts.seed_sample_data
```

> First run downloads the FastEmbed model (~30 MB) to your local cache.

### 6. Run the stack (two terminals)

```bash
# Terminal 1 — backend on http://localhost:8000 (docs at /docs)
uv run uvicorn backend.main:app --reload

# Terminal 2 — frontend on http://localhost:5173
npm run dev
```

Open **http://localhost:5173** — sign up with a real email to receive a verification code, then explore the dashboard.

---

## 🧪 Tests & checks

```bash
uv run pytest                 # backend suite (auth, scoring, search API, agents)
npm run typecheck             # frontend types (tsc --noEmit)
npm run build                 # production build
npm run check:contrast        # WCAG AA spot checks (both themes)
npm run audit:browser         # headless-Chrome layout audit (--shots for PNGs)
```

---

## 🔌 API surface

Interactive docs: **http://localhost:8000/docs** (Swagger) · `/redoc`

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/search` | Semantic repository search with popularity reranking |
| `POST /api/v1/internal/ingest` | Batch-index repository records |
| `POST /api/v1/learning/materials` | AI learning roadmap + citations for a topic/skill level |
| `POST /api/v1/chatbot/query` | Skill-aware technical Q&A |
| `POST /api/v1/auth/signup` | Validate + email a signup OTP |
| `POST /api/v1/auth/verify-signup-otp` | Consume OTP, create user, issue JWT |
| `POST /api/v1/auth/login` | Credentials → JWT |
| `POST /api/v1/auth/forgot-password` | Email a password-reset OTP |
| `POST /api/v1/auth/reset-password` | Consume OTP, set new password |
| `GET /api/v1/auth/me` | Current user profile (Bearer token) |
| `GET /health` | Liveness probe |

Full request/response schemas: **[API_CONTRACT.md](API_CONTRACT.md)**.

Auth notes: OTPs expire after 5 minutes, are stored as HMAC digests, and are single-use. Email is delivered over SMTP via `backend/services/mail_service.py` (`aiosmtplib`). Passwords are bcrypt-hashed; JWTs default to 120-minute lifetimes.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| **[1. Architecture & Design](doc/search_module/architecture.md)** | System architecture, separation of concerns, concurrency model, and Qdrant Server topology. |
| **[2. Search & Ranking Engine](doc/search_module/search_and_ranking.md)** | Mathematical formulation of semantic similarity, logarithmic popularity normalization, and the Strategy pattern. |
| **[3. Teammate Integration Guide](doc/integration/search_integration_backend.md)** | Integration guide for teammate modules (Ingestion, RAG, and Auth hooks). |
| **[4. Deployment & Operations](doc/deployment_and_operations.md)** | Docker Compose configuration, Qdrant Cloud deployment, environment configuration, database seeding, and testing with `uv`. |
| **[5. API Contract & Changelog](API_CONTRACT.md)** | Formal versioned API contracts, HTTP endpoints, status codes, and request/response JSON schemas. |
| **[UI Style Guide](UI_STYLE.md)** | Frontend design tokens, component classes, motion rules, and a11y floor. |

---

## ✨ Key features

* **Dense semantic search** — natural-language queries over locally embedded repositories (FastEmbed ONNX, no external embedding API).
* **Logarithmic popularity normalization** — dampens power-law star/fork distributions so mega-repos don't swamp emerging projects.
* **Multiplicative Gate ranking**

  $$\text{FinalScore} = S_{\text{semantic}} \times (1 + \alpha \cdot P_{\text{popularity}})$$

  Semantic relevance stays mandatory; popular, battle-tested repos earn a proportionate boost.
* **Extensible strategy pattern** — plug in new ranking heuristics (`Linear Hybrid`, RRF, …) without touching retrieval.
* **Production-grade Qdrant** — standalone server via HTTP/gRPC, HNSW + Cosine distance, payload indexes on `language`, `license`, `topics`, `stars`.
* **Real accounts** — email-verified signup, JWT sessions hydrated on refresh, OTP password reset.
* **Clean architecture** — async Python 3.12+, routers with zero business logic, Pydantic v2 schemas as the OpenAPI contract.

---

## 🗺️ Repository layout

```
├── src/                  # React app (landing, dashboard, auth UI)
│   ├── components/       # sections, layout, shared, ui primitives
│   ├── lib/              # typed API clients + stores (search, auth, github)
│   └── page/             # HomePage, DashboardPage
├── backend/              # FastAPI app
│   ├── api/              # routers (search, auth, learning, chatbot)
│   ├── core/             # config, database, jwt, security
│   ├── models/           # SQLAlchemy models (User, OTP)
│   ├── schemas/          # Pydantic request/response contracts
│   ├── services/         # business logic (search, embedding, qdrant, mail, otp, agents)
│   └── tests/            # pytest suite
├── alembic/              # DB migrations
├── doc/                  # deep-dive design docs
├── docker-compose.yml    # Qdrant
└── .env.example          # environment template
```

## 🤝 Contributing

1. Branch from `main` (`feat/…`, `fix/…`).
2. Backend changes: add/adjust pytest coverage, run `uv run pytest`.
3. Frontend changes: `npm run typecheck && npm run build`; keep visuals within `UI_STYLE.md` tokens.
4. Update `API_CONTRACT.md` for any endpoint change.
