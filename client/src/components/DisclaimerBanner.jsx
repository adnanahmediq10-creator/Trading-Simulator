/**
 * DisclaimerBanner — always visible at the top of every page.
 * Spec requirement: clear banner everywhere about simulation status.
 */
export default function DisclaimerBanner() {
  return (
    <div
      role="banner"
      className="w-full bg-amber-950/80 border-b border-amber-800/50 px-4 py-1.5 text-center text-xs text-amber-300 font-medium"
    >
      ⚠️ <strong>SIMULATION ONLY</strong> — Virtual money only. Not financial advice. Prices may
      be delayed by 15 minutes or synthetically generated.
    </div>
  );
}
