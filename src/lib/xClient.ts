import { secrets } from '@botpress/runtime'

// Minimal client for X API v2 recent-search.
// Docs: https://docs.x.com/x-api/posts/search/recent-search

const X_API_BASE = 'https://api.x.com/2'

export type Tweet = {
  id: string
  text: string
  author_id: string
  created_at: string
  public_metrics: {
    like_count: number
    retweet_count: number
    reply_count: number
    quote_count: number
    impression_count?: number
  }
}

export type XUser = {
  id: string
  name: string
  username: string
}

type RecentSearchResponse = {
  data?: Tweet[]
  includes?: { users?: XUser[] }
  meta?: { result_count: number }
}

// Sleep helper for backoff.
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Call X API with bearer auth. Retries on 429 (respecting reset header) and
// 5xx with exponential backoff. Returns parsed JSON or throws on final failure.
async function xFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = secrets.X_BEARER_TOKEN
  if (!token) {
    throw new Error('X_BEARER_TOKEN secret is not set. Export it')
  }

  const url = `${X_API_BASE}${path}?${new URLSearchParams(params).toString()}`
  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      return (await res.json()) as T
    }

    // 429: rate limited — sleep until x-rate-limit-reset (epoch seconds).
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset') ?? '0')
      const waitMs = Math.max(reset * 1000 - Date.now(), 1000)
      await sleep(Math.min(waitMs, 60_000))
      continue
    }

    // 5xx: transient — exponential backoff.
    if (res.status >= 500 && attempt < maxAttempts) {
      await sleep(2 ** attempt * 500)
      continue
    }

    const body = await res.text()
    throw new Error(`X API ${res.status}: ${body}`)
  }

  throw new Error(`X API failed after ${maxAttempts} attempts`)
}

// Search recent tweets
export async function searchRecent(
  query: string,
  maxResults = 25,
): Promise<{ tweets: Tweet[]; users: Map<string, XUser> }> {
  const data = await xFetch<RecentSearchResponse>('/tweets/search/recent', {
    query,
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username,name',
  })

  const users = new Map<string, XUser>()
  for (const u of data.includes?.users ?? []) users.set(u.id, u)

  return { tweets: data.data ?? [], users }
}
