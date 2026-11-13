import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import Link from "next/link"
import { areAutoScansPaused } from "@/lib/scan-pause"

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })
  const scansPaused = await areAutoScansPaused()

  return (
    <SidebarProvider>
      <AppSidebar userRole={dbUser?.role} />
      <SidebarInset>
        <Topbar
          userName={session.user?.name}
          userEmail={session.user?.email}
        />
        {scansPaused && (
          <div className="border-b border-amber-400 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            Automatic scans are paused: the scheduled scan and scans after an upload do not run. Scans started by hand still run.{" "}
            {dbUser?.role === "admin"
              ? <Link href="/settings" className="underline">Resume in Settings</Link>
              : "An admin can resume them in Settings."}
          </div>
        )}
        <main data-slot="console-main" className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
