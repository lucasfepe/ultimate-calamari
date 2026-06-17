

Your Marine AI Knowledge Assistant — upload documents, organise them into libraries, and chat with your knowledge base.

---

## Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Vector DB | Qdrant Cloud |
| Embeddings & Reranking | Cohere |
| LLM | Anthropic Claude |
| Auth, Postgres, Storage | Supabase |
| Frontend | React + TypeScript + Vite |

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- A `.env` file in the project root (see below)
- A `frontend/.env` file (see below)

---

## Environment Variables

### Backend — `.env` (project root)

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_JWT_SECRET=<jwt-secret>        # optional — JWT now verified via JWKS
SUPABASE_STORAGE_BUCKET=documents

QDRANT_URL=https://<cluster>.qdrant.io
QDRANT_API_KEY=<qdrant-api-key>
QDRANT_COLLECTION=rag_chunks

COHERE_API_KEY=<cohere-api-key>

ANTHROPIC_API_KEY=<anthropic-api-key>
ANTHROPIC_MODEL=claude-sonnet-4-6

CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

### Frontend — `frontend/.env`

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

> The anon key and JWT secret are in your Supabase dashboard under **Settings → API**.

---

## Starting the Backend

```bash
# 1. Create and activate a virtual environment (first time only)
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# 2. Install dependencies (first time only)
pip install -r requirements.txt
pip install -e .

# 3. Start the server
uvicorn app.main:app --reload
```

The API will be available at **http://127.0.0.1:8000**.  
Interactive docs: **http://127.0.0.1:8000/docs**

---

## Starting the Frontend

```bash
# In a separate terminal
cd frontend

# Install dependencies (first time only)
npm install

# Start the dev server
npm run dev
```

The app will open at **http://localhost:5173**.

---

## Database Migrations

Run these SQL scripts in order in the **Supabase SQL Editor**:

| File | Purpose |
|---|---|
| `migrations/001_initial.sql` | Core schema (documents, libraries, usage_logs) |
| `migrations/002_drop_owner_fkeys.sql` | Drops owner FK constraints (re-added after auth) |
| `migrations/003_api_keys.sql` | API keys table |
| `migrations/004_re_add_owner_fkeys.sql` | Restores FK constraints to `auth.users` |

---

## Project Structure

```
/
├── app/
│   ├── api/v1/routes/      # FastAPI route handlers
│   ├── core/               # Business logic (ingestion, RAG, auth, JWT)
│   ├── db/                 # Supabase + Qdrant helpers
│   ├── models/             # Pydantic schemas
│   ├── config.py           # Settings (loaded from .env)
│   ├── dependencies.py     # FastAPI dependency injection
│   └── main.py             # App entry point + lifespan
├── frontend/
│   ├── src/
│   │   ├── api/            # API client (client.ts)
│   │   ├── lib/            # Supabase client, navigation context
│   │   └── pages/          # Chat, Documents, Libraries, ApiKeys, Guide, Login
│   └── tailwind.config.js
├── migrations/             # SQL migration files
├── tests/                  # Integration tests (pytest + httpx)
├── .env                    # Backend secrets (git-ignored)
├── .env.example
└── requirements.txt
```

---

## Running Tests

```bash
# Fast tests only (no external API calls)
pytest -v

# Include slow tests that call Cohere + Anthropic APIs
pytest -v --slow
```
