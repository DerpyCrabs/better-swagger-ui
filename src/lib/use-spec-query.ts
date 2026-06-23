import { useQuery } from '@tanstack/solid-query'
import type { Accessor } from 'solid-js'
import {
  fetchSpecSource,
  sourceFromQueryKey,
  specPlaceholderData,
  specQueryKey,
  type SpecQuerySource,
} from './spec-query'

export function useSpecQuery(source: Accessor<SpecQuerySource | null>) {
  return useQuery(() => {
    const current = source()
    return {
      queryKey: current ? specQueryKey(current) : (['spec', 'idle'] as const),
      queryFn: ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const fetchSource = sourceFromQueryKey(queryKey)
        if (!fetchSource) throw new Error('Invalid spec query key')
        return fetchSpecSource(fetchSource)
      },
      enabled: current !== null,
      placeholderData: (
        previousData: Awaited<ReturnType<typeof fetchSpecSource>> | undefined,
        previousQuery: { queryKey: readonly unknown[] } | undefined,
      ) => specPlaceholderData(current, previousData, previousQuery as never),
    }
  })
}
