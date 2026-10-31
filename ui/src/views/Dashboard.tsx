import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Cpu, CheckCircle2, Circle, ListChecks, Server, ShieldCheck, Target, Telescope } from "lucide-react"
import { api } from "@/api"
import { CATEGORIES, type ModelConfig, type Project, type Run, type TestCase } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { NoModelBanner } from "@/components/ModelBanner"
import { Mono, PageHeader, StatCard, authSummary } from "@/components/common"
import { RunsTable } from "@/views/Runs"
import type { View } from "@/App"

const trendCfg = { rate: { label: "Pass rate %", color: "#16a34a" } } satisfies ChartConfig
const catCfg = { count: { label: "Tests", color: "#22c55e" } } satisfies ChartConfig

export function DashboardView({
  project,
  models,
  modelsLoading,
  go,
  openRun,
  onChanged,
}: {
  project: Project
  models: ModelConfig[]
  modelsLoading: boolean
  go: (v: View) => void
  openRun: (id: string) => void
  onChanged: () => void
}) {
  const [tests, setTests] = useState<TestCase[] | null>(null)
  const [runs, setRuns] = useState<Run[] | null>(null)

  useEffect(() => {
    setTests(null)
    setRuns(null)
    api.tests(project.id).then(setTests).catch(() => setTests([]))
    api.runs(project.id).then(setRuns).catch(() => setRuns([]))
  }, [project.id])

  const pct = (r: Run) => (r.summary.total ? Math.round((r.summary.passed / r.summary.total) * 100) : 0)
  const last = runs?.[0]
  const trend = useMemo(
    () => [...(runs ?? [])].reverse().map((r, i) => ({ name: `#${i + 1}`, rate: pct(r) })),
    [runs],
  )
  const byCat = useMemo(
    () => CATEGORIES.map((c) => ({ category: c, count: (tests ?? []).filter((t) => t.category === c).length })),
    [tests],
  )
  const approved = tests?.filter((t) => t.approved).length
  const loaded = tests !== null && runs !== null
  const noModels = !modelsLoading && models.length === 0
  const modelItems = [
    { value: "default", label: "Default model" },
    ...models.map((m) => ({ value: m.id, label: m.name })),
  ]
  const changeModel = async (v: string) => {
    try {
      await api.updateProject(project.id, { model_config_id: v === "default" ? null : v })
      toast.success("Project model updated")
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const steps = [
    { title: "Add an AI model", desc: models.length ? `${models.length} configured` : "Bring your own LLM", done: models.length > 0, view: "models" as View },
    { title: "Explore endpoints", desc: `${project.endpoint_count} endpoints imported`, done: project.endpoint_count > 0, view: "explorer" as View },
    { title: "Generate tests", desc: "Pick endpoints and let AI write tests", done: (tests?.length ?? 0) > 0, view: "explorer" as View },
    { title: "Approve", desc: "Review and approve generated tests", done: (approved ?? 0) > 0, view: "tests" as View },
    { title: "Run", desc: "Execute approved tests and get AI diagnosis", done: (runs?.length ?? 0) > 0, view: "tests" as View },
  ]
  const authLabel = authSummary(project.auth)

  return (
    <>
      {noModels && <NoModelBanner onConfigure={() => go("models")} />}
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Mono className="rounded bg-muted px-1.5 py-0.5">{project.base_url}</Mono>
            <Badge
              variant="secondary"
              className={project.auth.type === "none" ? "" : project.auth.detected ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}
            >
              <ShieldCheck /> auth: {authLabel}
            </Badge>
            <Badge variant="secondary">
              <Cpu /> {models.find((m) => m.id === project.model_config_id)?.name ?? "Default model"}
            </Badge>
            {models.length > 0 && (
              <Select items={modelItems} value={project.model_config_id ?? "default"} onValueChange={(v) => v && changeModel(v as string)}>
                <SelectTrigger size="sm" aria-label="Change model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelItems.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => go("explorer")}>
            <Telescope /> Explore API
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Endpoints" icon={Server} value={project.endpoint_count} description="Parsed from the spec" />
        <StatCard label="Tests" icon={ListChecks} value={tests?.length} description="Generated by AI" />
        <StatCard label="Approved" icon={CheckCircle2} value={approved} description="Ready to run" />
        <StatCard
          label="Last run pass rate"
          icon={Target}
          value={runs ? (last ? `${pct(last)}%` : "-") : undefined}
          description={last ? `${last.summary.passed}/${last.summary.total} passed` : "No runs yet"}
          tone={last && pct(last) < 100 ? "amber" : "green"}
        />
      </div>
      {loaded && (tests.length === 0 || runs.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>Five steps from spec to a diagnosed test run.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            {steps.map((s, i) => (
              <div key={s.title} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.done ? <CheckCircle2 className="size-5 text-green-600" /> : <Circle className="size-5 text-muted-foreground" />}
                  {i + 1}. {s.title}
                </div>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
                {!s.done && (
                  <Button size="sm" variant="outline" className="mt-auto" onClick={() => go(s.view)}>
                    Go
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pass rate trend</CardTitle>
            <CardDescription>Across runs, oldest to newest</CardDescription>
          </CardHeader>
          <CardContent>
            {runs === null ? (
              <Skeleton className="h-48 w-full" />
            ) : trend.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Run some tests to see the trend.</p>
            ) : (
              <ChartContainer config={trendCfg} className="h-48 w-full">
                <AreaChart data={trend}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} width={32} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="rate" type="monotone" stroke="var(--color-rate)" fill="var(--color-rate)" fillOpacity={0.2} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tests by category</CardTitle>
            <CardDescription>Coverage of generated tests</CardDescription>
          </CardHeader>
          <CardContent>
            {tests === null ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ChartContainer config={catCfg} className="h-48 w-full">
                <BarChart data={byCat} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <YAxis dataKey="category" type="category" width={76} tickLine={false} axisLine={false} />
                  <XAxis type="number" allowDecimals={false} hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Click a run to see diagnosed failures</CardDescription>
        </CardHeader>
        <CardContent>
          {runs === null ? <Skeleton className="h-24 w-full" /> : <RunsTable runs={runs.slice(0, 5)} onOpen={openRun} />}
        </CardContent>
      </Card>
    </>
  )
}
