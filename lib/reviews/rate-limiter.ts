import PQueue from "p-queue"

const orderQueues = new Map<string, PQueue>()
const financesQueues = new Map<string, PQueue>()

export function getOrderQueue(organizationId: string): PQueue {
  if (!orderQueues.has(organizationId)) {
    orderQueues.set(
      organizationId,
      new PQueue({ concurrency: 1, interval: 1100, intervalCap: 1 }),
    )
  }
  return orderQueues.get(organizationId)!
}

export function getFinancesQueue(organizationId: string): PQueue {
  if (!financesQueues.has(organizationId)) {
    financesQueues.set(
      organizationId,
      new PQueue({ concurrency: 1, interval: 2100, intervalCap: 1 }),
    )
  }
  return financesQueues.get(organizationId)!
}
