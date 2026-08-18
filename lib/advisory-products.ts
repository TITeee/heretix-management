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

export const SPLUNK_PRODUCTS = [
  "Splunk Enterprise",
  "Splunk Cloud Platform",
  "Splunk Secure Gateway",
  "Splunk Universal Forwarder",
  "Splunk AI Toolkit",
  "Splunk Enterprise Security",
  "Splunk SOAR",
  "Splunk App for Lookup File Editing",
]

export const CISCO_PRODUCTS = [
  "IOS XE",
  "IOS",
  "NX-OS",
  "ASA",
  "FTD (Firepower Threat Defense)",
  "Firepower Management Center",
  "ISE (Identity Services Engine)",
  "AnyConnect Secure Mobility Client",
  "Webex",
  "Unified Communications Manager",
]

export const SONICWALL_PRODUCTS = [
  "SonicOS",
  "SonicOS Gen7 Platform - TZ/NSa/NSsp/NSv",
  "SonicOS Gen6 Platform - TZ/NSa/SM/NSv",
  "Secure Mobile Access (SMA) 100 Series",
  "Secure Mobile Access (SMA) 1000 Series",
  "Global Management System (GMS)",
  "Network Security Manager",
  "Capture Client",
  "Email Security Appliances",
  "Cloud App Security",
]

// Matched against AdvisoryAffectedProduct.product by exact string (searchAdvisory()
// in heretix-api has no aliasing), so these have to track Broadcom's current advisory
// page wording, not just what the product is commonly called. Confirmed against live
// data: Broadcom's page now writes out the full "VMware ..." form for these four,
// where it used to use the bare product name.
export const BROADCOM_PRODUCTS = [
  "VMware vSphere ESXi",
  "VMware vCenter Server",
  "VMware Cloud Foundation",
  "VMware NSX",
  "Workstation",
  "VMware Fusion",
  "VMware Tools",
  "VMware Aria Operations",
  "Horizon Client for Windows",
  "VMware Cloud Director",
]

export const APACHE_PRODUCTS = ["httpd"]
export const NGINX_PRODUCTS = ["nginx"]
export const TOMCAT_PRODUCTS = ["tomcat"]
export const ZABBIX_PRODUCTS = ["zabbix"]

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

export type AdvisoryVendor =
  | "fortinet"
  | "paloalto"
  | "sophos"
  | "oracle"
  | "splunk"
  | "cisco"
  | "sonicwall"
  | "broadcom"
  | "apache"
  | "nginx"
  | "tomcat"
  | "zabbix"

// Red Hat / Oracle Linux are intentionally excluded: they're OS-distro ecosystems
// (selected via the General tab's ecosystem dropdown, e.g. "Red Hat:9"), matched
// by RPM version comparison against the distro-specific advisory feed — not by
// free-text product name like the vendors below. Routing them through this
// product-search UI would bypass that RPM-aware matching.
export const ADVISORY_VENDORS: { value: AdvisoryVendor; label: string }[] = [
  { value: "fortinet", label: "Fortinet" },
  { value: "paloalto", label: "Palo Alto Networks" },
  { value: "cisco", label: "Cisco" },
  { value: "sophos", label: "Sophos" },
  { value: "sonicwall", label: "SonicWall" },
  { value: "broadcom", label: "Broadcom/VMware" },
  { value: "oracle", label: "Oracle" },
  { value: "splunk", label: "Splunk" },
  { value: "apache", label: "Apache HTTP Server" },
  { value: "nginx", label: "Nginx" },
  { value: "tomcat", label: "Apache Tomcat" },
  { value: "zabbix", label: "Zabbix" },
]

export function getProductsByVendor(vendor: AdvisoryVendor): string[] {
  if (vendor === "paloalto") return PALOALTO_PRODUCTS
  if (vendor === "sophos") return SOPHOS_PRODUCTS
  if (vendor === "oracle") return ORACLE_CPU_PRODUCTS
  if (vendor === "splunk") return SPLUNK_PRODUCTS
  if (vendor === "cisco") return CISCO_PRODUCTS
  if (vendor === "sonicwall") return SONICWALL_PRODUCTS
  if (vendor === "broadcom") return BROADCOM_PRODUCTS
  if (vendor === "apache") return APACHE_PRODUCTS
  if (vendor === "nginx") return NGINX_PRODUCTS
  if (vendor === "tomcat") return TOMCAT_PRODUCTS
  if (vendor === "zabbix") return ZABBIX_PRODUCTS
  return FORTINET_PRODUCTS
}
