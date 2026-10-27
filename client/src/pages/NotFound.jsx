import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-center p-6 select-none">
      <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl mb-4 shadow-sm">
        📉
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">
        404 — Instrument Not Found
      </h1>
      <p className="text-slate-500 text-xs mb-6 max-w-sm leading-relaxed font-medium">
        The requested screen or market route does not exist in this active trading session.
      </p>
      <Link to="/" className="btn-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wider">
        Return to Markets
      </Link>
    </div>
  );
}
