import { Cpu } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export function NoModelBanner({ onConfigure }: { onConfigure: () => void }) {
  return (
    <Alert>
      <Cpu />
      <AlertTitle>Configure a model to generate tests</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        TestOrbit needs an AI model of your own for test generation and failure diagnosis.
        <Button size="sm" onClick={onConfigure}>
          Go to Models
        </Button>
      </AlertDescription>
    </Alert>
  )
}
