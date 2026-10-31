import { useState, type FormEvent } from "react"
import { Orbit } from "lucide-react"
import { api, setToken } from "@/api"
import type { User } from "@/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function LoginView({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const s =
        mode === "login"
          ? await api.login({ email, password })
          : await api.signup({ email, password, name: name.trim() || undefined })
      setToken(s.access_token)
      onAuthed(s.user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-green-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Orbit className="size-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">TestOrbit</span>
          </div>
          <CardDescription>AI-powered API testing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as "login" | "signup")
              setError(null)
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
          </Tabs>
          <form className="space-y-3" onSubmit={submit}>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="lg-name">Name</Label>
                <Input id="lg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="lg-email">Email</Label>
              <Input id="lg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lg-pw">Password</Label>
              <Input
                id="lg-pw"
                type="password"
                required
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "signup" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>
              {busy && <Spinner />} {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
