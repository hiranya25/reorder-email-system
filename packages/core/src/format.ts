const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "2025-10-01".."2026-01-31" -> "October 2025 – January 2026" */
export function formatSeasonRange(startIso: string, endIso: string): string {
  const label = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return `${MONTHS[(m ?? 1) - 1]} ${y}`;
  };
  return `${label(startIso)} – ${label(endIso)}`;
}
