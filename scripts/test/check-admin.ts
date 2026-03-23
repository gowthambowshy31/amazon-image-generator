import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function checkAdmin() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@imageGen.com' }
    })

    if (user) {
      console.log('✅ Admin user found:', user.email, user.name)
    } else {
      console.log('❌ Admin user not found - need to run: npm run db:seed')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Database connection error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

checkAdmin()
