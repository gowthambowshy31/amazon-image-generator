interface RetryOptions {
  maxRetries: number
  backoffMs: number
  retryOn?: (error: Error) => boolean
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, backoffMs, retryOn } = options
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === maxRetries) break
      if (retryOn && !retryOn(lastError)) break
      const delay = backoffMs * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError!
}

export function isRetryableError(error: Error): boolean {
  const msg = error.message
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET")
  )
}
