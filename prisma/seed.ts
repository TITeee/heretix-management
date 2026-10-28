import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// The rule of lib/password.ts, which the container's runtime image does not
// ship (it has prisma/ but not lib/): 12 characters at least, 72 bytes at most.
function seedPasswordProblem(password: string): string | null {
  if ([...password].length < 12) return "SEED_PASSWORD must be at least 12 characters"
  if (new TextEncoder().encode(password).length > 72) return "SEED_PASSWORD must be at most 72 bytes"
  return null
}

async function main() {
  const email = process.env.SEED_EMAIL ?? "admin@example.com"
  const name = process.env.SEED_NAME ?? "Administrator"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`User already exists: ${email}`)
  } else {
    // No fixed default: a known first password ("changeme") is the first one tried.
    const given = process.env.SEED_PASSWORD
    const password = given ?? randomBytes(18).toString("base64url")
    const problem = given === undefined ? null : seedPasswordProblem(given)
    if (problem) throw new Error(problem)
    const hash = await bcrypt.hash(password, 12)
    await prisma.user.create({ data: { email, password: hash, name, role: "admin" } })
    console.log(`Created user: ${email}`)
    if (given === undefined) {
      console.log(`Generated password (shown only now; change it on the Users page): ${password}`)
    }
  }

  const defaultTags = [
    { name: "Internet Facing", type: "asset",   color: "#dc2626", description: "Assets directly exposed to the internet. (Default tag)" },
    { name: "Public Endpoint", type: "package", color: "#ea580c", description: "Packages directly accessible from the internet, e.g. Apache, Tomcat, Nginx. (Default tag)" },
  ]
  for (const tag of defaultTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: { isDefault: true, color: tag.color, description: tag.description },
      create: { name: tag.name, type: tag.type, color: tag.color, description: tag.description, isDefault: true },
    })
    console.log(`Upserted default tag: ${tag.name}`)
  }

  const defaultTagNames = defaultTags.map(t => t.name)
  const removed = await prisma.tag.updateMany({
    where: { isDefault: true, name: { notIn: defaultTagNames } },
    data: { isDefault: false },
  })
  if (removed.count > 0) console.log(`Removed isDefault from ${removed.count} old tag(s)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
