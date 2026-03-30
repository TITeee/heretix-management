"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function DashboardTabs({
  overviewContent,
  tagsContent,
}: {
  overviewContent: React.ReactNode
  tagsContent: React.ReactNode
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="critical-packages">Tags</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-6 mt-4">
        {overviewContent}
      </TabsContent>
      <TabsContent value="critical-packages" className="mt-4 space-y-4">
        {tagsContent}
      </TabsContent>
    </Tabs>
  )
}
