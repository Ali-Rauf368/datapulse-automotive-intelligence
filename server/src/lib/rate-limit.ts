import type { NextFunction, Request, Response } from 'express'

type Options = {
  windowMs: number
  max: number
  message: string
  // Builds the bucket key for a request, e.g. client IP plus email.
  key: (req: Request) => string
  // When set, only responses with these status codes count as attempts
  // (e.g. failed sign-ins); otherwise every request counts.
  countStatuses?: number[]
}

// Small fixed-window limiter kept in memory. It suits a single API instance;
// several instances would need a shared store such as Redis.
export function rateLimit(options: Options) {
  const buckets = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const key = options.key(req)
    let bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: options.message })
      return
    }

    const current = bucket
    if (options.countStatuses) {
      res.once('finish', () => {
        if (options.countStatuses?.includes(res.statusCode)) current.count++
      })
    } else {
      current.count++
    }

    // Drop expired buckets now and then so memory stays bounded.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    }

    next()
  }
}

export const clientIp = (req: Request) => req.ip ?? 'unknown'
