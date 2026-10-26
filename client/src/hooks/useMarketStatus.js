import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useTicks } from './useTicks.js';

export function useMarketStatus() {
  const { status: liveStatus } = useTicks();
  const { data } = useQuery({
    queryKey: ['market', 'status'],
    queryFn: api.status,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  return liveStatus ?? data ?? null;
}
