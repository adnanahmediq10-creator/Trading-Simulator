import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const { login, loginPending } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message ?? 'Login failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Soft Glow Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 items-center justify-center text-2xl shadow-lg shadow-sky-500/20 mb-3.5">
            <span className="text-white">📈</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center justify-center gap-1.5">
            TradeVirtual
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-300">
              PRO
            </span>
          </h1>
          <p className="text-slate-500 mt-1 text-xs font-medium">Professional NSE Paper Trading Terminal</p>
          <div className="mt-2 text-xs font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 inline-flex items-center gap-1.5 px-3 py-1 rounded-full shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            ₹10,00,000 Virtual Capital Credited
          </div>
        </div>

        {/* Auth Card */}
        <div className="card-elevated p-7 shadow-lg border-slate-200 bg-white">
          <h2 className="text-base font-bold text-slate-900 mb-5 tracking-tight">
            Sign in to Terminal
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
            <div>
              <label className="text-xs text-slate-700 font-semibold mb-1.5 block" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-xs text-slate-700 font-semibold mb-1.5 block" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2.5 rounded-lg flex items-center gap-2 font-medium">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loginPending}
              className="btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider mt-2 shadow-md shadow-sky-600/20"
            >
              {loginPending ? 'Authenticating…' : 'Launch Session'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6 font-medium">
            New to TradeVirtual?{' '}
            <Link to="/register" className="text-sky-600 hover:text-sky-700 font-bold underline underline-offset-2">
              Create account
            </Link>
          </p>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-5 font-medium">
          Virtual simulation only. No real money at risk.
        </p>
      </div>
    </div>
  );
}
