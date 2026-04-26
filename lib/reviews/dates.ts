import { addDays, isAfter, isBefore } from "date-fns"

export function isInEligibilityWindow(
  earliestDeliveryDate: Date | null,
  latestDeliveryDate: Date | null,
): boolean {
  if (!earliestDeliveryDate || !latestDeliveryDate) return false
  const now = new Date()
  const windowStart = addDays(earliestDeliveryDate, 5)
  const windowEnd = addDays(latestDeliveryDate, 30)
  return isAfter(now, windowStart) && isBefore(now, windowEnd)
}
