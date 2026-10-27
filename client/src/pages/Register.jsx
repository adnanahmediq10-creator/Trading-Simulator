import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function Register() {
  const { register, registerPending } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await register({ name, email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message ?? 'Registration failed');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Soft Glow Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-sky-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 items-center justify-center text-2xl shadow-lg shadow-sky-500/20 mb-3.5">
            <span className="text-white">📈</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center justify-center gap-1.5">
            TradeVirtual
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-300">
              PRO
            </span>
          </h1>
          <p className="text-slate-500 mt-1 text-xs font-medium">Initialize your risk-free simulated trading desk</p>
        </div>

        {/* Feature Value Props */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {[
            { icon: '💰', text: '₹10L Virtual Funds' },
            { icon: '📊', text: 'Live NSE Ticks' },
            { icon: '🛡️', text: 'Zero Risk' },
          ].map(({ icon, text }) => (
            <div key={text} className="card p-2.5 text-center border-slate-200 bg-white shadow-2xs">
              <div className="text-base">{icon}</div>
              <div className="text-[11px] font-bold text-slate-700 mt-1">{text}</div>
            </div>
          ))}
        </div>

        {/* Auth Card */}
        <div className="card-elevated p-7 shadow-lg border-slate-200 bg-white">
          <h2 className="text-base font-bold text-slate-900 mb-5 tracking-tight">Create Trader Account</h2>

          <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
            <div>
              <label className="text-xs text-slate-700 font-semibold mb-1.5 block" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Arjun Sharma"
                required
                minLength={1}
                maxLength={60}
              />
            </div>

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
                Password <span className="text-slate-400 font-normal font-mono text-[10px]">(min 8 chars, 1 letter, 1 number)</span>
              </label>
              <input
                id="password"
                type="password"
                className="input font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2.5 rounded-lg flex items-center gap-2 font-medium">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              id="register-submit"
              type="submit"
              disabled={registerPending}
              className="btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider mt-2 shadow-md shadow-sky-600/20"
            >
              {registerPending ? 'Creating Account…' : 'Start Trading'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6 font-medium">
            Already have an account?{' '}
            <Link to="/login" className="text-sky-600 hover:text-sky-700 font-bold underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-5 font-medium">
          Simulation environment for educational and training purposes only.
        </p>
      </div>
    </div>
  );
}
