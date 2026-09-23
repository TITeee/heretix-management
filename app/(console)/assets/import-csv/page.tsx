"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Download, FileSpreadsheet } from "lucide-react"
import { CSV_COLUMNS, type RawCsvRow } from "@/lib/csv-import"

type RowResult = { line: number; hostname: string; status: "create" | "update" | "skip" | "error"; message?: string }

const STATUS_LABEL: Record<RowResult["status"], string> = {
  create: "Create", update: "Update", skip: "Skip", error: "Error",
}
const STATUS_VARIANT: Record<RowResult["status"], "default" | "secondary" | "destructive" | "outline"> = {
  create: "default", update: "secondary", skip: "outline", error: "destructive",
}

export default function ImportCsvPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")
  const [rows, setRows] = useState<RawCsvRow[]>([])
  const [fileName, setFileName] = useState("")
  const [results, setResults] = useState<RowResult[]>([])
  const [updateExisting, setUpdateExisting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function runPreview(parsedRows: RawCsvRow[], nextUpdateExisting: boolean) {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/assets/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows, commit: false, updateExisting: nextUpdateExisting }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to preview import.")
        return
      }
      setResults(data.results)
      setStep("preview")
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(file: File | null) {
    if (!file) return
    setFileName(file.name)
    setError("")
    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (parsed) => {
        if (parsed.errors.length > 0) {
          setError(`Could not parse CSV: ${parsed.errors[0].message}`)
          return
        }
        if (parsed.data.length === 0) {
          setError("The file has no data rows.")
          return
        }
        setRows(parsed.data)
        runPreview(parsed.data, updateExisting)
      },
      error: () => setError("Could not read the file."),
    })
  }

  function handleToggleUpdateExisting(next: boolean) {
    setUpdateExisting(next)
    if (rows.length > 0) runPreview(rows, next)
  }

  async function handleImport() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/assets/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, commit: true, updateExisting }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to import.")
        return
      }
      setResults(data.results)
      setStep("done")
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep("upload")
    setRows([])
    setFileName("")
    setResults([])
    setError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const errorCount = results.filter((r) => r.status === "error").length
  const importableCount = results.length - errorCount
  const summary = {
    create: results.filter((r) => r.status === "create").length,
    update: results.filter((r) => r.status === "update").length,
    skip: results.filter((r) => r.status === "skip").length,
    error: errorCount,
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/assets">Assets</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Import CSV</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-bold">Import Assets from CSV</h1>
      <p className="text-sm text-muted-foreground">
        Bulk-register network appliances and firewalls (the same Advisory-vendor products available in{" "}
        <strong>Add Package</strong>) instead of registering them one at a time.
      </p>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload CSV</CardTitle>
            <CardDescription>
              Columns: <code>{CSV_COLUMNS.join(", ")}</code>. One row per asset+package;
              repeat a hostname to add more than one package to the same asset.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a
              href="/asset-import-template.csv"
              download
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Download CSV template
            </a>
            <div
              className="flex items-center gap-3 rounded-md border border-dashed px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">
                {fileName || "Click to select a .csv file…"}
              </span>
              <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0" disabled={loading}>
                Browse
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {loading && <p className="text-sm text-muted-foreground">Validating…</p>}
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — {fileName}</CardTitle>
            <CardDescription>
              Nothing has been imported yet. Review the rows below, then confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => handleToggleUpdateExisting(e.target.checked)}
                disabled={loading}
              />
              Update existing assets (add this package to an asset that already has this hostname,
              instead of skipping it)
            </label>

            <ResultsTable results={results} />

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={handleImport} disabled={loading || importableCount === 0}>
                {loading ? "Importing…" : `Import ${importableCount} row${importableCount === 1 ? "" : "s"}`}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} disabled={loading}>
                Start Over
              </Button>
            </div>
            {errorCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {errorCount} row{errorCount === 1 ? "" : "s"} will be skipped due to validation errors — fix the file and re-upload to include them.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Complete</CardTitle>
            <CardDescription>
              {summary.create} created, {summary.update} updated, {summary.skip} skipped, {summary.error} failed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResultsTable results={results} />
            <div className="flex gap-2">
              <Button onClick={() => router.push("/assets")}>Go to Assets</Button>
              <Button type="button" variant="outline" onClick={handleReset}>Import Another File</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ResultsTable({ results }: { results: RowResult[] }) {
  return (
    <div className="rounded-md border max-h-96 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Line</TableHead>
            <TableHead>Hostname</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => (
            <TableRow key={r.line}>
              <TableCell className="text-muted-foreground">{r.line}</TableCell>
              <TableCell className="font-mono text-xs">{r.hostname || "—"}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.message ?? ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
