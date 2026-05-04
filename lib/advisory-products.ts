export const FORTINET_PRODUCTS = [
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

export const PALOALTO_PRODUCTS = [
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

export const SOPHOS_PRODUCTS = [
  "Sophos Firewall",
  "Sophos UTM",
  "Sophos Central",
  "Sophos Endpoint",
  "Sophos Intercept X",
  "Sophos Mobile",
  "Sophos IPSEC Client",
  "Sophos Web Gateway",
  "Sophos Email Gateway",
]

export const ORACLE_CPU_PRODUCTS = [
  "Database",
  "Java SE",
  "MySQL Server",
  "WebLogic Server",
  "Fusion Middleware",
  "GoldenGate",
  "HTTP Server",
  "VM VirtualBox",
  "Solaris",
  "E-Business Suite",
  "PeopleSoft",
  "Siebel CRM",
  "Communications",
  "Financial Services",
]

export type AdvisoryVendor = "fortinet" | "paloalto" | "sophos" | "oracle"

export const ADVISORY_VENDORS: { value: AdvisoryVendor; label: string }[] = [
  { value: "fortinet", label: "Fortinet" },
  { value: "paloalto", label: "Palo Alto Networks" },
  { value: "sophos", label: "Sophos" },
  { value: "oracle", label: "Oracle" },
]

export function getProductsByVendor(vendor: AdvisoryVendor): string[] {
  if (vendor === "paloalto") return PALOALTO_PRODUCTS
  if (vendor === "sophos") return SOPHOS_PRODUCTS
  if (vendor === "oracle") return ORACLE_CPU_PRODUCTS
  return FORTINET_PRODUCTS
}
