export async function register() {
  // Only start on the Node server runtime (not edge).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDrainScheduler } = await import("./lib/drain-scheduler")
    startDrainScheduler()
  }
}
