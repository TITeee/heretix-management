import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@example.com"
  const password = process.env.SEED_PASSWORD ?? "changeme"
  const name = process.env.SEED_NAME ?? "Administrator"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`User already exists: ${email}`)
  } else {
    const hash = await bcrypt.hash(password, 12)
    await prisma.user.create({ data: { email, password: hash, name, role: "admin" } })
    console.log(`Created user: ${email}`)
  }

  const defaultTags = [
    { name: "Production",        type: "asset",   color: "#16a34a", description: "Production environment assets. (Default tag - cannot be edited or deleted.)" },
    { name: "Development",       type: "asset",   color: "#3b82f6", description: "Development environment assets. (Default tag - cannot be edited or deleted.)" },
    { name: "Staging",           type: "asset",   color: "#f59e0b", description: "Staging environment assets. (Default tag - cannot be edited or deleted.)" },
    { name: "Critical Packages", type: "package", color: "#ef4444", description: "Packages that require priority attention. (Default tag — cannot be edited or deleted.)" },
  ]
  for (const tag of defaultTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: { isDefault: true, color: tag.color, description: tag.description },
      create: { name: tag.name, type: tag.type, color: tag.color, description: tag.description, isDefault: true },
    })
    console.log(`Upserted default tag: ${tag.name}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
