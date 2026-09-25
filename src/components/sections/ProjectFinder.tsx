import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, SearchX, TriangleAlert } from 'lucide-react'
import {
  searchRepositories,
  searchKeys,
  BackendUnavailableError,
  type SearchRepoItem,
} from '@/lib/search'
import { fetchTopContributorsBatch, projectKeys, RateLimitError } from '@/lib/github'
import { Card, CardContent, CardFooter, CardHeader, Button, Skeleton, EmptyState } from '@/components/ui'
import { RepoCard, ContributorStackSkeleton, type FormattedRepo } from '@/components/shared'

const DEFAULT_QUERY = 'beginner-friendly open source libraries for building web apps'
const RESULT_COUNT = 3

function formatRepo(item: SearchRepoItem): FormattedRepo {
  const owner = item.full_name.split('/')[0]
  return {
    id: item.repo_id,
    fullName: item.full_name,
    owner,
    ownerAvatarUrl: `https://github.com/${owner}.png?size=64`,
    url: item.html_url,
    description: item.description,
    stars: item.stars,
    forks: item.forks,
    openIssues: item.open_issues,
    language: item.language,
    topics: item.topics.slice(0, 3),
    pushedAt: item.pushed_at ?? new Date().toISOString(),
  }
}

/**
 * Curated top picks from the semantic search backend — no query UI.
 * The ranking (query, popularity blending) is owned by the backend.
 */
export function ProjectFinder() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: searchKeys.query(DEFAULT_QUERY),
    queryFn: ({ signal }) => searchRepositories({ query: DEFAULT_QUERY, limit: RESULT_COUNT, signal }),
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, err) => {
      if (err instanceof BackendUnavailableError || err instanceof RateLimitError) return false
      return failureCount < 1
    },
  })

  const repos = useMemo(() => (data?.items ?? []).map(formatRepo), [data])
  const repoNames = repos.map((r) => r.fullName)

  // One batched call for all repos (cached + owner fallback inside).
  const contributorsQuery = useQuery({
    queryKey: projectKeys.contributors(repoNames),
    queryFn: ({ signal }) => fetchTopContributorsBatch(repoNames, signal),
    enabled: repoNames.length > 0,
    staleTime: 60 * 60 * 1000,
    retry: (failureCount, err) => {
      if (err instanceof RateLimitError) return false
      return failureCount < 1
    },
  })

  const contributorsMap = contributorsQuery.data ?? {}

  return (
    <section id="finder" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-24 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Explore — top picks</p>
          <h2 className="section-h2 section-underline max-w-[24ch]">
            Three repos worth your first PR
          </h2>
          <p className="section-body mt-6">
            Ranked by our semantic engine — meaning, not just stars — with their top
            contributors. Sign up to save favorites and get a roadmap built around
            your stack.
          </p>
        </div>
        <span className="chip-neutral hidden font-mono md:inline-flex">module: explore</span>
      </div>

      {isPending ? (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {Array.from({ length: RESULT_COUNT }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </CardHeader>
              <CardContent className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </CardContent>
              <CardFooter className="border-t border-border pt-4">
                <ContributorStackSkeleton />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={TriangleAlert}
          iconClassName="text-accent-text"
          title="Could not load projects"
          description={
            error instanceof BackendUnavailableError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Something went wrong. Please try again.'
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      ) : repos.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No projects indexed yet"
          description="The curation pipeline hasn't ingested repositories yet. Check back soon."
        />
      ) : (
        <div
          className={`mt-8 grid grid-cols-1 gap-5 transition-opacity duration-300 md:grid-cols-3 ${
            isFetching ? 'opacity-60' : 'opacity-100'
          }`}
        >
          {repos.map((repo, i) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              contributors={contributorsMap[repo.fullName]}
              index={i}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default ProjectFinder
