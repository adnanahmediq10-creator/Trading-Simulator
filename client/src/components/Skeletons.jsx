export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card p-5 space-y-3.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="space-y-3 py-2">
      {/* Header skeleton */}
      <div
        className="grid gap-3 pb-2 border-b border-slate-800/80"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, j) => (
          <Skeleton key={`h-${j}`} className="h-4 w-20" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={`r-${i}`}
          className="grid gap-3 py-1.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={`c-${i}-${j}`} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="flex flex-col h-full gap-3 p-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-48 rounded-lg" />
        <Skeleton className="h-7 w-24 rounded-lg ml-auto" />
      </div>
      <Skeleton className="flex-1 rounded-xl" />
    </div>
  );
}

export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center text-3xl mb-4 shadow-inner">
        {icon}
      </div>
      <h3 className="text-base font-bold text-white mb-1.5 tracking-tight">{title}</h3>
      {description && (
        <p className="text-slate-400 text-xs mb-5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
