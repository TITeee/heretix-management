import Link from "next/link"
import { FileChartColumn } from "lucide-react"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button-variants"

// One card per kind of report; each leads to the page that sets its conditions and makes it.
const REPORTS = [
  {
    href: "/reports/executive",
    title: "Executive summary",
    icon: FileChartColumn,
    description:
      "For management: what is left to fix, what changed in a period compared with the one before, and what needs a decision, by asset tag. Print it or save it as PDF, or download the numbers as CSV.",
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Reports</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(({ href, title, icon: Icon, description }) => (
          <Card key={href}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-5 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href={href} className={buttonVariants()}>Create report</Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
