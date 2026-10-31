import { useState } from "react"
import { CheckCircle2, ChevronDown, KeyRound, RefreshCw, ShieldCheck, ShieldAlert, ShieldOff, XCircle } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import type { AuthCheck, AuthStep, Project } from "@/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { Json, MethodBadge, Mono, PageHeader } from "@/components/common"

export function AuthCheckView({ check }: { check: AuthCheck }) {
  return (
    <div className="space-y-3">
      {check.steps.map((s) => (
        <Collapsible key={s.name} className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left text-sm">
            {s.ok ? <CheckCircle2 className="size-4 text-green-600" /> : <XCircle className="size-4 text-red-600" />}
            <span className="font-medium capitalize">{s.name}</span>
            <MethodBadge method={s.method} />
            <Mono className="truncate">{s.url}</Mono>
            <Badge variant="secondary" className={s.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
              {s.status_code ?? "no response"}
            </Badge>
            <ChevronDown className="ml-auto size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 border-t p-3">
            {s.error && <p className="text-sm text-red-600">{s.error}</p>}
            <p className="text-xs font-medium text-muted-foreground">Request</p>
            <Json value={s.request_body} />
            <p className="text-xs font-medium text-muted-foreground">Response</p>
            <Json value={s.response_body} />
          </CollapsibleContent>
        </Collapsible>
      ))}
      {check.token_preview && (
        <p className="text-sm">
          Token: <Mono className="rounded bg-muted px-1.5 py-0.5">{check.token_preview}</Mono>
        </p>
      )}
    </div>
  )
}

function StepCard({ n, title, endpoint, step, extra }: { n: number; title: string; endpoint?: string; step?: AuthStep | null; extra?: React.ReactNode }) {
  const [method, ...rest] = (endpoint ?? step?.endpoint_id ?? "").split(" ")
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
          {title}
          {method && (
            <>
              <MethodBadge method={method} /> <Mono>{rest.join(" ")}</Mono>
            </>
          )}
          {step && <Badge variant="outline">{step.content_type}</Badge>}
        </CardTitle>
      </CardHeader>
      {(step || extra) && (
        <CardContent className="space-y-2">
          {step && <Json value={step.body} />}
          {extra}
        </CardContent>
      )}
    </Card>
  )
}

export function AuthView({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const a = project.auth
  const [check, setCheck] = useState<AuthCheck | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [detecting, setDetecting] = useState(false)

  const verify = async () => {
    setVerifying(true)
    try {
      const c = await api.verifyAuth(project.id)
      setCheck(c)
      c.ok ? toast.success("Authentication works") : toast.error(c.error ?? "Authentication failed")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setVerifying(false)
    }
  }
  const detect = async () => {
    setDetecting(true)
    try {
      const p = await api.detectAuth(project.id)
      toast.success(p.auth.detected ? "Authentication re-detected" : "No authentication flow found")
      setCheck(null)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDetecting(false)
    }
  }

  const ready = a.type === "auto" && a.detected
  return (
    <>
      <PageHeader
        title="Authentication"
        description="Detected automatically from the OpenAPI spec. TestOrbit signs up a disposable user on every run."
        actions={
          <>
            <Button variant="outline" disabled={detecting} onClick={detect}>
              {detecting ? <Spinner /> : <RefreshCw />} Re-detect
            </Button>
            <Button disabled={verifying || !ready} onClick={verify}>
              {verifying ? <Spinner /> : <ShieldCheck />} Verify now
            </Button>
          </>
        }
      />
      {a.type === "none" ? (
        <Alert>
          <ShieldOff />
          <AlertTitle>No authentication needed</AlertTitle>
          <AlertDescription>{a.notes || "The spec has no protected endpoints."}</AlertDescription>
        </Alert>
      ) : a.detected ? (
        <Alert className="border-green-200 bg-green-50 text-green-900">
          <ShieldCheck className="text-green-600" />
          <AlertTitle>Authentication detected</AlertTitle>
          <AlertDescription>{a.notes}</AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <ShieldAlert className="text-amber-600" />
          <AlertTitle>Authentication not detected</AlertTitle>
          <AlertDescription>{a.notes || "Protected endpoints exist but no sign-in flow could be found."}</AlertDescription>
        </Alert>
      )}
      {ready && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {a.source && <Badge variant="secondary">source: {a.source === "llm" ? "AI" : "heuristic"}</Badge>}
            {a.scheme && (
              <Badge variant="outline" className="font-mono">
                {a.scheme.header}: {a.scheme.prefix}&lt;token&gt;
              </Badge>
            )}
            {a.scheme && <Badge variant="secondary">{a.scheme.type}</Badge>}
          </div>
          <div className="max-w-3xl space-y-3">
            {a.signup && <StepCard n={1} title="Sign up" step={a.signup} />}
            {a.signin && <StepCard n={a.signup ? 2 : 1} title="Sign in" step={a.signin} />}
            <StepCard
              n={3}
              title="Extract token"
              extra={
                <p className="flex items-center gap-2 text-sm">
                  <KeyRound className="size-4 text-muted-foreground" /> from response at <Mono className="rounded bg-muted px-1.5 py-0.5">{a.token_path}</Mono>
                </p>
              }
            />
            <StepCard
              n={4}
              title="Inject header"
              extra={
                a.scheme && (
                  <Mono className="block rounded-lg bg-muted p-3">
                    {a.scheme.header}: {a.scheme.prefix}&lt;token&gt;
                  </Mono>
                )
              }
            />
          </div>
        </>
      )}
      {check && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {check.ok ? <CheckCircle2 className="size-5 text-green-600" /> : <XCircle className="size-5 text-red-600" />}
              Verification {check.ok ? "passed" : "failed"}
            </CardTitle>
            {check.error && <CardDescription className="text-red-600">{check.error}</CardDescription>}
          </CardHeader>
          <CardContent>
            <AuthCheckView check={check} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
