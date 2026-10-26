/**
 * useTicks — subscribes to live ticks from the socket.
 * Returns { ticks: Map<symbol, tick>, status }
 */
import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket.js';

export function useTicks() {
  const { socket } = useSocket();
  const [ticks, setTicks] = useState(/** @type {Map<string,object>} */ (new Map()));
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!socket) return;

    function onTicks({ ticks: tickArr, status: st }) {
      setStatus(st);
      setTicks((prev) => {
        const next = new Map(prev);
        for (const t of tickArr) next.set(t.symbol, t);
        return next;
      });
    }

    socket.on('ticks', onTicks);
    return () => socket.off('ticks', onTicks);
  }, [socket]);

  const getTick = useCallback((symbol) => ticks.get(symbol) ?? null, [ticks]);

  return { ticks, status, getTick };
}
