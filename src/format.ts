import type { ShrinkReceipt, ShrinkResult } from "./types.js";

export function formatReceipt(receipt: ShrinkReceipt): string {
  const kept = receipt.bytesIn === 0 ? "0%" : `${Math.round((receipt.bytesOut / receipt.bytesIn) * 100)}%`;
  const parts = ["ctxtrim", receipt.kind, receipt.method, `${receipt.bytesIn} → ${receipt.bytesOut} bytes`, `kept ${kept}`];
  if (receipt.model) parts.push(receipt.model);
  if (receipt.warning) parts.push(receipt.warning);
  return parts.join(" · ");
}

export function formatForAgent(result: ShrinkResult): string {
  const receipt = formatReceipt(result.receipt);
  if (!result.text) return receipt;
  return `${result.text}\n\n---\n${receipt}`;
}
