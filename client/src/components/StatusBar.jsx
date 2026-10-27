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
    modeBadge = (
      <span className="badge-blue text-[10px] py-0.5 px-2">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        NSE Delayed (15m)
      </span>
    );
  } else if (mode === 'DEMO_REPLAY') {
    modeBadge = (
      <span className="badge-amber text-[10px] py-0.5 px-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Demo Replay · {sessionDate}
        {speed && speed > 1 ? ` · ${speed}× Speed` : ''}
      </span>
    );
  }

  let connBadge;
  if (reconnecting) {
    connBadge = (
      <span className="badge-amber text-[10px] py-0.5 px-2 animate-pulse">
        ⟳ Reconnecting…
      </span>
    );
  } else if (connected) {
    connBadge = (
      <span className="badge-green text-[10px] py-0.5 px-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Socket Synchronized
      </span>
    );
  } else {
    connBadge = (
      <span className="badge-red text-[10px] py-0.5 px-2">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Offline
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-50 border-b border-slate-200 text-xs select-none">
      <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
        <span className="text-slate-400 font-semibold">IST</span>
        <span className="text-slate-900 font-bold tabular-nums">
          {formatVirtualTime(vts)}
        </span>
      </div>

      <div className="h-3 w-px bg-slate-200" />

      {modeBadge}
      {connBadge}

      <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500 font-medium">
        <span className="hidden sm:inline">Engine: NSE Equity Simulator</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-600 font-semibold">v2.4-pro</span>
      </div>
    </div>
  );
}
