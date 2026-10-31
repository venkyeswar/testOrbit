export type Endpoint = {
  id: string
  method: string
  path: string
  summary: string
  tags: string[]
  requires_auth: boolean
  parameters: any[]
  request_schema: any | null
  responses: Record<string, any>
}

export type AuthStep = { endpoint_id: string; content_type: "json" | "form"; body: Record<string, any> }

export type AuthPlan = {
  type: "none" | "auto"
  detected: boolean
  source: "heuristic" | "llm" | null
  scheme: { type: "bearer" | "api_key"; header: string; prefix: string } | null
  signup: AuthStep | null
  signin: AuthStep | null
  token_path: string | null
  notes: string
}

export type AuthStepResult = {
  name: "signup" | "signin"
  method: string
  url: string
  status_code: number | null
  ok: boolean
  request_body: any
  response_body: any
  error: string | null
}

export type AuthCheck = { ok: boolean; steps: AuthStepResult[]; token_preview: string | null; error: string | null }

export type Project = {
  id: string
  name: string
  base_url: string
  spec_url: string | null
  model_config_id: string | null
  auth: AuthPlan
  endpoint_count: number
  created_at: string
}

export type Assertion =
  | { type: "field_exists"; path: string }
  | { type: "field_equals"; path: string; value: any }
  | { type: "field_type"; path: string; value: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null" }
  | { type: "body_contains"; value: string }
  | { type: "max_latency_ms"; value: number }

export type Category = "happy_path" | "negative" | "boundary" | "auth" | "workflow"

export type TestCase = {
  id: string
  project_id: string
  name: string
  description: string
  category: Category
  endpoint_id: string
  method: string
  path: string
  headers: Record<string, string>
  query: Record<string, any>
  body: any | null
  expected_status: number[]
  assertions: Assertion[]
  extract: Record<string, string>
  requires_auth: boolean
  order: number
  approved: boolean
  created_at: string
}

export type AssertionResult = {
  assertion: Assertion | { type: "status"; value: number[] }
  passed: boolean
  message: string
}

export type Diagnosis = {
  category: "api_defect" | "contract_mismatch" | "invalid_test" | "auth_failure" | "environment" | "unknown"
  explanation: string
  suggested_fix: string
}

export type TestResult = {
  test_id: string
  test_name: string
  category: Category
  method: string
  url: string
  status: "passed" | "failed" | "error" | "skipped"
  status_code: number | null
  latency_ms: number | null
  request: { headers: Record<string, string>; body: any }
  response: { headers: Record<string, string>; body: any } | null
  assertion_results: AssertionResult[]
  error: string | null
  diagnosis: Diagnosis | null
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "interrupted"
export type RunStage = "queued" | "authenticating" | "executing" | "diagnosing" | "done"

export type Run = {
  id: string
  project_id: string
  status: RunStatus
  progress: { done: number; total: number; stage: RunStage }
  error: string | null
  started_at: string
  finished_at: string | null
  summary: { total: number; passed: number; failed: number; error: number; skipped: number; duration_ms: number }
  auth: AuthCheck | null
  results: TestResult[]
}

export const CATEGORIES: Category[] = ["happy_path", "negative", "boundary", "auth", "workflow"]

export type User = { id: string; email: string; name: string; created_at: string }
export type Session = { access_token: string; token_type: "bearer"; user: User }

export type Provider = "openai" | "anthropic" | "google" | "azure_openai" | "ollama" | "openai_compatible"
export type ProviderField = "api_key" | "base_url" | "api_version" | "deployment"

export type ProviderInfo = {
  id: Provider
  label: string
  fields: ProviderField[]
  required: ProviderField[]
  default_base_url: string | null
  model_placeholder: string
  presets: { label: string; base_url: string }[]
}

export type ModelConfig = {
  id: string
  name: string
  provider: Provider
  model: string
  base_url: string | null
  api_version: string | null
  deployment: string | null
  temperature: number
  is_default: boolean
  has_api_key: boolean
  api_key_hint: string | null
  created_at: string
}

export type ModelConfigIn = {
  name: string
  provider: Provider
  model: string
  api_key?: string
  base_url?: string
  api_version?: string
  deployment?: string
  temperature?: number
  is_default?: boolean
}

export type ModelTestResult = { ok: boolean; latency_ms: number | null; reply: string | null; error: string | null }
