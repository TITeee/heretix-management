"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const ECOSYSTEMS = [
  "Ubuntu:20.04:LTS",
  "Ubuntu:22.04:LTS",
  "Ubuntu:24.04:LTS",
  "Debian:11",
  "Debian:12",
  "AlmaLinux:8",
  "AlmaLinux:9",
  "oracle-linux",
  "Alpine:v3.18",
  "Alpine:v3.19",
  "Alpine:v3.20",
  "Alpine:v3.21",
  "npm",
  "PyPI",
  "Go",
  "Maven",
  "NuGet",
  "Other",
]

const FORTINET_PRODUCTS = [
  "FortiAnalyzer",
  "FortiAnalyzer-BigData",
  "FortiAnalyzer Cloud",
  "FortiAuthenticator",
  "FortiClientEMS",
  "FortiClientLinux",
  "FortiClientWindows",
  "FortiDeceptor",
  "FortiFone",
  "FortiMail",
  "FortiManager",
  "FortiManager Cloud",
  "FortiOS",
  "FortiPAM",
  "FortiPortal",
  "FortiProxy",
  "FortiRecorder",
  "FortiSandbox",
  "FortiSandbox Cloud",
  "FortiSASE",
  "FortiSIEM",
  "FortiSOAR Agent Communication Bridge",
  "FortiSOAR on-premise",
  "FortiSOAR PaaS",
  "FortiSRA",
  "FortiSwitchAXFixed",
  "FortiSwitchManager",
  "FortiVoice",
  "FortiWeb",
]

const PALOALTO_PRODUCTS = [
  "PAN-OS",
  "Cortex XDR",
  "Cortex XSOAR",
  "CloudNGFW",
  "Prisma Access",
  "Prisma Cloud",
  "GlobalProtect App",
  "Panorama",
  "WildFire Appliance",
]

export function AddPackageDialog({ assetId }: { assetId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // General tab state
  const [genName, setGenName] = useState("")
  const [genVersion, setGenVersion] = useState("")
  const [genEcosystemSelect, setGenEcosystemSelect] = useState("")

  // Advisory tab state
  const [vendor, setVendor] = useState<"fortinet" | "paloalto">("fortinet")
  const [product, setProduct] = useState(FORTINET_PRODUCTS[0])
  const [advVersion, setAdvVersion] = useState("")
  const [vulnCount, setVulnCount] = useState<number | "error" | null>(null)
  const [searching, setSearching] = useState(false)

  // CPE tab state
  const [cpeProduct, setCpeProduct] = useState("")
  const [cpeVersion, setCpeVersion] = useState("")
  const [cpeString, setCpeString] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const genEcosystem = genEcosystemSelect === "Other" ? "" : genEcosystemSelect

  function handleOpen() {
    setGenName(""); setGenVersion(""); setGenEcosystemSelect("")
    setVendor("fortinet"); setProduct(FORTINET_PRODUCTS[0]); setAdvVersion("")
    setVulnCount(null)
    setCpeProduct(""); setCpeVersion(""); setCpeString("")
    setError("")
    setOpen(true)
  }

  async function handleVulnSearch() {
    if (!product || !advVersion) return
    setSearching(true)
    setVulnCount(null)
    try {
      const q = new URLSearchParams({ package: product, version: advVersion, ecosystem: "advisory" })
      const res = await fetch(`/api/search?${q}`)
      if (!res.ok) { setVulnCount("error"); return }
      const data = await res.json()
      const results: unknown[] = data.results ?? []
      const seen = new Set<string>()
      setVulnCount(results.filter((v: unknown) => {
        const id = (v as { id: string }).id
        return !seen.has(id) && seen.add(id)
      }).length)
    } catch {
      setVulnCount("error")
    } finally {
      setSearching(false)
    }
  }

  async function handleAddGeneral() {
    if (!genName || !genVersion || !genEcosystemSelect) return
    setLoading(true); setError("")
    try {
      const res = await fetch(`/api/assets/${assetId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: genName, version: genVersion, ecosystem: genEcosystem, source: "manual" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to add package.")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  async function handleAddAdvisory() {
    if (!product || !advVersion) return
    setLoading(true); setError("")
    try {
      const res = await fetch(`/api/assets/${assetId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: product, version: advVersion, ecosystem: "advisory", source: "manual" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to add package.")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCpe() {
    if (!cpeProduct || !cpeVersion || !cpeString) return
    setLoading(true); setError("")
    try {
      const res = await fetch(`/api/assets/${assetId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cpeProduct, version: cpeVersion, cpe: cpeString, ecosystem: "", source: "manual" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Failed to add package.")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={handleOpen}>Add Package</Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Package</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
            <TabsTrigger value="advisory" className="flex-1">Advisory</TabsTrigger>
            <TabsTrigger value="cpe" className="flex-1">CPE</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Package Name <span className="text-destructive">*</span></label>
              <Input placeholder="e.g. nginx" value={genName} onChange={(e) => setGenName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Version <span className="text-destructive">*</span></label>
              <Input placeholder="e.g. 1.24.0" value={genVersion} onChange={(e) => setGenVersion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ecosystem <span className="text-destructive">*</span></label>
              <Select value={genEcosystemSelect} onValueChange={(v) => setGenEcosystemSelect(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select ecosystem" /></SelectTrigger>
                <SelectContent>
                  {ECOSYSTEMS.map((eco) => (
                    <SelectItem key={eco} value={eco}>{eco}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={handleAddGeneral} disabled={loading || !genName || !genVersion || !genEcosystemSelect}>
                {loading ? "Adding..." : "Add Package"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="advisory" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vendor <span className="text-destructive">*</span></label>
              <Select value={vendor} onValueChange={(v) => {
                const next = v as "fortinet" | "paloalto"
                setVendor(next)
                setProduct(next === "paloalto" ? PALOALTO_PRODUCTS[0] : FORTINET_PRODUCTS[0])
                setVulnCount(null)
              }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fortinet">Fortinet</SelectItem>
                  <SelectItem value="paloalto">Palo Alto Networks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Product <span className="text-destructive">*</span></label>
              <Select value={product} onValueChange={(v) => { setProduct(v ?? product); setVulnCount(null) }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(vendor === "paloalto" ? PALOALTO_PRODUCTS : FORTINET_PRODUCTS).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Version <span className="text-destructive">*</span></label>
              <Input placeholder="e.g. 7.4.3" value={advVersion} onChange={(e) => { setAdvVersion(e.target.value); setVulnCount(null) }} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
              <div className="flex items-center gap-2">
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button onClick={handleAddAdvisory} disabled={loading || !product || !advVersion}>
                  {loading ? "Adding..." : "Add Package"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleVulnSearch}
                  disabled={searching || !product || !advVersion}
                  className="ml-auto"
                >
                  {searching ? "Searching..." : "Search Vulnerabilities"}
                </Button>
              </div>
              {vulnCount !== null && (
                <p className={`text-sm font-medium ${vulnCount === "error" ? "text-destructive" : "text-green-600"}`}>
                  {vulnCount === "error"
                    ? "Could not connect to API. Check Settings."
                    : vulnCount > 0
                      ? `${vulnCount} vulnerabilit${vulnCount === 1 ? "y" : "ies"} found`
                      : "No vulnerabilities found"}
                </p>
              )}
            </DialogFooter>
          </TabsContent>
          <TabsContent value="cpe" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Product <span className="text-destructive">*</span></label>
              <Input placeholder="e.g. FortiOS" value={cpeProduct} onChange={(e) => setCpeProduct(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Version <span className="text-destructive">*</span></label>
              <Input placeholder="e.g. 7.4.3" value={cpeVersion} onChange={(e) => setCpeVersion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CPE <span className="text-destructive">*</span></label>
              <Input
                placeholder="cpe:2.3:a:fortinet:fortios:7.4.3:*:*:*:*:*:*:*"
                value={cpeString}
                onChange={(e) => setCpeString(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={handleAddCpe} disabled={loading || !cpeProduct || !cpeVersion || !cpeString}>
                {loading ? "Adding..." : "Add Package"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
