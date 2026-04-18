import "dotenv/config"
import { config as loadDotenv } from "dotenv"
import { existsSync } from "fs"
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3"

const SHARED_ENV = process.env.SHARED_ENV_PATH || "C:/work/Project-kit/.env.shared"
if (existsSync(SHARED_ENV)) loadDotenv({ path: SHARED_ENV, override: false })
loadDotenv({ override: true })

async function main() {
  const batch = process.argv[2] || "2026-04-18-jewelry"
  const bucket = process.env.AWS_S3_BUCKET_NAME!
  const region = process.env.AWS_REGION || "eu-north-1"
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  const prefix = `client-batches/${batch}/`
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
    for (const obj of res.Contents || []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  const variantMap = new Map<string, Set<number>>()
  for (const key of keys) {
    const rel = key.slice(prefix.length)
    if (rel.startsWith("originals/")) continue
    const m = rel.match(/^(.+)_v(\d+)\.(\w+)$/)
    if (!m) continue
    const stem = m[1]
    const n = parseInt(m[2], 10)
    if (!variantMap.has(stem)) variantMap.set(stem, new Set())
    variantMap.get(stem)!.add(n)
  }

  const allStems = Array.from(variantMap.keys()).sort()
  const with3 = allStems.filter((s) => variantMap.get(s)!.size === 3)
  const with2 = allStems.filter((s) => variantMap.get(s)!.size === 2)
  const with1 = allStems.filter((s) => variantMap.get(s)!.size === 1)

  console.log(`Batch ${batch}: ${keys.length} total S3 objects under prefix`)
  console.log(`Images with any variants: ${allStems.length}`)
  console.log(`  full 3 variants: ${with3.length}`)
  console.log(`  2 variants:      ${with2.length}`)
  console.log(`  1 variant:       ${with1.length}`)
  console.log("")
  if (with2.length || with1.length) {
    console.log("Images missing variants:")
    for (const s of [...with2, ...with1].sort()) {
      const have = Array.from(variantMap.get(s)!).sort().join(",")
      console.log(`  ${s}: have v[${have}]`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
