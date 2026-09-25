export interface Repo {
  id: number
  full_name: string
  owner: { login: string; avatar_url: string }
  html_url: string
  description: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  language: string | null
  topics: string[]
  pushed_at: string
}

export interface Contributor {
  login: string
  avatar_url: string
  html_url: string
  contributions: number
}

export class RateLimitError extends Error {
  constructor(message = 'GitHub API rate limit reached — showing repository owners instead.') {
    super(message)
    this.name = 'RateLimitError'
  }
}

/** Centralized Query Key Factory for TanStack Query */
export const projectKeys = {
  all: ['projects'] as const,
  contributors: (repos: string[]) => ['contributors-batch', repos] as const,
}

const CONTRIBUTORS_CACHE_KEY = 'osa:contributors:v1'
const CONTRIBUTORS_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CachedContributors {
  savedAt: number
  entries: Record<string, Contributor[]>
}

function readContributorsCache(): Record<string, Contributor[]> {
  try {
    const raw = localStorage.getItem(CONTRIBUTORS_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CachedContributors
    if (Date.now() - parsed.savedAt > CONTRIBUTORS_CACHE_TTL_MS) return {}
    return parsed.entries ?? {}
  } catch {
    return {}
  }
}

function writeContributorsCache(entries: Record<string, Contributor[]>): void {
  try {
    const cached: CachedContributors = { savedAt: Date.now(), entries }
    localStorage.setItem(CONTRIBUTORS_CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Storage unavailable (private mode, quota) — cache is best-effort only.
  }
}

/**
 * Fetch top contributors for several repos in ONE pass.
 * Unauthenticated GitHub requests are heavily rate-limited (60/hr per IP),
 * so we fetch sequentially, cache in localStorage for an hour, reuse the
 * in-flight promise across renders, and fall back to the repo owner when
 * a repo's contributor list can't be loaded.
 */
export async function fetchTopContributorsBatch(
  fullNames: string[],
  signal?: AbortSignal,
): Promise<Record<string, Contributor[]>> {
  const result: Record<string, Contributor[]> = {}
  const missing: string[] = []
  const cache = readContributorsCache()

  for (const name of fullNames) {
    const cached = cache[name]
    if (cached?.length) result[name] = cached
    else missing.push(name)
  }

  let rateLimited = false
  for (const name of missing) {
    if (signal?.aborted) break
    try {
      const url = `https://api.github.com/repos/${name}/contributors?per_page=3&sort=contributions`
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (res.status === 403 || res.status === 429) {
        rateLimited = true
        break
      }
      if (res.ok) {
        const data = (await res.json()) as Contributor[]
        if (Array.isArray(data) && data.length > 0) {
          result[name] = data.slice(0, 3)
          cache[name] = result[name]
        }
      }
    } catch (err) {
      if (signal?.aborted) break
      if (err instanceof DOMException && err.name === 'AbortError') break
      // Network error for this repo: leave it missing, keep going.
    }
  }

  if (Object.keys(cache).length > 0) writeContributorsCache(cache)
  if (rateLimited) throw new RateLimitError()
  return result
}

/** Fallback list when a repo's contributors can't be loaded: the owner. */
export function ownerAsContributor(fullName: string, avatarUrl: string): Contributor[] {
  const [owner] = fullName.split('/')
  return [
    {
      login: owner,
      avatar_url: avatarUrl,
      html_url: `https://github.com/${owner}`,
      contributions: 0,
    },
  ]
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export function formatPushedAt(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}
