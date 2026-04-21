import { ConvexError, v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import {
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { rateLimiter } from './rateLimiter'

const TOKEN_PREFIX = 'sk_'
const TOKEN_RANDOM_BYTES = 24
const MAX_TOKENS_PER_USER = 10
const MAX_LABEL_LEN = 40

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_RANDOM_BYTES)
  crypto.getRandomValues(bytes)
  return TOKEN_PREFIX + toHex(bytes)
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const rows = await ctx.db
      .query('shortcutTokens')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    rows.sort((a, b) => b._creationTime - a._creationTime)
    return rows.map((r) => ({
      _id: r._id,
      label: r.label,
      lastFour: r.lastFour,
      createdAt: r._creationTime,
      lastUsedAt: r.lastUsedAt ?? null,
    }))
  },
})

export const create = mutation({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')

    const limit = await rateLimiter.limit(ctx, 'createToken', { key: userId })
    if (!limit.ok) {
      const waitMin = Math.ceil(limit.retryAfter / 60_000)
      throw new ConvexError(
        `Too many tokens created recently. Try again in ${waitMin} minute${waitMin === 1 ? '' : 's'}.`,
      )
    }

    const label = args.label.trim() || 'New token'
    if (label.length > MAX_LABEL_LEN) {
      throw new ConvexError(
        `Label must be ${MAX_LABEL_LEN} characters or fewer`,
      )
    }

    const existing = await ctx.db
      .query('shortcutTokens')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    if (existing.length >= MAX_TOKENS_PER_USER) {
      throw new ConvexError(
        `You already have ${MAX_TOKENS_PER_USER} tokens — revoke one before creating another.`,
      )
    }

    const token = generateToken()
    const tokenHash = await sha256Hex(token)
    const lastFour = token.slice(-4)

    const tokenId = await ctx.db.insert('shortcutTokens', {
      userId,
      tokenHash,
      label,
      lastFour,
    })

    return { tokenId, token, label, lastFour }
  },
})

export const revoke = mutation({
  args: { tokenId: v.id('shortcutTokens') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')
    const row = await ctx.db.get(args.tokenId)
    if (!row) throw new ConvexError('Token not found')
    if (row.userId !== userId) {
      throw new ConvexError('You can only revoke your own tokens')
    }
    await ctx.db.delete(args.tokenId)
    return { ok: true }
  },
})

// Called from the public HTTP action. Returns the owning user id + token
// id if the hash matches a live token, otherwise null.
export const findByHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('shortcutTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', args.tokenHash))
      .unique()
    if (!row) return null
    return { _id: row._id, userId: row.userId }
  },
})
