import { useState, useCallback, createContext, useContext } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = 'info', duration = 4500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map((t) => {
          let icon = 'ℹ️';
          let borderCls = 'border-slate-200 bg-white text-slate-800 shadow-lg';
          let iconBg = 'bg-slate-100 text-slate-600';

          if (t.type === 'success') {
            icon = '✓';
            borderCls = 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-md shadow-emerald-900/10';
            iconBg = 'bg-emerald-200 text-emerald-800';
          } else if (t.type === 'error') {
            icon = '!';
            borderCls = 'border-rose-200 bg-rose-50 text-rose-900 shadow-md shadow-rose-900/10';
            iconBg = 'bg-rose-200 text-rose-800';
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg text-xs font-semibold animate-slide-up transition-all ${borderCls}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 ${iconBg}`}
              >
                {icon}
              </span>
              <span className="flex-1 leading-relaxed">{t.msg}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="opacity-50 hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-700 rounded transition-opacity"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
