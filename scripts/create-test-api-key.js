const crypto = require("crypto")
const { PrismaPg } = require("@prisma/adapter-pg")
const { PrismaClient } = require("@prisma/client")
const { Pool } = require("pg")
require("dotenv").config()

;(async () => {
  const email = process.argv[2] || "gowtham@privosa.com"
  const name = process.argv[3] || "Claude test"

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.log("USER_NOT_FOUND:" + email)
    process.exit(1)
  }

  const raw = crypto.randomBytes(32).toString("base64url")
  const plaintext = "igp_" + raw
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex")
  const prefix = plaintext.slice(0, 12)

  await prisma.apiKey.create({
    data: { userId: user.id, name, keyHash: hash, keyPrefix: prefix },
  })

  console.log("KEY=" + plaintext)
  await prisma.$disconnect()
  await pool.end()
})()
