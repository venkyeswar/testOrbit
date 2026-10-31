# TestOrbit

AI-powered backend API testing. Point TestOrbit at an OpenAPI spec, let an LLM you configure generate test cases, review and approve them, run them deterministically, and get an AI diagnosis for every failure.

## Features

- **Accounts:** sign up and log in. Your projects, models, and runs are private to you.
- **Bring your own model:** OpenAI, Anthropic, Google Gemini, Azure OpenAI, Ollama, or any OpenAI-compatible API (Groq, OpenRouter, Together, DeepSeek, Mistral, xAI, Fireworks, LM Studio, vLLM). Keys are encrypted at rest.
- **Automatic authentication:** signup and signin flows are detected from the target's OpenAPI spec, and the token is injected into protected requests.
- **Test generation:** happy path, negative, boundary, auth, and multi-step workflow cases.
- **Review first:** generated tests are saved unapproved. Nothing runs until you approve it.
- **Deterministic execution:** requests and assertions run in plain Python. The LLM never sends requests.
- **AI diagnosis:** failed tests get a category, an explanation, and a suggested fix, labeled as AI output.
- **Storage:** SQLite, with Docker Compose for one-command startup.

## Quick start

### Local development

Requirements: Python 3.12 and Node.js 22.

1. **Backend**

   ```bash
   cd server
   cp .env.example .env          # then set SECRET_KEY (see Configuration)
   python -m venv .venv && . .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

   The SQLite file is created at `server/testorbit.db` on first start.

2. **Sample target API** (new terminal, any environment with `sample_api/requirements.txt` installed)

   ```bash
   cd sample_api
   uvicorn main:app --port 9000
   ```

   It has a deliberate defect: `PUT /items` ignores `price`.

3. **UI** (new terminal)

   ```bash
   cd ui
   npm ci
   npm run dev
   ```

   Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port 8000.

### Docker

```bash
cp server/.env.example server/.env   # then set SECRET_KEY
docker compose up --build
```

- Console: http://localhost:8080
- Sample target API: http://localhost:9000
- Data lives in the `testorbit-data` volume. To reset it, run `docker compose down -v`.

## First steps

1. **Create an account** with *Sign up*, then log in.
2. **Add a model** under *Models*. Pick a provider, enter your API key, click *Test connection*, and save. The first model becomes your default.
3. **Create a project** under *Projects* with a base URL and an OpenAPI spec URL.
   - Local: `http://localhost:9000` and `http://localhost:9000/openapi.json`
   - Docker: `http://sample_api:9000` and `http://sample_api:9000/openapi.json`. The backend container fetches these, so use the compose service name.
4. **Check authentication** under *Authentication* and click *Verify now*. TestOrbit detects the signup and signin flow from the spec. Each run signs up a fresh disposable user.
5. **Generate tests** from *API Explorer*: pick endpoints and categories, then generate.
6. **Review and approve** in *Test Cases*.
7. **Run** the approved tests from *Runs*. Open a failed `PUT /items` result to see the AI diagnosis (`api_defect`).

## Configuration

Set in `server/.env` (copied from `server/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | none, required | Signs login tokens and derives the key that encrypts stored model API keys |
| `DATABASE_URL` | `sqlite:///./testorbit.db` | SQLAlchemy database URL |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed browser origins for the API |
| `ACCESS_TOKEN_DAYS` | `7` | Login token lifetime in days |
| `REQUEST_TIMEOUT` | `15` | Timeout in seconds for requests to target APIs |
| `RUN_WORKERS` | `4` | Test runs executed in parallel by the background worker |
| `SECRET_KEY_FILE` | `server/.secret_key` (Docker: `/data/.secret_key`) | Where a generated key is stored when `SECRET_KEY` is unset (dev only) |

Generate a secret with:

```bash
python -c "import secrets;print(secrets.token_urlsafe(48))"
```

## Security notes

- **Model keys are encrypted at rest** (Fernet, key derived from `SECRET_KEY`). The API never returns them; the UI shows only a short hint.
- **Set a long random `SECRET_KEY`** for anything beyond a local demo. Changing it signs everyone out and makes saved model keys unreadable, so they must be re-entered.
- **Target credentials are disposable.** Auth bodies use generated credentials on every run, and tokens are never stored or sent to the LLM.
- **Only test systems you are authorized to test.** Generated tests can create, update, and delete data. Use local or staging environments, and never production by default. Review every test before approving it.
- **Do not commit secrets or databases.** `.env` and `*.db` are git-ignored; keep it that way.

## Documentation

- [`prd.md`](prd.md): product requirements and architecture
- [`docs/api-contract.md`](docs/api-contract.md): types and routes (source of truth for the API)

## Project layout

```
ui/            React + Vite + TypeScript console (shadcn/ui)
server/        FastAPI backend, SQLAlchemy, LangGraph workflows
sample_api/    FastAPI demo target with a deliberate defect
docs/          API contract
prd.md         Product requirements
docker-compose.yml
```
