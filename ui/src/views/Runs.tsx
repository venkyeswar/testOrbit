import { useEffect, useRef, useState } from "react"
import { ArrowLeft, CheckCircle2, Clock, ListChecks, ShieldCheck, TriangleAlert, XCircle } from "lucide-react"
import { toast } from "sonner"
import type { LegacyColumnDef } from "@tanstack/react-table/legacy"
import { api } from "@/api"
import type { Project, Run, RunStage, RunStatus, TestResult } from "@/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AuthCheckView } from "@/views/Auth"
import { DataTable, DiagnosisBadge, EmptyState, Json, LoadingRows, MethodBadge, Mono, PageHeader, StatCard, StatusBadge, fmtDate, fmtDuration } from "@/components/common"
import type { View } from "@/App"

const STAGE_LABELS: Record<RunStage, string> = {
  queued: "Queued",
  authenticating: "Signing up & signing in",
  executing: "Executing tests",
  diagnosing: "AI diagnosing failures",
  done: "Finishing",
}

const INTERRUPTED_MESSAGE = "The server restarted while this run was in progress."

const isActive = (status: RunStatus) => status === "queued" || status === "running"

const pctOf = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0)

function RunStatusBadge({ run }: { run: Run }) {
  if (isActive(run.status)) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Spinner />
        {run.status}
      </Badge>
    )
  }
  if (run.status === "interrupted") {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-700">interrupted</Badge>
  }
  const bad = run.status === "failed" || run.summary.failed + run.summary.error > 0
  return (
    <Badge variant="secondary" className={bad ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
      {bad ? "failed" : "passed"}
    </Badge>
  )
}

export function RunsTable({ runs, onOpen }: { runs: Run[]; onOpen: (id: string) => void }) {
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No runs yet.</p>
  const columns: LegacyColumnDef<Run, any>[] = [
    { header: "ID", cell: ({ row }) => <Mono>{row.original.id}</Mono> },
    { header: "Started", cell: ({ row }) => fmtDate(row.original.started_at) },
    { header: "Status", cell: ({ row }) => <RunStatusBadge run={row.original} /> },
    { header: "Duration", cell: ({ row }) => fmtDuration(row.original.summary.duration_ms) },
    {
      header: "Results",
      cell: ({ row }) => {
        const s = row.original.summary
        return (
          <div className="flex gap-1">
            <Badge variant="secondary" className="bg-green-100 text-green-700">{s.passed} pass</Badge>
            <Badge variant="secondary" className="bg-red-100 text-red-700">{s.failed + s.error} fail</Badge>
          </div>
        )
      },
    },
    {
      header: "Pass rate",
      cell: ({ row }) => {
        const s = row.original.summary
        const v = pctOf(s.passed, s.total)
        return (
          <div className="flex items-center gap-2">
            <Progress className="w-28" value={v} />
            <span className="w-10 text-xs tabular-nums text-muted-foreground">{s.total > 0 ? `${v}%` : "-"}</span>
          </div>
        )
      },
    },
  ]
  return <DataTable columns={columns} data={runs} onRowClick={(r) => onOpen(r.id)} />
}

export function RunsView({
  project,
  runId,
  setRunId,
  go,
}: {
  project: Project
  runId: string | null
  setRunId: (id: string | null) => void
  go: (v: View) => void
}) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [sel, setSel] = useState<TestResult | null>(null)
  const [tab, setTab] = useState("all")

  const watchingRef = useRef(false)

  useEffect(() => {
    if (!runId) api.runs(project.id).then(setRuns).catch(() => setRuns([]))
  }, [project.id, runId])

  // While the list shows queued/running runs, refresh it every 2s until none are active.
  const anyActive = runs?.some((r) => isActive(r.status)) ?? false
  useEffect(() => {
    if (runId || !anyActive) return
    const t = setTimeout(() => {
      api.runs(project.id).then(setRuns).catch(() => {})
    }, 2000)
    return () => clearTimeout(t)
  }, [runId, anyActive, runs, project.id])

  // Poll the open run every 1s until it leaves queued/running; stops on unmount or run change.
  useEffect(() => {
    if (!runId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    watchingRef.current = false
    setRun(null)

    const tick = () => {
      api
        .getRun(runId)
        .then((r) => {
          if (cancelled) return
          setRun(r)
          if (isActive(r.status)) {
            timer = setTimeout(tick, 1000)
            return
          }
          // Only notify if we watched this run in progress (not when opening a finished one).
          if (watchingRef.current) {
            const s = r.summary
            if (r.status === "completed") {
              toast.success(`Run completed: ${s.passed} passed, ${s.failed + s.error} failed`)
            } else {
              toast.error(r.error ?? (r.status === "interrupted" ? INTERRUPTED_MESSAGE : "Run failed"))
            }
          }
          watchingRef.current = false
        })
        .catch(() => {
          if (!cancelled) setRunId(null)
        })
    }

    api
      .getRun(runId)
      .then((r) => {
        if (cancelled) return
        setRun(r)
        if (isActive(r.status)) {
          watchingRef.current = true
          timer = setTimeout(tick, 1000)
        }
      })
      .catch(() => {
        if (!cancelled) setRunId(null)
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [runId, setRunId])

  if (!runId) {
    return (
      <>
        <PageHeader title="Runs" description="History of test executions with AI-diagnosed failures." />
        {runs === null ? (
          <LoadingRows />
        ) : runs.length === 0 ? (
          <EmptyState text="No runs yet. Approve some tests and run them." action="Go to test cases" onAction={() => go("tests")} />
        ) : (
          <Card>
            <CardContent>
              <RunsTable runs={runs} onOpen={setRunId} />
            </CardContent>
          </Card>
        )}
      </>
    )
  }

  const columns: LegacyColumnDef<TestResult, any>[] = [
    { header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: "Name", cell: ({ row }) => row.original.test_name },
    { header: "Method", cell: ({ row }) => <MethodBadge method={row.original.method} /> },
    { header: "URL", cell: ({ row }) => <Mono>{row.original.url}</Mono> },
    { header: "Code", cell: ({ row }) => <Mono>{row.original.status_code ?? "-"}</Mono> },
    {
      header: "Latency",
      cell: ({ row }) => <Mono>{row.original.latency_ms == null ? "-" : `${Math.round(row.original.latency_ms)} ms`}</Mono>,
    },
  ]

  const s = run?.summary
  const failedRows = run?.results.filter((r) => r.status === "failed" || r.status === "error") ?? []
  const passedRows = run?.results.filter((r) => r.status === "passed") ?? []
  const shown = tab === "failed" ? failedRows : tab === "passed" ? passedRows : (run?.results ?? [])

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setRunId(null)}>
          <ArrowLeft /> Runs
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Run <Mono className="text-lg">{runId}</Mono>
        </h1>
      </div>
      {run && isActive(run.status) && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Spinner className="text-primary" />
                {STAGE_LABELS[run.progress.stage] ?? "Queued"}
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {run.progress.done} of {run.progress.total} tests
              </span>
            </div>
            <Progress value={pctOf(run.progress.done, run.progress.total)} />
          </CardContent>
        </Card>
      )}
      {run && (run.status === "failed" || run.status === "interrupted") && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{run.status === "interrupted" ? "Run interrupted" : "Run failed"}</AlertTitle>
          <AlertDescription>
            {run.error ?? (run.status === "interrupted" ? INTERRUPTED_MESSAGE : "The run failed.")}
          </AlertDescription>
        </Alert>
      )}
      {!run || !s ? (
        <LoadingRows />
      ) : (
        <>
          {run.auth &&
            (run.auth.ok ? (
              <Alert className="border-green-200 bg-green-50 text-green-900">
                <ShieldCheck className="text-green-600" />
                <AlertTitle>Authentication</AlertTitle>
                <AlertDescription>
                  Signed up &amp; signed in as <Mono>{String(run.auth.steps[0]?.request_body?.username ?? run.auth.steps[0]?.request_body?.email ?? "disposable user")}</Mono>, token acquired
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>Authentication failed</AlertTitle>
                <AlertDescription className="w-full space-y-2">
                  <p>{run.auth.error ?? "Could not acquire a token."}</p>
                  <AuthCheckView check={run.auth} />
                </AlertDescription>
              </Alert>
            ))}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Total" value={s.total} icon={ListChecks} />
            <StatCard label="Passed" value={s.passed} icon={CheckCircle2} />
            <StatCard label="Failed" value={s.failed} icon={XCircle} tone="red" />
            <StatCard label="Error" value={s.error} icon={TriangleAlert} tone="amber" />
            <StatCard label="Duration" value={fmtDuration(s.duration_ms)} icon={Clock} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList>
                  <TabsTrigger value="all">All ({run.results.length})</TabsTrigger>
                  <TabsTrigger value="failed">Failed ({failedRows.length})</TabsTrigger>
                  <TabsTrigger value="passed">Passed ({passedRows.length})</TabsTrigger>
                </TabsList>
              </Tabs>
              <DataTable
                columns={columns}
                data={shown}
                onRowClick={setSel}
                rowClassName={(r) => (r.status === "failed" || r.status === "error" ? "bg-red-50 hover:bg-red-100" : undefined)}
              />
            </CardContent>
          </Card>
        </>
      )}
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {sel && (
            <>
              <SheetHeader>
                <SheetTitle>{sel.test_name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <StatusBadge status={sel.status} /> <MethodBadge method={sel.method} /> <Mono>{sel.url}</Mono>
                </SheetDescription>
              </SheetHeader>
              <Tabs defaultValue={sel.diagnosis ? "diagnosis" : "request"} key={sel.test_id} className="px-4 pb-4">
                <TabsList>
                  <TabsTrigger value="diagnosis">AI Diagnosis</TabsTrigger>
                  <TabsTrigger value="request">Request</TabsTrigger>
                  <TabsTrigger value="response">Response</TabsTrigger>
                  <TabsTrigger value="assertions">Assertions</TabsTrigger>
                </TabsList>
                <TabsContent value="request" className="pt-3">
                  <Json value={sel.request} />
                </TabsContent>
                <TabsContent value="response" className="space-y-2 pt-3">
                  {sel.error && (
                    <Alert variant="destructive">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{sel.error}</AlertDescription>
                    </Alert>
                  )}
                  <Json value={sel.response} />
                </TabsContent>
                <TabsContent value="assertions" className="space-y-2 pt-3">
                  {sel.assertion_results.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {a.passed ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                      )}
                      <div>
                        <Mono>{a.assertion.type}</Mono> <span className="text-muted-foreground">{a.message}</span>
                      </div>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="diagnosis" className="pt-3">
                  {sel.diagnosis ? (
                    <Alert className={sel.diagnosis.category === "api_defect" ? "border-red-200 bg-red-50" : sel.diagnosis.category === "invalid_test" ? "border-amber-200 bg-amber-50" : ""}>
                      <AlertTitle>
                        <DiagnosisBadge category={sel.diagnosis.category} />
                      </AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>{sel.diagnosis.explanation}</p>
                        <p>
                          <strong>Suggested fix:</strong> {sel.diagnosis.suggested_fix}
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <p className="text-sm text-muted-foreground">No diagnosis (test passed).</p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
