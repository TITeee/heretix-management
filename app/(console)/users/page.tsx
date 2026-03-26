import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { UsersClient } from "./users-client"

export default async function UsersPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return <UsersClient currentUserId={session.user.id} />
}
