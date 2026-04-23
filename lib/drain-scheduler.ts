/**
 * In-process daily drain scheduler. Started once per process from
 * instrumentation.ts. Checks every 5 minutes whether the current PT time is
 * inside the drain window (00:30-01:00) and hasn't fired yet today.
 *
 * This is a backup to /api/cron/drain for cases where no external scheduler is
 * configured. Safe to run alongside manual POSTs — drainQueue claims rows
 * atomically.
 */

let started = false
let lastRunDatePT: string | null = null

function ptNow() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => Number(fmt.find((p) => p.type === t)?.value)
  const y = get("year"), m = get("month"), d = get("day")
  const h = get("hour"), mi = get("minute")
  return {
    date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    hour: h,
    minute: mi,
  }
}

async function tick() {
  try {
    if (process.env.DISABLE_DRAIN_SCHEDULER === "1") return
    const { date, hour, minute } = ptNow()
    // Fire once per PT day, between 00:30 and 01:00.
    if (lastRunDatePT === date) return
    if (hour !== 0 || minute < 30) return

    lastRunDatePT = date
    // Lazy import so instrumentation.ts doesn't drag server-only deps into
    // the edge runtime (drainQueue uses prisma + aws-sdk).
    const { drainQueue } = await import("./drain-queue")
    console.log(`[drain-scheduler] firing daily drain at PT ${date} ${hour}:${minute}`)
    const result = await drainQueue()
    console.log(`[drain-scheduler] result:`, result)
  } catch (err) {
    console.error("[drain-scheduler] tick error:", err)
  }
}

export function startDrainScheduler() {
  if (started) return
  started = true
  const intervalMs = 5 * 60 * 1000 // 5 min
  setInterval(tick, intervalMs)
  // Run one tick shortly after boot too, in case we restarted during the
  // drain window and missed it.
  setTimeout(tick, 30_000)
  console.log("[drain-scheduler] started (daily drain at 00:30 America/Los_Angeles)")
}
