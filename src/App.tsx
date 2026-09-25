import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage, HomePage } from '@/page'
import { useAuthStore } from '@/lib/auth-store'

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: (failureCount, error) => {
              if (error instanceof Error && error.message.toLowerCase().includes('rate limit')) {
                return false
              }
              return failureCount < 1
            },
          },
        },
      }),
  )
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)

  // Re-validate persisted sessions against /auth/me on refresh.
  useEffect(() => {
    void useAuthStore.getState().hydrate()
  }, [])

  const handleLogout = () => {
    useAuthStore.getState().logout()
    window.scrollTo({ top: 0 })
  }

  // Wait for session validation before rendering the gated dashboard.
  if (authStatus === 'loading') {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <p className="animate-pulse font-mono text-sm text-muted-foreground">restoring session…</p>
        </div>
      </QueryClientProvider>
    )
  }

  // Signed-in users land on the dashboard instead of the marketing page.
  if (user) {
    return (
      <QueryClientProvider client={queryClient}>
        <DashboardPage onLogout={handleLogout} />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>
  )
}
