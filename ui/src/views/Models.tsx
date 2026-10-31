import { useEffect, useState } from "react"
import { CheckCircle2, Cpu, MoreHorizontal, Pencil, Plus, Star, Trash2, XCircle, Zap } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import type { ModelConfig, ModelConfigIn, ModelTestResult, Provider, ProviderField, ProviderInfo } from "@/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { DataTable, EmptyState, LoadingRows, Mono, PageHeader } from "@/components/common"
import type { LegacyColumnDef } from "@tanstack/react-table/legacy"

const FIELD_LABELS: Record<ProviderField, string> = {
  api_key: "API key",
  base_url: "Base URL",
  api_version: "API version",
  deployment: "Deployment name",
}

function TestResultAlert({ r }: { r: ModelTestResult }) {
  return r.ok ? (
    <Alert className="border-green-200 bg-green-50 text-green-800">
      <CheckCircle2 />
      <AlertTitle>Connection OK{r.latency_ms != null ? ` · ${Math.round(r.latency_ms)} ms` : ""}</AlertTitle>
      {r.reply && <AlertDescription className="font-mono text-xs">{r.reply}</AlertDescription>}
    </Alert>
  ) : (
    <Alert variant="destructive">
      <XCircle />
      <AlertTitle>Connection failed</AlertTitle>
      <AlertDescription>{r.error ?? "Unknown error"}</AlertDescription>
    </Alert>
  )
}

function ModelDialog({
  open,
  onOpenChange,
  providers,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  providers: ProviderInfo[]
  editing: ModelConfig | null
  onSaved: () => void
}) {
  const [provider, setProvider] = useState<Provider>("openai")
  const [name, setName] = useState("")
  const [model, setModel] = useState("")
  const [vals, setVals] = useState<Record<ProviderField, string>>({ api_key: "", base_url: "", api_version: "", deployment: "" })
  const [temperature, setTemperature] = useState("0.2")
  const [isDefault, setIsDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ModelTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const info = providers.find((p) => p.id === provider)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError(null)
    if (editing) {
      setProvider(editing.provider)
      setName(editing.name)
      setModel(editing.model)
      setVals({
        api_key: "",
        base_url: editing.base_url ?? "",
        api_version: editing.api_version ?? "",
        deployment: editing.deployment ?? "",
      })
      setTemperature(String(editing.temperature))
      setIsDefault(editing.is_default)
    } else {
      const first = providers[0]
      setProvider(first?.id ?? "openai")
      setName("")
      setModel("")
      setVals({ api_key: "", base_url: first?.default_base_url ?? "", api_version: "", deployment: "" })
      setTemperature("0.2")
      setIsDefault(false)
    }
  }, [open, editing, providers])

  const pickProvider = (id: Provider) => {
    setProvider(id)
    setResult(null)
    const p = providers.find((x) => x.id === id)
    setVals((v) => ({ ...v, base_url: p?.default_base_url ?? "" }))
  }

  const setVal = (f: ProviderField, v: string) => setVals((s) => ({ ...s, [f]: v }))

  const build = (): ModelConfigIn => {
    const body: ModelConfigIn = { name: name.trim(), provider, model: model.trim() }
    for (const f of info?.fields ?? []) {
      const v = vals[f].trim()
      if (f === "api_key") {
        if (v) body.api_key = v
      } else if (v) body[f] = v
    }
    const t = parseFloat(temperature)
    if (!Number.isNaN(t)) body.temperature = t
    body.is_default = isDefault
    return body
  }

  const missing = (info?.required ?? []).some((f) => !vals[f].trim() && !(f === "api_key" && editing?.has_api_key))
  const invalid = !name.trim() || !model.trim() || missing

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      const keyChanged = !!vals.api_key.trim()
      setResult(editing && !keyChanged ? await api.testModel(editing.id) : await api.testModelDraft(build()))
    } catch (e) {
      setResult({ ok: false, latency_ms: null, reply: null, error: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (editing) await api.updateModel(editing.id, build())
      else await api.createModel(build())
      toast.success(editing ? "Model updated" : "Model added")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const providerItems = providers.map((p) => ({ value: p.id, label: p.label }))
  const presetItems = (info?.presets ?? []).map((p) => ({ value: p.base_url, label: p.label }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit model" : "Add model"}</DialogTitle>
          <DialogDescription>Keys are encrypted at rest and never shown again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select items={providerItems} value={provider} disabled={!!editing} onValueChange={(v) => v && pickProvider(v as Provider)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providerItems.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-name">Name</Label>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My model" />
          </div>
          {provider === "openai_compatible" && presetItems.length > 0 && (
            <div className="space-y-1.5">
              <Label>Preset</Label>
              <Select items={presetItems} value={null} onValueChange={(v) => v && setVal("base_url", v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a preset (Groq, OpenRouter, ...)" />
                </SelectTrigger>
                <SelectContent>
                  {presetItems.map((p) => (
                    <SelectItem key={p.label} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(info?.fields ?? []).map((f) => {
            const req = info?.required.includes(f)
            return (
              <div key={f} className="space-y-1.5">
                <Label htmlFor={`m-${f}`}>
                  {FIELD_LABELS[f]} {req && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={`m-${f}`}
                  type={f === "api_key" ? "password" : "text"}
                  autoComplete={f === "api_key" ? "new-password" : "off"}
                  className={f === "api_key" ? undefined : f === "base_url" ? "font-mono text-xs" : undefined}
                  value={vals[f]}
                  onChange={(e) => setVal(f, e.target.value)}
                  placeholder={
                    f === "api_key" && editing?.has_api_key
                      ? `${editing.api_key_hint ?? "saved"} (leave empty to keep)`
                      : f === "base_url"
                        ? (info?.default_base_url ?? "https://...")
                        : ""
                  }
                />
              </div>
            )
          })}
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-model">
                Model <span className="text-destructive">*</span>
              </Label>
              <Input id="m-model" className="font-mono text-xs" value={model} onChange={(e) => setModel(e.target.value)} placeholder={info?.model_placeholder} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-temp">Temperature</Label>
              <Input id="m-temp" type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="m-default" checked={isDefault} onCheckedChange={setIsDefault} />
            <Label htmlFor="m-default">Set as default</Label>
          </div>
          {result && <TestResultAlert r={result} />}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={invalid || testing || busy} onClick={test}>
            {testing ? <Spinner /> : <Zap />} Test connection
          </Button>
          <Button disabled={invalid || busy} onClick={save}>
            {busy && <Spinner />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ModelsView({
  models,
  loading,
  onChanged,
}: {
  models: ModelConfig[]
  loading: boolean
  onChanged: () => void
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ModelConfig | null>(null)
  const [toDelete, setToDelete] = useState<ModelConfig | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  useEffect(() => {
    api.providers().then(setProviders).catch((e) => toast.error(e.message))
  }, [])

  const label = (id: Provider) => providers.find((p) => p.id === id)?.label ?? id
  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const testRow = async (m: ModelConfig) => {
    setTestingId(m.id)
    try {
      const r = await api.testModel(m.id)
      if (r.ok) toast.success(`${m.name}: OK${r.latency_ms != null ? ` (${Math.round(r.latency_ms)} ms)` : ""}`)
      else toast.error(`${m.name}: ${r.error ?? "failed"}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTestingId(null)
    }
  }

  const setDefault = async (m: ModelConfig) => {
    try {
      await api.updateModel(m.id, { is_default: true })
      toast.success(`${m.name} is now the default`)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const doDelete = async () => {
    if (!toDelete) return
    try {
      await api.deleteModel(toDelete.id)
      toast.success("Model deleted")
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setToDelete(null)
    }
  }

  const columns: LegacyColumnDef<ModelConfig, any>[] = [
    { header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { header: "Provider", cell: ({ row }) => <Badge variant="secondary">{label(row.original.provider)}</Badge> },
    { header: "Model", cell: ({ row }) => <Mono>{row.original.model}</Mono> },
    { header: "Base URL", cell: ({ row }) => <Mono className="text-muted-foreground">{row.original.base_url ?? "-"}</Mono> },
    { header: "Key", cell: ({ row }) => <Mono className="text-muted-foreground">{row.original.api_key_hint ?? (row.original.has_api_key ? "saved" : "-")}</Mono> },
    {
      header: "Default",
      cell: ({ row }) => (row.original.is_default ? <Badge className="bg-green-100 text-green-700"><Star /> default</Badge> : null),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const m = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()} />}>
              {testingId === m.id ? <Spinner /> : <MoreHorizontal />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(m)
                  setDialogOpen(true)
                }}
              >
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => testRow(m)}>
                <Zap /> Test connection
              </DropdownMenuItem>
              <DropdownMenuItem disabled={m.is_default} onClick={() => setDefault(m)}>
                <Star /> Set as default
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setToDelete(m)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="AI Models"
        description="Bring your own model. TestOrbit uses it to generate tests, detect auth flows and diagnose failures. Keys are encrypted at rest."
        actions={
          <Button onClick={openAdd}>
            <Plus /> Add model
          </Button>
        }
      />
      {loading ? (
        <LoadingRows />
      ) : models.length === 0 ? (
        <EmptyState
          icon={Cpu}
          text="No models yet — add your OpenAI, Anthropic, Gemini, Azure, Ollama or any OpenAI-compatible model."
          action="Add model"
          onAction={openAdd}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your models</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={columns} data={models} />
          </CardContent>
        </Card>
      )}
      <ModelDialog open={dialogOpen} onOpenChange={setDialogOpen} providers={providers} editing={editing} onSaved={onChanged} />
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Projects using this model will fall back to your default model.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={doDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
