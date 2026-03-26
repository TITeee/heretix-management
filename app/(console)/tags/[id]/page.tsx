import { TagDetailClient } from "./tag-detail-client"

export default async function TagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TagDetailClient id={id} />
}
