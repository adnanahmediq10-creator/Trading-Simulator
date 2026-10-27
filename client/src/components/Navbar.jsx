import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useMarketStatus } from '../hooks/useMarketStatus.js';
import { useSocket } from '../hooks/useSocket.js';
import { formatINRCompact } from '../lib/money.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const status = useMarketStatus();
  const { connected } = useSocket();

  const mode = status?.effectiveMode ?? status?.mode;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `relative text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
      isActive
        ? 'text-sky-700 bg-white shadow-sm border border-slate-200/80'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
    }`;

  return (
    <header className="flex items-center gap-4 px-4 sm:px-6 py-2.5 border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-40 select-none shadow-xs">
      {/* Brand & Terminal Logo */}
      <NavLink to="/" className="flex items-center gap-2.5 mr-2 group">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-md shadow-sky-500/20 group-hover:shadow-sky-500/35 transition-all">
          <span className="text-base text-white">📈</span>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 text-sm tracking-tight leading-none flex items-center gap-1.5">
            TradeVirtual
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-sky-100 text-sky-700 border border-sky-300">
              PRO
            </span>
          </span>
          <span className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
            NSE Paper Trading
          </span>
        </div>
      </NavLink>

      {/* Primary Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
        <NavLink to="/" end className={navLinkClass}>
          Markets
        </NavLink>
        <NavLink to="/portfolio" className={navLinkClass}>
          Portfolio
        </NavLink>
        <NavLink to="/orders" className={navLinkClass}>
          Orders
        </NavLink>
      </nav>

      {/* Right Tools & Account Status */}
      <div className="ml-auto flex items-center gap-3">
        {/* Mode Pill */}
        {mode === 'DEMO_REPLAY' && (
          <span className="badge-amber hidden md:inline-flex items-center gap-1 text-[11px] py-1 px-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Replay · {status?.sessionDate}
          </span>
        )}
        {mode === 'DELAYED_LIVE' && (
          <span className="badge-blue hidden md:inline-flex items-center gap-1 text-[11px] py-1 px-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            NSE 15m Delayed
          </span>
        )}

        {/* Live Network Indicator */}
        <div
          title={connected ? 'Connected to live price feed' : 'Disconnected / Reconnecting'}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium"
        >
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                connected ? 'bg-emerald-600' : 'bg-rose-500'
              }`}
            />
          </span>
          <span className="text-[11px] text-slate-700 font-mono font-semibold hidden sm:inline">
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* User Buying Power Pill */}
        {user && (
          <div className="hidden sm:flex flex-col items-end px-3 py-1 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              Buying Power
            </span>
            <span className="text-xs font-mono font-bold text-slate-900 tabular-nums">
              {formatINRCompact(user.cashPaise - (user.reservedCashPaise ?? 0))}
            </span>
          </div>
        )}

        {/* User Menu & Sign Out */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-800 leading-tight">
                {user.name}
              </span>
              <span className="text-[10px] text-slate-500 truncate max-w-[120px] leading-tight font-medium">
                {user.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="btn-ghost text-xs px-2.5 py-1 text-slate-600 hover:text-rose-600 hover:border-rose-300 transition-colors"
              title="Sign out of your account"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
