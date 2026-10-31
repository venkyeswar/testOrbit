import { useCallback, useEffect, useState } from "react"
import {
  ChevronsUpDown,
  Cpu,
  LogOut,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Orbit,
  Play,
  ShieldCheck,
  Telescope,
} from "lucide-react"
import { api, getToken, onUnauthorized, setToken } from "@/api"
import type { ModelConfig, Project, User } from "@/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { EmptyState } from "@/components/common"
import { ProjectsView } from "@/views/Projects"
import { DashboardView } from "@/views/Dashboard"
import { ExplorerView } from "@/views/Explorer"
import { TestsView } from "@/views/Tests"
import { AuthView } from "@/views/Auth"
import { RunsView } from "@/views/Runs"
import { LoginView } from "@/views/Login"
import { ModelsView } from "@/views/Models"

export type View = "dashboard" | "projects" | "explorer" | "tests" | "auth" | "runs" | "models"

const NAV_GROUPS: { label: string; items: { id: View; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Testing",
    items: [
      { id: "explorer", label: "API Explorer", icon: Telescope },
      { id: "tests", label: "Test Cases", icon: ListChecks },
      { id: "runs", label: "Runs", icon: Play },
    ],
  },
  {
    label: "Project",
    items: [
      { id: "auth", label: "Authentication", icon: ShieldCheck },
      { id: "projects", label: "Projects", icon: FolderKanban },
    ],
  },
  { label: "Settings", items: [{ id: "models", label: "Models", icon: Cpu }] },
]
const NAV = NAV_GROUPS.flatMap((g) => g.items)

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [view, setView] = useState<View>("dashboard")
  const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(() => !!getToken())
  const [models, setModels] = useState<ModelConfig[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)

  const refresh = useCallback(async (selectId?: string) => {
    try {
      const list = await api.listProjects()
      setProjects(list)
      setProjectId((cur) => selectId ?? (cur && list.some((p) => p.id === cur) ? cur : (list[0]?.id ?? null)))
    } catch {
      /* backend may be down */
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      setModels(await api.listModels())
    } catch {
      /* ignore */
    } finally {
      setModelsLoading(false)
    }
  }, [])

  // Session bootstrap + global 401 handling
  useEffect(() => {
    const off = onUnauthorized(() => {
      setUser(null)
      setProjects([])
      setModels([])
      setProjectId(null)
    })
    if (getToken()) {
      api
        .me()
        .then(setUser)
        .catch(() => setToken(null))
        .finally(() => setChecking(false))
    }
    return off
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setModelsLoading(true)
    refresh()
    refreshModels()
  }, [user, refresh, refreshModels])

  const signOut = () => {
    setToken(null)
    setUser(null)
    setProjects([])
    setModels([])
    setProjectId(null)
    setView("dashboard")
  }

  const project = projects.find((p) => p.id === projectId) ?? null
  const go = (v: View) => {
    if (v === "runs") setRunId(null)
    setView(v)
  }
  const openRun = (id: string) => {
    setRunId(id)
    setView("runs")
  }
  const hasModels = models.length > 0
  const label = NAV.find((n) => n.id === view)!.label

  let content
  if (view === "models") {
    content = <ModelsView models={models} loading={modelsLoading} onChanged={refreshModels} />
  } else if (view === "projects") {
    content = (
      <ProjectsView
        projects={projects}
        loading={loading}
        models={models}
        selectedId={projectId}
        onSelect={(id) => {
          setProjectId(id)
          setView("dashboard")
        }}
        onCreated={async (p) => {
          await refresh(p.id)
          setView("explorer")
        }}
        onChanged={() => refresh()}
      />
    )
  } else if (!project) {
    content = (
      <EmptyState
        text="Create a project to get started."
        action="New project"
        onAction={() => setView("projects")}
      />
    )
  } else if (view === "dashboard") {
    content = <DashboardView
        project={project}
        models={models}
        modelsLoading={modelsLoading}
        go={go}
        openRun={openRun}
        onChanged={() => refresh()}
      />
  } else if (view === "explorer") {
    content = (
      <ExplorerView
        key={project.id}
        project={project}
        hasModels={hasModels || modelsLoading}
        go={go}
        selected={selectedEndpoints}
        setSelected={setSelectedEndpoints}
        onGenerated={() => setView("tests")}
      />
    )
  } else if (view === "tests") {
    content = <TestsView key={project.id} project={project} onRunDone={openRun} go={go} />
  } else if (view === "auth") {
    content = <AuthView key={project.id} project={project} onChanged={() => refresh()} />
  } else {
    content = <RunsView key={project.id} project={project} runId={runId} setRunId={setRunId} go={go} />
  }

  const action =
    view === "tests" || view === "models" ? null : view === "dashboard" ? (
      <Button size="sm" onClick={() => go("tests")}>
        <Play /> Run approved tests
      </Button>
    ) : view === "explorer" ? (
      <Button size="sm" variant="outline" onClick={() => go("tests")}>
        <ListChecks /> Review tests
      </Button>
    ) : view === "projects" ? null : (
      <Button size="sm" variant="outline" onClick={() => go("explorer")}>
        <Telescope /> API Explorer
      </Button>
    )

  const initials = (user?.name || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("")

  if (checking) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8 text-primary" />
      </div>
    )
  }
  if (!user) {
    return (
      <>
        <LoginView onAuthed={setUser} />
        <Toaster theme="light" richColors />
      </>
    )
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="gap-3 p-3">
          <div className="flex items-center gap-2 px-1">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Orbit className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">TestOrbit</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="h-auto w-full justify-between px-3 py-2" />}>
              <span className="flex min-w-0 flex-col items-start text-left">
                <span className="text-[10px] uppercase text-muted-foreground">Project</span>
                <span className="w-full truncate text-sm font-medium">{project?.name ?? "Select project"}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Switch project</DropdownMenuLabel>
              {projects.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setProjectId(p.id)}>
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView("projects")}>Manage projects...</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarHeader>
        <SidebarContent>
          {NAV_GROUPS.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((n) => (
                    <SidebarMenuItem key={n.id}>
                      <SidebarMenuButton isActive={view === n.id} onClick={() => go(n.id)}>
                        <n.icon />
                        <span>{n.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-2" />}>
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span className="w-full truncate text-sm font-medium">{user?.name || user?.email}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{user?.email}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuItem onClick={() => go("models")}>
                <Cpu /> Models
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>{project?.name ?? "No project"}</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{label}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">{project && action}</div>
        </header>
        <div className="flex-1 space-y-6 p-6">{content}</div>
      </SidebarInset>
      <Toaster theme="light" richColors />
    </SidebarProvider>
  )
}
