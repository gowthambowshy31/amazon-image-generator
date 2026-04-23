/**
 * Daily quota tracker for external AI APIs.
 *
 * Google doesn't expose a "how many requests do I have left" endpoint, so we
 * count locally. A counter row exists per (provider, model, PT-date). Gemini
 * preview-model quotas reset at midnight America/Los_Angeles.
 */

import { prisma } from "./prisma"

export const GEMINI_IMAGE_PROVIDER = "google"
export const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview"

// Paid Tier 1 daily cap for gemini-3-pro-image-preview. Override via env if we
// ever move tiers. Keep a small safety margin baked into the limit itself.
export const GEMINI_IMAGE_DAILY_LIMIT = Number(process.env.GEMINI_IMAGE_DAILY_LIMIT || 250)

export class QuotaExceededError extends Error {
  provider: string
  model: string
  resetsAt: Date
  constructor(provider: string, model: string, resetsAt: Date) {
    super(`Daily quota exhausted for ${provider}/${model}. Resets at ${resetsAt.toISOString()}.`)
    this.name = "QuotaExceededError"
    this.provider = provider
    this.model = model
    this.resetsAt = resetsAt
  }
}

/** Today's date in America/Los_Angeles as YYYY-MM-DD. */
export function getTodayPT(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return fmt.format(new Date()) // "YYYY-MM-DD"
}

/** Next PT midnight as a UTC Date. */
export function getNextPTMidnight(): Date {
  // Parse current PT wall clock, add 1 day, set to 00:00 PT, convert back to UTC.
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const y = get("year"), m = get("month"), d = get("day")
  const h = get("hour"), mi = get("minute"), s = get("second")

  // seconds since today's PT midnight
  const secondsIntoDay = h * 3600 + mi * 60 + s
  const secondsUntilMidnight = 86400 - secondsIntoDay
  return new Date(now.getTime() + secondsUntilMidnight * 1000)
}

export interface QuotaSnapshot {
  provider: string
  model: string
  date: string
  used: number
  limit: number
  remaining: number
  resetsAt: string
}

export async function getQuotaSnapshot(
  provider = GEMINI_IMAGE_PROVIDER,
  model = GEMINI_IMAGE_MODEL,
  limit = GEMINI_IMAGE_DAILY_LIMIT
): Promise<QuotaSnapshot> {
  const date = getTodayPT()
  const row = await prisma.quotaUsage.findUnique({
    where: { provider_model_date: { provider, model, date } },
  })
  const used = row?.used ?? 0
  return {
    provider, model, date, used, limit,
    remaining: Math.max(0, limit - used),
    resetsAt: getNextPTMidnight().toISOString(),
  }
}

/**
 * Reserve one request against today's quota. Throws QuotaExceededError if full.
 *
 * Uses an upsert + conditional increment so two concurrent callers can't both
 * slip through when only one slot remains. On contention the DB returns the
 * latest row; we re-check used <= limit after the write.
 */
export async function reserveOne(
  provider = GEMINI_IMAGE_PROVIDER,
  model = GEMINI_IMAGE_MODEL,
  limit = GEMINI_IMAGE_DAILY_LIMIT
): Promise<QuotaSnapshot> {
  const date = getTodayPT()
  const row = await prisma.quotaUsage.upsert({
    where: { provider_model_date: { provider, model, date } },
    create: { provider, model, date, used: 1, limit },
    update: { used: { increment: 1 }, limit },
  })
  if (row.used > row.limit) {
    // rollback the over-increment so subsequent callers see the true count
    await prisma.quotaUsage.update({
      where: { provider_model_date: { provider, model, date } },
      data: { used: { decrement: 1 } },
    })
    throw new QuotaExceededError(provider, model, getNextPTMidnight())
  }
  return {
    provider, model, date,
    used: row.used, limit: row.limit,
    remaining: Math.max(0, row.limit - row.used),
    resetsAt: getNextPTMidnight().toISOString(),
  }
}

/** Roll back a reservation when the API call didn't actually consume quota (e.g. our own 4xx). */
export async function releaseOne(
  provider = GEMINI_IMAGE_PROVIDER,
  model = GEMINI_IMAGE_MODEL
): Promise<void> {
  const date = getTodayPT()
  await prisma.quotaUsage.updateMany({
    where: { provider, model, date, used: { gt: 0 } },
    data: { used: { decrement: 1 } },
  })
}

/** Google told us we're out. Force the counter to the limit so UI reflects reality. */
export async function markExhausted(
  provider = GEMINI_IMAGE_PROVIDER,
  model = GEMINI_IMAGE_MODEL,
  limit = GEMINI_IMAGE_DAILY_LIMIT
): Promise<void> {
  const date = getTodayPT()
  await prisma.quotaUsage.upsert({
    where: { provider_model_date: { provider, model, date } },
    create: { provider, model, date, used: limit, limit },
    update: { used: limit, limit },
  })
}
