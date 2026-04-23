export function formatETH(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M ETH`;
  if (value >= 1_000) return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ETH`;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH`;
}
