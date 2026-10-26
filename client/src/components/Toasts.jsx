import { useState, useCallback } from 'react';
import { createContext, useContext } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-slide-up
              ${t.type === 'success' ? 'bg-emerald-700 text-white' : ''}
              ${t.type === 'error' ? 'bg-red-700 text-white' : ''}
              ${t.type === 'info' ? 'bg-gray-800 text-white border border-gray-700' : ''}`}
          >
            <span className="flex-1">{t.msg}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
