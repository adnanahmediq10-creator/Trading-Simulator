import { useSocket } from '../hooks/useSocket.js';
import { useMarketStatus } from '../hooks/useMarketStatus.js';
import { formatVirtualTime } from '../lib/time.js';

export default function StatusBar() {
  const { connected, reconnecting } = useSocket();
  const status = useMarketStatus();

  const mode = status?.effectiveMode ?? status?.mode;
  const vts = status?.virtualNowMs;
  const speed = status?.speed;
  const sessionDate = status?.sessionDate;

  let modeBadge = null;
  if (mode === 'DELAYED_LIVE') {
    modeBadge = <span className="badge-blue">🔵 Delayed 15 min</span>;
  } else if (mode === 'DEMO_REPLAY') {
    modeBadge = (
      <span className="badge-amber">
        🟡 Demo replay · {sessionDate}
        {speed && speed > 1 ? ` · ${speed}×` : ''}
      </span>
    );
  }

  let connBadge;
  if (reconnecting) {
    connBadge = <span className="badge-amber">⟳ Reconnecting…</span>;
  } else if (connected) {
    connBadge = <span className="badge-green">● Live</span>;
  } else {
    connBadge = <span className="badge-red">○ Offline</span>;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-900/80 border-b border-gray-800 text-xs">
      <span className="font-mono text-gray-300">{formatVirtualTime(vts)}</span>
      {modeBadge}
      {connBadge}
      <span className="ml-auto text-gray-600">TradeVirtual</span>
    </div>
  );
}
