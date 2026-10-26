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
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-900/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📈</div>
          <h1 className="text-2xl font-bold text-white">TradeVirtual</h1>
          <p className="text-gray-400 mt-1 text-sm">Create your trading account</p>
        </div>

        {/* Features strip */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { icon: '💰', text: '₹10L Virtual Funds' },
            { icon: '📊', text: 'Live NSE Data' },
            { icon: '🔒', text: 'Risk Free' },
          ].map(({ icon, text }) => (
            <div key={text} className="card p-2.5 text-center">
              <div className="text-lg">{icon}</div>
              <div className="text-xs text-gray-400 mt-1">{text}</div>
            </div>
          ))}
        </div>

        <div className="card p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-5">Create account</h2>

          <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
            <div>
              <label className="text-xs text-gray-400 mb-1 block" htmlFor="name">Full Name</label>
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
              <label className="text-xs text-gray-400 mb-1 block" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block" htmlFor="password">
                Password <span className="text-gray-600">(min 8 chars, 1 letter, 1 number)</span>
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-400 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              id="register-submit"
              type="submit"
              disabled={registerPending}
              className="btn-primary w-full py-3"
            >
              {registerPending ? 'Creating account…' : 'Create account & Start Trading'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Simulation only. Not financial advice.
        </p>
      </div>
    </div>
  );
}
