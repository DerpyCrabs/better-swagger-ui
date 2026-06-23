import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import type { ParentProps } from 'solid-js'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

export function AppQueryProvider(props: ParentProps) {
  return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
}
