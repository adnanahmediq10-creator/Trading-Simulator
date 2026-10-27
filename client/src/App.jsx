import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orders from './pages/Orders.jsx';
import Portfolio from './pages/Portfolio.jsx';
import NotFound from './pages/NotFound.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import DisclaimerBanner from './components/DisclaimerBanner.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-3 select-none">
        <div className="w-9 h-9 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono font-medium text-slate-500">Initializing Terminal Session…</span>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <DisclaimerBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
