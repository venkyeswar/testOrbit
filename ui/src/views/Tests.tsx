import { useEffect, useMemo, useState } from "react"
import { CheckCheck, Play, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { LegacyColumnDef } from "@tanstack/react-table/legacy"
import { api } from "@/api"
import { CATEGORIES, type Project, type TestCase } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, EmptyState, LoadingRows, MethodBadge, Mono, PageHeader, pretty } from "@/components/common"
import type { View } from "@/App"

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

export function TestsView({
  project,
  onRunDone,
  go,
}: {
  project: Project
  onRunDone: (runId: string) => void
  go: (v: View) => void
}) {
  const [tests, setTests] = useState<TestCase[] | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [cat, setCat] = useState("all")
  const [open, setOpen] = useState<TestCase | null>(null)
  const [running, setRunning] = useState(false)

  const load = () => api.tests(project.id).then(setTests).catch((e) => (toast.error(e.message), setTests([])))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const rows = useMemo(
    () =>
      (tests ?? []).filter(
        (t) =>
          (cat === "all" || t.category === cat) &&
          (t.name + t.path).toLowerCase().includes(search.toLowerCase()),
      ),
    [tests, search, cat],
  )

  const approve = async () => {
    try {
      const upd = await api.approve(project.id, sel, true)
      setTests((cur) => (cur ?? []).map((t) => upd.find((u) => u.id === t.id) ?? t))
      toast.success(`Approved ${sel.length} tests`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const run = async () => {
    setRunning(true)
    try {
      const r = await api.run(project.id)
      toast.success("Run started")
      onRunDone(r.id)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => sel.includes(r.id))
  const columns: LegacyColumnDef<TestCase, any>[] = [
    {
      id: "sel",
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={(c) => setSel(c ? rows.map((r) => r.id) : [])}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={sel.includes(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(c) =>
            setSel((s) => (c ? [...s, row.original.id] : s.filter((x) => x !== row.original.id)))
          }
        />
      ),
    },
    {
      header: "#",
      cell: ({ row }) =>
        row.original.category === "workflow" ? (
          <Badge variant="secondary" className="font-mono">step {row.original.order}</Badge>
        ) : (
          row.original.order
        ),
    },
    {
      header: "Name",
      cell: ({ row }) => {
        const t = row.original
        const uses = [...new Set([...JSON.stringify([t.path, t.body, t.headers, t.query]).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
        return (
          <div className="space-y-1">
            <div className="font-medium">{t.name}</div>
            <div className="flex flex-wrap gap-1">
              {uses.map((v) => (
                <Badge key={"u" + v} variant="outline" className="font-mono text-[10px]">uses {`{{${v}}}`}</Badge>
              ))}
              {Object.keys(t.extract ?? {}).map((v) => (
                <Badge key={"e" + v} variant="secondary" className="bg-blue-100 font-mono text-[10px] text-blue-700">extracts {v}</Badge>
              ))}
            </div>
          </div>
        )
      },
    },
    { header: "Category", cell: ({ row }) => <Badge variant="outline">{row.original.category}</Badge> },
    {
      header: "Endpoint",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <MethodBadge method={row.original.method} /> <Mono>{row.original.path}</Mono>
        </div>
      ),
    },
    { header: "Expected", cell: ({ row }) => <Mono>{row.original.expected_status.join(", ")}</Mono> },
    {
      header: "Approved",
      cell: ({ row }) => (
        <Switch
          checked={row.original.approved}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={async (v) => {
            const id = row.original.id
            setTests((cur) => (cur ?? []).map((t) => (t.id === id ? { ...t, approved: v } : t)))
            try {
              await api.approve(project.id, [id], v)
            } catch (e) {
              toast.error((e as Error).message)
              setTests((cur) => (cur ?? []).map((t) => (t.id === id ? { ...t, approved: !v } : t)))
            }
          }}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Test Cases" description="Review, edit and approve AI-generated tests before running them." />
      {tests === null ? (
        <LoadingRows />
      ) : tests.length === 0 ? (
        <EmptyState text="No tests yet. Generate some from the API Explorer." action="Open API Explorer" onAction={() => go("explorer")} />
      ) : (
        <>
          <div className="sticky top-12 z-10 -mx-2 flex flex-wrap items-center gap-2 bg-background/95 px-2 py-2 backdrop-blur">
            <Input className="w-64" placeholder="Search tests..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="ml-auto flex gap-2">
              <Button variant="outline" disabled={!sel.length} onClick={approve}>
                <CheckCheck /> Approve selected
              </Button>
              <Button disabled={running || !tests.some((t) => t.approved)} onClick={run}>
                {running ? <Spinner /> : <Play />} Run approved tests
              </Button>
            </div>
          </div>
          <Tabs value={cat} onValueChange={(v) => setCat(String(v))}>
            <TabsList>
              <TabsTrigger value="all">All ({tests.length})</TabsTrigger>
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c} value={c}>
                  {c} ({tests.filter((t) => t.category === c).length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Card>
            <CardContent>
              <DataTable columns={columns} data={rows} onRowClick={setOpen} />
            </CardContent>
          </Card>
        </>
      )}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open && (
            <TestEditor
              key={open.id}
              test={open}
              onSaved={(t) => {
                setTests((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)))
                setOpen(null)
              }}
              onDeleted={() => {
                setTests((cur) => (cur ?? []).filter((x) => x.id !== open.id))
                setOpen(null)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function TestEditor({
  test,
  onSaved,
  onDeleted,
}: {
  test: TestCase
  onSaved: (t: TestCase) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(test.name)
  const [method, setMethod] = useState(test.method)
  const [path, setPath] = useState(test.path)
  const [headers, setHeaders] = useState(pretty(test.headers))
  const [body, setBody] = useState(pretty(test.body))
  const [assertions, setAssertions] = useState(pretty(test.assertions))
  const [extract, setExtract] = useState(pretty(test.extract))
  const [status, setStatus] = useState(test.expected_status.join(", "))
  const [approved, setApproved] = useState(test.approved)

  const save = async () => {
    try {
      const t = await api.patchTest(test.id, {
        name,
        method,
        path,
        headers: JSON.parse(headers),
        body: JSON.parse(body),
        assertions: JSON.parse(assertions),
        extract: JSON.parse(extract),
        expected_status: status.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)),
        approved,
      })
      toast.success("Test saved")
      onSaved(t)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const del = async () => {
    try {
      await api.deleteTest(test.id)
      toast.success("Test deleted")
      onDeleted()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const json = (label: string, v: string, set: (s: string) => void) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea className="h-24 font-mono text-xs" value={v} onChange={(e) => set(e.target.value)} />
    </div>
  )

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit test</SheetTitle>
        <SheetDescription>{test.description}</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 px-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger className="w-28 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label>Path</Label>
            <Input className="font-mono" value={path} onChange={(e) => setPath(e.target.value)} />
          </div>
        </div>
        {json("Headers", headers, setHeaders)}
        {json("Body", body, setBody)}
        {json("Assertions", assertions, setAssertions)}
        {json("Extract", extract, setExtract)}
        <div className="space-y-1.5">
          <Label>Expected status (comma separated)</Label>
          <Input className="font-mono" value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="appr" checked={approved} onCheckedChange={setApproved} />
          <Label htmlFor="appr">Approved</Label>
        </div>
      </div>
      <SheetFooter className="flex-row">
        <Button onClick={save}>
          <Save /> Save
        </Button>
        <Button variant="destructive" onClick={del}>
          <Trash2 /> Delete
        </Button>
      </SheetFooter>
    </>
  )
}
