import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import type { ModelConfig, Project } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, EmptyState, LoadingRows, Mono, PageHeader, authSummary, fmtDate } from "@/components/common"
import type { LegacyColumnDef } from "@tanstack/react-table/legacy"

export function ProjectsView(props: {
  projects: Project[]
  models: ModelConfig[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onCreated: (p: Project) => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [specUrl, setSpecUrl] = useState("")
  const [specJson, setSpecJson] = useState("")
  const [modelId, setModelId] = useState("default")
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const body: Parameters<typeof api.createProject>[0] = { name, base_url: baseUrl }
      if (specJson.trim()) body.spec = JSON.parse(specJson)
      else body.spec_url = specUrl
      if (modelId !== "default") body.model_config_id = modelId
      const p = await api.createProject(body)
      toast.success(`Detected ${p.endpoint_count} endpoints · auth: ${authSummary(p.auth)}`)
      setOpen(false)
      setName("")
      setBaseUrl("")
      setSpecUrl("")
      setSpecJson("")
      setModelId("default")
      props.onCreated(p)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const modelItems = [
    { value: "default", label: "Use default model" },
    ...props.models.map((m) => ({ value: m.id, label: m.name })),
  ]

  const columns: LegacyColumnDef<Project, any>[] = [
    { header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { header: "Base URL", cell: ({ row }) => <Mono>{row.original.base_url}</Mono> },
    { header: "Endpoints", cell: ({ row }) => <Badge variant="secondary">{row.original.endpoint_count}</Badge> },
    {
      header: "Auth",
      cell: ({ row }) => {
        const a = row.original.auth
        return (
          <Badge variant="secondary" className={a.type === "none" ? "" : a.detected ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
            {authSummary(a)}
          </Badge>
        )
      },
    },
    { header: "Created", cell: ({ row }) => fmtDate(row.original.created_at) },
    {
      header: "",
      id: "del",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={async (e) => {
            e.stopPropagation()
            try {
              await api.deleteProject(row.original.id)
              toast.success("Project deleted")
              props.onChanged()
            } catch (err) {
              toast.error((err as Error).message)
            }
          }}
        >
          <Trash2 />
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Projects"
        description="APIs under test. Authentication is detected automatically from each spec."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New project
          </Button>
        }
      />
      {props.loading ? (
        <LoadingRows />
      ) : props.projects.length === 0 ? (
        <EmptyState text="No projects yet." action="New project" onAction={() => setOpen(true)} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All projects</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={props.projects} onRowClick={(p) => props.onSelect(p.id)} />
          </CardContent>
        </Card>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Point TestOrbit at an API and its OpenAPI spec.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pn">Name</Label>
              <Input id="pn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Petstore" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb">Target base URL</Label>
              <Input id="pb" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:9000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps">OpenAPI spec URL</Label>
              <Input id="ps" value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} placeholder="http://localhost:9000/openapi.json" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pj">...or paste spec JSON</Label>
              <Textarea id="pj" className="h-28 font-mono text-xs" value={specJson} onChange={(e) => setSpecJson(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>AI model</Label>
              <Select items={modelItems} value={modelId} onValueChange={(v) => v && setModelId(v as string)}>
                <SelectTrigger className="w-full">
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
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy || !name || !baseUrl || (!specUrl && !specJson.trim())} onClick={create}>
              {busy && <Spinner />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
