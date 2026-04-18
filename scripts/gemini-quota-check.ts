/**
 * Probe the Gemini API key to infer its tier and current quota state.
 * Makes one cheap text call, one cheap image-preview call, and parses 429 responses.
 */

import "dotenv/config"
import { config as loadDotenv } from "dotenv"
import { existsSync } from "fs"

const SHARED_ENV = process.env.SHARED_ENV_PATH || "C:/work/Project-kit/.env.shared"
if (existsSync(SHARED_ENV)) loadDotenv({ path: SHARED_ENV, override: false })
loadDotenv({ override: true })

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error("GEMINI_API_KEY not set")
  process.exit(1)
}

async function listModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  const data = await res.json()
  console.log("=== MODELS VISIBLE TO THIS KEY ===")
  if (Array.isArray(data.models)) {
    for (const m of data.models) {
      console.log(`  ${m.name} (input: ${m.inputTokenLimit ?? "?"}, output: ${m.outputTokenLimit ?? "?"})`)
    }
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
  console.log("")
}

async function probe(model: string, body: any, label: string) {
  console.log(`=== PROBE: ${label} (${model}) ===`)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  )
  console.log(`HTTP ${res.status}`)
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    if (k.toLowerCase().includes("quota") || k.toLowerCase().includes("limit") || k.toLowerCase().startsWith("x-")) {
      headers[k] = v
    }
  })
  if (Object.keys(headers).length) console.log("headers:", headers)

  const text = await res.text()
  if (res.status === 429 || res.status >= 400) {
    try {
      const j = JSON.parse(text)
      const err = j.error
      console.log(`code: ${err?.code}  status: ${err?.status}`)
      console.log(`message: ${err?.message?.slice(0, 400)}`)
      if (err?.details) {
        for (const d of err.details) {
          if (d["@type"]?.includes("QuotaFailure") && d.violations) {
            for (const v of d.violations) {
              console.log(`  quota violation: metric=${v.quotaMetric} limit=${v.quotaValue} id=${v.quotaId}`)
            }
          }
          if (d["@type"]?.includes("RetryInfo")) {
            console.log(`  retry after: ${d.retryDelay}`)
          }
        }
      }
    } catch {
      console.log(text.slice(0, 400))
    }
  } else {
    console.log("SUCCESS — call went through, so no active block on this model")
  }
  console.log("")
}

async function main() {
  console.log(`API key prefix: ${apiKey!.slice(0, 6)}...${apiKey!.slice(-4)}`)
  console.log("")

  await listModels()

  await probe(
    "gemini-2.0-flash",
    { contents: [{ parts: [{ text: "say hi in one word" }] }] },
    "cheap text call (gemini-2.0-flash)"
  )

  await probe(
    "gemini-3-pro-image-preview",
    {
      contents: [{ parts: [{ text: "tiny red circle on white background" }] }],
      generationConfig: { responseModalities: ["image", "text"] },
    },
    "image call (gemini-3-pro-image-preview)"
  )

  console.log("=== HOW TO INTERPRET ===")
  console.log("- Free tier: image preview model shows 'limit: 20' per-day quota in 429 errors.")
  console.log("- Paid tier (Tier 1+): limit is much higher (typically 500-5000), rare 429s.")
  console.log("- If text call succeeds but image call 429s with limit: 20, you are on free tier for the image model.")
  console.log("- The founder can confirm at https://aistudio.google.com/apikey (Settings -> billing).")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
