# TestOrbit API Contract (MVP)

Backend: FastAPI at `http://localhost:8000`, all routes under `/api`. UI dev server proxies `/api` to it.
JSON everywhere. IDs are short strings (e.g. `p_ab12cd`, `t_...`, `r_...`, `m_...`, `u_...`).
Errors: non-2xx with `{detail: string}` (422 validation errors may have `detail` as an array — show the first `msg`).

## Platform accounts (v2)

All routes require `Authorization: Bearer <access_token>` EXCEPT `GET /api/health`, `POST /api/auth/signup`,
`POST /api/auth/login`, `GET /api/models/providers`. A 401 means the token is missing/expired → UI logs out.
Every resource (projects, tests, runs, model configs) belongs to the signed-in user; other users' ids return 404.

```ts
type User = { id: string; email: string; name: string; created_at: string };
type Session = { access_token: string; token_type: "bearer"; user: User };   // token valid 7 days
```

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password (min 8), name?}` | `Session` (409 if email exists) |
| POST | `/api/auth/login` | `{email, password}` | `Session` (401 bad credentials) |
| GET | `/api/auth/me` | – | `User` |

## Bring-your-own model (v2)

TestOrbit ships NO LLM. Each user configures their own models; a project uses its `model_config_id`,
falling back to the user's default model. Test generation, AI auth detection and failure diagnosis use it.
Without any model: generation returns 400 `"No model configured. Add one under Models."`; runs still execute (no AI diagnosis).

```ts
type Provider = "openai" | "anthropic" | "google" | "azure_openai" | "ollama" | "openai_compatible";

type ProviderInfo = {
  id: Provider;
  label: string;                    // "OpenAI", "Anthropic", "Google Gemini", "Azure OpenAI", "Ollama (local)", "OpenAI-compatible"
  fields: ("api_key" | "base_url" | "api_version" | "deployment")[];   // which inputs to show
  required: ("api_key" | "base_url" | "api_version" | "deployment")[];
  default_base_url: string | null;
  model_placeholder: string;        // e.g. "gpt-4o-mini"
  presets: { label: string; base_url: string }[];  // openai_compatible: Groq, OpenRouter, Together, DeepSeek, Mistral, xAI, Fireworks, LM Studio, vLLM
};

type ModelConfig = {
  id: string;
  name: string;                     // user label, e.g. "Groq Llama 3.3"
  provider: Provider;
  model: string;                    // provider model id
  base_url: string | null;
  api_version: string | null;       // azure only
  deployment: string | null;        // azure only
  temperature: number;
  is_default: boolean;
  has_api_key: boolean;
  api_key_hint: string | null;      // e.g. "sk-…a1b2" — the key itself is never returned
  created_at: string;
};

type ModelConfigIn = {              // create / test-unsaved; for PATCH all optional and api_key ""/omitted = keep current
  name: string; provider: Provider; model: string;
  api_key?: string; base_url?: string; api_version?: string; deployment?: string;
  temperature?: number; is_default?: boolean;
};

type ModelTestResult = { ok: boolean; latency_ms: number | null; reply: string | null; error: string | null };
```

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/models/providers` | – | `ProviderInfo[]` |
| GET | `/api/models` | – | `ModelConfig[]` |
| POST | `/api/models` | `ModelConfigIn` | `ModelConfig` (first model becomes default) |
| PATCH | `/api/models/{id}` | partial `ModelConfigIn` | `ModelConfig` (setting `is_default` unsets the others) |
| DELETE | `/api/models/{id}` | – | `{ok: true}` (projects using it fall back to default) |
| POST | `/api/models/test` | `ModelConfigIn` | `ModelTestResult` (try before saving) |
| POST | `/api/models/{id}/test` | – | `ModelTestResult` |

LangSmith tracing is removed: no `trace_id` fields, no `/api/traces`. `GET /api/health` → `{ok: true}`.

## Types

```ts
type Endpoint = {
  id: string;              // "GET /items/{item_id}"
  method: string;          // "GET"
  path: string;            // "/items/{item_id}"
  summary: string;
  tags: string[];
  requires_auth: boolean;
  parameters: any[];       // raw OpenAPI parameters (resolved)
  request_schema: any | null;
  responses: Record<string, any>; // status -> schema (resolved) or {}
};

// Auth is NOT configured by the user. It is auto-detected from the OpenAPI spec at project creation:
// signup + signin endpoints, their payloads, the token location and the header to send.
// Bodies use placeholders {{username}} {{email}} {{password}} that get fresh disposable values on every run.
type AuthStep = { endpoint_id: string; content_type: "json" | "form"; body: Record<string, any> };

type AuthPlan = {
  type: "none" | "auto";        // "none" = spec has no protected endpoints
  detected: boolean;            // false = protected endpoints exist but no signin flow could be found
  source: "heuristic" | "llm" | null;
  scheme: { type: "bearer" | "api_key"; header: string; prefix: string } | null; // e.g. {bearer, "Authorization", "Bearer "}
  signup: AuthStep | null;
  signin: AuthStep | null;
  token_path: string | null;    // JSONPath into the signin (or signup) response, e.g. "$.access_token"
  notes: string;                // human-readable explanation of what was detected
};

type AuthStepResult = {
  name: "signup" | "signin";
  method: string; url: string;
  status_code: number | null;
  ok: boolean;
  request_body: any;            // with generated credentials (password shown — they are disposable)
  response_body: any;           // tokens redacted
  error: string | null;
};

type AuthCheck = { ok: boolean; steps: AuthStepResult[]; token_preview: string | null; error: string | null };

type Project = {
  id: string;
  name: string;
  base_url: string;          // target API base URL, e.g. http://localhost:9000
  spec_url: string | null;
  model_config_id: string | null;  // null = use the user's default model
  auth: AuthPlan;
  endpoint_count: number;
  created_at: string;        // ISO
};

type Assertion =
  | { type: "field_exists"; path: string }            // JSONPath, e.g. "$.id"
  | { type: "field_equals"; path: string; value: any }
  | { type: "field_type"; path: string; value: "string"|"number"|"integer"|"boolean"|"object"|"array"|"null" }
  | { type: "body_contains"; value: string }
  | { type: "max_latency_ms"; value: number };

type Category = "happy_path" | "negative" | "boundary" | "auth" | "workflow";

type TestCase = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  category: Category;
  endpoint_id: string;      // "POST /items"
  method: string;
  path: string;             // may contain {{var}} placeholders, e.g. "/items/{{item_id}}"
  headers: Record<string, string>;
  query: Record<string, any>;
  body: any | null;         // may contain "{{var}}" string placeholders
  expected_status: number[];
  assertions: Assertion[];
  extract: Record<string, string>;  // var name -> JSONPath, e.g. {"item_id": "$.id"}
  requires_auth: boolean;
  order: number;            // execution order within the project (workflow steps are sequential)
  approved: boolean;
  created_at: string;
};

type AssertionResult = { assertion: Assertion | { type: "status"; value: number[] }; passed: boolean; message: string };

type Diagnosis = {
  category: "api_defect" | "contract_mismatch" | "invalid_test" | "auth_failure" | "environment" | "unknown";
  explanation: string;
  suggested_fix: string;
};

type TestResult = {
  test_id: string;
  test_name: string;
  category: Category;
  method: string;
  url: string;              // resolved full URL
  status: "passed" | "failed" | "error" | "skipped";
  status_code: number | null;
  latency_ms: number | null;
  request: { headers: Record<string,string>; body: any };   // Authorization redacted
  response: { headers: Record<string,string>; body: any } | null;
  assertion_results: AssertionResult[];
  error: string | null;
  diagnosis: Diagnosis | null;   // only for failed/error
};

type Run = {
  id: string;
  project_id: string;
  status: "queued" | "running" | "completed" | "failed" | "interrupted";  // interrupted = server restarted mid-run
  progress: { done: number; total: number; stage: "queued" | "authenticating" | "executing" | "diagnosing" | "done" };
  error: string | null;
  started_at: string;
  finished_at: string | null;
  summary: { total: number; passed: number; failed: number; error: number; skipped: number; duration_ms: number };
  auth: AuthCheck | null;    // how authentication went at the start of this run (null when type "none")
  results: TestResult[];
};
```

## Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/projects` | – | `Project[]` |
| POST | `/api/projects` | `{name, base_url, spec_url?: string, spec?: object, model_config_id?: string}` (one of spec_url/spec) | `Project` (spec fetched + parsed; 400 `{detail}` on bad spec) |
| GET | `/api/projects/{id}` | – | `Project` |
| PATCH | `/api/projects/{id}` | `{name?, base_url?, model_config_id?: string \| null}` | `Project` |
| DELETE | `/api/projects/{id}` | – | `{ok: true}` |
| GET | `/api/projects/{id}/endpoints` | – | `Endpoint[]` |
| POST | `/api/projects/{id}/auth/detect` | – | `Project` (re-runs auth detection from the spec) |
| POST | `/api/projects/{id}/auth/verify` | – | `AuthCheck` (performs signup+signin live against the target) |
| POST | `/api/projects/{id}/tests/generate` | `{endpoint_ids: string[], categories: Category[], max_tests?: number}` | `TestCase[]` (newly generated, appended; LLM via LangGraph; may take 10–60s) |
| GET | `/api/projects/{id}/tests` | – | `TestCase[]` sorted by order |
| PATCH | `/api/tests/{id}` | partial `TestCase` | `TestCase` |
| DELETE | `/api/tests/{id}` | – | `{ok: true}` |
| POST | `/api/projects/{id}/tests/approve` | `{test_ids: string[], approved: boolean}` | `TestCase[]` |
| POST | `/api/projects/{id}/runs` | `{test_ids?: string[]}` (default: all approved) | `Run` with status `queued`, HTTP 202. Runs in a background worker; poll `GET /api/runs/{id}` (~1s) until status is not queued/running. `results` fills in as tests finish. |
| GET | `/api/projects/{id}/runs` | – | `Run[]` newest first (results included) |
| GET | `/api/runs/{id}` | – | `Run` |


Errors: non-2xx with `{detail: string}`.

## Rate limits

`POST /api/auth/login`: 10 attempts / 5 min per IP+email. `POST /api/auth/signup`: 5 / hour per IP.
Exceeding returns 429 `{detail}` with a `Retry-After` header (seconds).
