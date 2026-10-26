import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
      <div className="text-center">
        <div className="text-7xl mb-4">📉</div>
        <h1 className="text-5xl font-bold text-white mb-2">404</h1>
        <p className="text-gray-400 mb-6">This page doesn't exist.</p>
        <Link to="/" className="btn-primary">Go to Dashboard</Link>
      </div>
    </div>
  );
}
