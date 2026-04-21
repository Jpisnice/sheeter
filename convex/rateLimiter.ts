import {
  HOUR,
  MINUTE,
  RateLimiter,
} from '@convex-dev/rate-limiter'
import { components } from './_generated/api'

// Named limit buckets shared across HTTP actions and mutations.
//
// `token bucket` = allow small bursts up to `capacity`, then refill at `rate`
//                  per `period`. Good for human-driven endpoints (/log).
// `fixed window` = hard cap of `rate` events per `period`. Good for
//                  protecting against runaway automation (token creation).
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Pre-auth DDoS guard on POST /log. One shared bucket across the whole
  // deployment — generous enough that legit traffic from many users
  // never hits it, tight enough that a scanner can't hammer us.
  logGlobal: {
    kind: 'fixed window',
    rate: 600,
    period: MINUTE,
  },
  // Per-token /log bucket. A single Shortcut normally fires once per
  // workday; 30/min with a burst of 10 is plenty for manual retries
  // without letting a leaked token flood the entries table.
  logPerToken: {
    kind: 'token bucket',
    rate: 30,
    period: MINUTE,
    capacity: 10,
  },
  // Per-user guard on shortcutTokens.create. Combined with the 10-token
  // cap in the mutation, this stops bots from churning tokens to defeat
  // the cap by creating + revoking rapidly.
  createToken: {
    kind: 'fixed window',
    rate: 5,
    period: HOUR,
  },
})
