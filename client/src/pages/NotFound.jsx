import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex flex-col items-center justify-center text-center p-6">
      <div className="text-6xl mb-4">📉</div>
      <h1 className="text-3xl font-bold text-white mb-2">404 — Page Not Found</h1>
      <p className="text-gray-400 mb-8 max-w-sm">
        The page you're looking for doesn't exist in this trading session.
      </p>
      <Link to="/" className="btn-primary px-6">
        Back to Markets
      </Link>
    </div>
  );
}
