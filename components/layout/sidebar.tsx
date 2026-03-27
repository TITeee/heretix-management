"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import {
  LayoutDashboard,
  Server,
  Bell,
  Search,
  Settings,
  Tag,
  Users,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navItems = [
  { href: "/",       label: "Dashboard",           icon: LayoutDashboard },
  { href: "/assets", label: "Assets",               icon: Server },
  { href: "/tags",   label: "Tags",                 icon: Tag },
  { href: "/alerts", label: "Alerts",               icon: Bell },
  { href: "/search", label: "Vulnerability Search", icon: Search },
]

export function AppSidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isAdmin = userRole === "admin"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-14 items-center px-2 overflow-hidden">
          <span className="group-data-[collapsible=icon]:hidden text-2xl font-bold tracking-tight">heretix</span>
          <span className="hidden group-data-[collapsible=icon]:block text-2xl font-bold">H</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          {navItems.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} />}
                isActive={pathname === href || (href !== "/" && pathname.startsWith(href))}
                tooltip={mounted ? label : undefined}
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/users" />}
                isActive={pathname.startsWith("/users")}
                tooltip={mounted ? "Users" : undefined}
              >
                <Users />
                <span>Users</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={pathname.startsWith("/settings")}
              tooltip={mounted ? "Settings" : undefined}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
