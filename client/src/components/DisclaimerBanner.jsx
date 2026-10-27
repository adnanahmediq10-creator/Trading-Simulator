/**
 * DisclaimerBanner — always visible at the top of every page.
 * Clear indicator that the platform operates on virtual paper-trading currency.
 */
export default function DisclaimerBanner() {
  return (
    <div
      role="banner"
      className="w-full bg-amber-50/90 border-b border-amber-200/80 px-4 py-1 text-center text-xs text-amber-900 font-medium flex items-center justify-center gap-2 select-none"
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold">
        !
      </span>
      <span>
        <strong className="font-bold text-amber-900 uppercase tracking-wider text-[11px] mr-1">
          Simulation Mode
        </strong>
        — Virtual funds only. Not financial advice. Live NSE prices may be delayed 15m or session-replayed.
      </span>
    </div>
  );
}
