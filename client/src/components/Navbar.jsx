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
    `text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
      isActive ? 'bg-sky-900/60 text-sky-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-800 bg-[#111827]/90 backdrop-blur-sm sticky top-0 z-40">
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-2 mr-4">
        <span className="text-xl">📈</span>
        <span className="font-bold text-white text-base tracking-tight">TradeVirtual</span>
      </NavLink>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        <NavLink to="/" end className={navLinkClass}>Markets</NavLink>
        <NavLink to="/portfolio" className={navLinkClass}>Portfolio</NavLink>
        <NavLink to="/orders" className={navLinkClass}>Orders</NavLink>
      </nav>

      {/* Spacer */}
      <div className="ml-auto flex items-center gap-4">
        {/* Mode indicator */}
        {mode === 'DEMO_REPLAY' && (
          <span className="badge-amber hidden sm:flex">Demo Replay · {status?.sessionDate}</span>
        )}
        {mode === 'DELAYED_LIVE' && (
          <span className="badge-blue hidden sm:flex">NSE Delayed 15 min</span>
        )}

        {/* Connection dot */}
        <span title={connected ? 'Live' : 'Offline'}>
          <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm' : 'bg-red-500'}`} />
        </span>

        {/* Cash */}
        {user && (
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs text-gray-500">Buying Power</span>
            <span className="text-sm font-mono font-medium text-white">
              {formatINRCompact(user.cashPaise - (user.reservedCashPaise ?? 0))}
            </span>
          </div>
        )}

        {/* User menu */}
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 hidden sm:block">{user.name}</span>
            <button
              onClick={handleLogout}
              className="btn-ghost text-xs px-2 py-1"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
