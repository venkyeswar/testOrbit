import type { ReactNode } from "react"
import { Inbox, type LucideIcon } from "lucide-react"
import type { Project } from "@/types"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { flexRender } from "@tanstack/react-table"
import {
  getCoreRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "cn"

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-100 text-green-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
}

export function MethodBadge({ method }: { method: string }) {
  return (
    <Badge variant="secondary" className={cn("font-mono", METHOD_COLORS[method.toUpperCase()])}>
      {method.toUpperCase()}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "passed"
      ? "bg-green-100 text-green-700"
      : status === "failed"
        ? "bg-red-100 text-red-700"
        : status === "error"
          ? "bg-amber-100 text-amber-700"
          : ""
  return (
    <Badge variant="secondary" className={cls}>
      {status}
    </Badge>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>
}

export function EmptyState({
  text,
  action,
  onAction,
  icon: Icon = Inbox,
}: {
  text: string
  action?: string
  onAction?: () => void
  icon?: LucideIcon
}) {
  return (
    <Empty className="rounded-xl border border-dashed bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{text}</EmptyTitle>
      </EmptyHeader>
      {action && (
        <EmptyContent>
          <Button onClick={onAction}>{action}</Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
  tone,
}: {
  label: string
  value?: ReactNode
  icon: LucideIcon
  description?: string
  tone?: "green" | "red" | "amber"
}) {
  const toneCls =
    tone === "red" ? "bg-red-100 text-red-700" : tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="text-2xl font-semibold">{value === undefined ? <Skeleton className="h-8 w-16" /> : value}</div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={cn("rounded-lg p-2", toneCls)}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export function DiagnosisBadge({ category }: { category: string }) {
  const cls =
    category === "api_defect"
      ? "bg-red-100 text-red-700"
      : category === "invalid_test"
        ? "bg-amber-100 text-amber-700"
        : ""
  return (
    <Badge variant="secondary" className={cls}>
      {category}
    </Badge>
  )
}

export function authSummary(a: Project["auth"]) {
  if (a.type === "none") return "none"
  if (!a.detected || !a.signup || !a.signin) return "not found"
  return `signup→signin`
}

export function LoadingRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  )
}

export function fmtDuration(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function fmtDate(s: string) {
  return new Date(s).toLocaleString()
}

export const pretty = (v: unknown) => JSON.stringify(v ?? null, null, 2)

export function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">{pretty(value)}</pre>
  )
}

export function DataTable<T extends object>({
  columns,
  data,
  onRowClick,
  rowClassName,
}: {
  columns: LegacyColumnDef<T, any>[]
  data: T[]
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
}) {
  const table = useLegacyTable<T>({ columns, data, getCoreRowModel: getCoreRowModel() })
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id}>
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
            onClick={() => onRowClick?.(row.original)}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
