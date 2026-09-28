export const NETWORK =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") || "devnet";

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function formatAmount(amount: number, currency: string): string {
  const digits = currency === "SOL" ? 4 : 2;
  const value = amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return `${value} ${currency}`;
}

export function addressExplorerLink(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${NETWORK}`;
}

// "3d 4h", "4h 12m", "12m", or null once the moment has passed
export function timeUntil(target: Date, now: number = Date.now()): string | null {
  const ms = target.getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(mins, 1)}m`;
}

/** Longest prefix of `value` that fits in `maxBytes` of UTF-8, never splitting a character. */
export function clampUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let out = "";
  let used = 0;
  for (const ch of value) {
    const size = encoder.encode(ch).length;
    if (used + size > maxBytes) break;
    out += ch;
    used += size;
  }
  return out;
}

/** Digits and at most one decimal point, with no more fractional digits than the token has. */
export function sanitizeAmountInput(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const whole = cleaned.slice(0, dot);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  return `${whole}.${fraction}`;
}
