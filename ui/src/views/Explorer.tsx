import { useEffect, useMemo, useState } from "react"
import { Lock, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import { CATEGORIES, type Category, type Endpoint, type Project } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { NoModelBanner } from "@/components/ModelBanner"
import type { View } from "@/App"
import { EmptyState, Json, LoadingRows, MethodBadge, Mono, PageHeader } from "@/components/common"

export function ExplorerView({
  project,
  hasModels,
  go,
  selected,
  setSelected,
  onGenerated,
}: {
  project: Project
  hasModels: boolean
  go: (v: View) => void
  selected: string[]
  setSelected: (ids: string[]) => void
  onGenerated: () => void
}) {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null)
  const [active, setActive] = useState<Endpoint | null>(null)
  const [cats, setCats] = useState<Category[]>(["happy_path", "negative"])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState("")

  useEffect(() => {
    api
      .endpoints(project.id)
      .then((e) => {
        setEndpoints(e)
        setActive(e[0] ?? null)
      })
      .catch((e) => {
        toast.error(e.message)
        setEndpoints([])
      })
  }, [project.id])

  const groups = useMemo(() => {
    const m = new Map<string, Endpoint[]>()
    for (const e of endpoints ?? []) {
      if (q && !(e.path + e.method + e.summary).toLowerCase().includes(q.toLowerCase())) continue
      const tag = e.tags[0] ?? "default"
      m.set(tag, [...(m.get(tag) ?? []), e])
    }
    return [...m.entries()]
  }, [endpoints, q])

  const toggle = (id: string, on: boolean) =>
    setSelected(on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id))

  const authIds = new Set([project.auth.signup?.endpoint_id, project.auth.signin?.endpoint_id].filter(Boolean))
  const toggleGroup = (eps: Endpoint[], on: boolean) => {
    const ids = eps.map((e) => e.id)
    setSelected(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)))
  }

  const generate = async () => {
    setBusy(true)
    try {
      const t = await api.generate(project.id, selected, cats)
      toast.success(`Generated ${t.length} tests`)
      onGenerated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (endpoints === null) return <LoadingRows />
  if (endpoints.length === 0) return <EmptyState text="No endpoints found for this project." />

  return (
    <>
      {!hasModels && <NoModelBanner onConfigure={() => go("models")} />}
      <PageHeader
        title="API Explorer"
        description={`${endpoints.length} endpoints. Select the ones you want AI to write tests for.`}
        actions={<Badge variant="secondary">{selected.length} selected</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <div className="relative px-4">
            <Search className="absolute top-2.5 left-7 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search endpoints..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ScrollArea className="h-[55vh]">
            <div className="space-y-4 px-4">
              {groups.length === 0 && <p className="text-sm text-muted-foreground">No matching endpoints.</p>}
              {groups.map(([tag, eps]) => (
                <div key={tag} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                    <Checkbox
                      checked={eps.every((e) => selected.includes(e.id))}
                      onCheckedChange={(c) => toggleGroup(eps, !!c)}
                    />
                    {tag} <Badge variant="secondary">{eps.length}</Badge>
                  </div>
                  {eps.map((e) => (
                    <div
                      key={e.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md p-1.5 ${active?.id === e.id ? "bg-accent" : "hover:bg-muted"}`}
                      onClick={() => setActive(e)}
                    >
                      <Checkbox
                        checked={selected.includes(e.id)}
                        onClick={(ev) => ev.stopPropagation()}
                        onCheckedChange={(c) => toggle(e.id, !!c)}
                      />
                      <MethodBadge method={e.method} />
                      <Mono className="truncate">{e.path}</Mono>
                      <span className="ml-auto flex items-center gap-1">
                        {authIds.has(e.id) && <Badge variant="outline" className="text-[10px]">auth flow</Badge>}
                        {e.requires_auth && <Lock className="size-3.5 text-muted-foreground" />}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
        {active && (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-lg">
                <MethodBadge method={active.method} /> <Mono className="text-base">{active.path}</Mono>
                {active.requires_auth ? (
                  <Badge variant="outline"><Lock /> requires auth</Badge>
                ) : (
                  <Badge variant="secondary">public</Badge>
                )}
                {authIds.has(active.id) && <Badge variant="outline">auth flow</Badge>}
              </CardTitle>
              <CardDescription>{active.summary || "No summary"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="params">
                <TabsList>
                  <TabsTrigger value="params">Parameters</TabsTrigger>
                  <TabsTrigger value="request">Request schema</TabsTrigger>
                  <TabsTrigger value="responses">Responses</TabsTrigger>
                </TabsList>
                <TabsContent value="params" className="pt-3">
                  <Json value={active.parameters} />
                </TabsContent>
                <TabsContent value="request" className="pt-3">
                  <Json value={active.request_schema} />
                </TabsContent>
                <TabsContent value="responses" className="pt-3">
                  <Json value={active.responses} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
      {busy && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Spinner /> Generating tests... this can take ~30s
            </div>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </CardContent>
        </Card>
      )}
      <Card className="sticky bottom-4 shadow-md">
        <CardContent className="flex flex-wrap items-center gap-4">
          {CATEGORIES.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Checkbox
                id={`cat-${c}`}
                checked={cats.includes(c)}
                onCheckedChange={(v) => setCats(v ? [...cats, c] : cats.filter((x) => x !== c))}
              />
              <Label htmlFor={`cat-${c}`}>{c}</Label>
            </div>
          ))}
          {hasModels ? (
            <Button className="ml-auto" disabled={busy || !selected.length || !cats.length} onClick={generate}>
              {busy ? <Spinner /> : <Sparkles />}
              {busy ? "Generating..." : `Generate tests (${selected.length})`}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span className="ml-auto" />}>
                <Button disabled>
                  <Sparkles /> Generate tests ({selected.length})
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add an AI model under Models to generate tests.</TooltipContent>
            </Tooltip>
          )}
        </CardContent>
      </Card>
    </>
  )
}
