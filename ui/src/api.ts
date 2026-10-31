import type {
  AuthCheck,
  Category,
  Endpoint,
  ModelConfig,
  ModelConfigIn,
  ModelTestResult,
  Project,
  ProviderInfo,
  Run,
  Session,
  TestCase,
  User,
} from "./types"

const TOKEN_KEY = "testorbit.token"

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

const unauthorizedListeners = new Set<() => void>()
export function onUnauthorized(fn: () => void) {
  unauthorizedListeners.add(fn)
  return () => {
    unauthorizedListeners.delete(fn)
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers["Content-Type"] = "application/json"
  const token = getToken()
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch("/api" + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/auth/login") && !url.startsWith("/auth/signup")) {
      setToken(null)
      unauthorizedListeners.forEach((fn) => fn())
    }
    let msg = res.statusText
    try {
      const j = await res.json()
      if (typeof j.detail === "string") msg = j.detail
      else if (Array.isArray(j.detail) && j.detail[0]?.msg) msg = String(j.detail[0].msg)
      else msg = JSON.stringify(j.detail ?? j)
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  signup: (b: { email: string; password: string; name?: string }) => req<Session>("POST", "/auth/signup", b),
  login: (b: { email: string; password: string }) => req<Session>("POST", "/auth/login", b),
  me: () => req<User>("GET", "/auth/me"),

  listModels: () => req<ModelConfig[]>("GET", "/models"),
  providers: () => req<ProviderInfo[]>("GET", "/models/providers"),
  createModel: (b: ModelConfigIn) => req<ModelConfig>("POST", "/models", b),
  updateModel: (id: string, b: Partial<ModelConfigIn>) => req<ModelConfig>("PATCH", `/models/${id}`, b),
  deleteModel: (id: string) => req<{ ok: boolean }>("DELETE", `/models/${id}`),
  testModel: (id: string) => req<ModelTestResult>("POST", `/models/${id}/test`),
  testModelDraft: (b: ModelConfigIn) => req<ModelTestResult>("POST", "/models/test", b),

  listProjects: () => req<Project[]>("GET", "/projects"),
  createProject: (b: { name: string; base_url: string; spec_url?: string; spec?: object; model_config_id?: string }) =>
    req<Project>("POST", "/projects", b),
  getProject: (id: string) => req<Project>("GET", `/projects/${id}`),
  updateProject: (id: string, patch: { name?: string; base_url?: string; model_config_id?: string | null }) =>
    req<Project>("PATCH", `/projects/${id}`, patch),
  deleteProject: (id: string) => req<{ ok: boolean }>("DELETE", `/projects/${id}`),
  endpoints: (id: string) => req<Endpoint[]>("GET", `/projects/${id}/endpoints`),
  detectAuth: (id: string) => req<Project>("POST", `/projects/${id}/auth/detect`),
  verifyAuth: (id: string) => req<AuthCheck>("POST", `/projects/${id}/auth/verify`),
  health: () => req<{ ok: boolean }>("GET", "/health"),
  generate: (id: string, endpoint_ids: string[], categories: Category[]) =>
    req<TestCase[]>("POST", `/projects/${id}/tests/generate`, { endpoint_ids, categories }),
  tests: (id: string) => req<TestCase[]>("GET", `/projects/${id}/tests`),
  patchTest: (id: string, p: Partial<TestCase>) => req<TestCase>("PATCH", `/tests/${id}`, p),
  deleteTest: (id: string) => req<{ ok: boolean }>("DELETE", `/tests/${id}`),
  approve: (id: string, test_ids: string[], approved: boolean) =>
    req<TestCase[]>("POST", `/projects/${id}/tests/approve`, { test_ids, approved }),
  run: (id: string, test_ids?: string[]) => req<Run>("POST", `/projects/${id}/runs`, { test_ids }),
  runs: (id: string) => req<Run[]>("GET", `/projects/${id}/runs`),
  getRun: (id: string) => req<Run>("GET", `/runs/${id}`),
}
