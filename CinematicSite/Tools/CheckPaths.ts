import { join } from "node:path";

/** DOM-подпись не является путём: в имени остаются только безопасные символы. */
export function safeShotPath(outDir: string, viewport: "desktop" | "mobile", index: number, label: unknown): string {
  const safeLabel = String(label).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 72) || "section";
  return join(outDir, `${viewport}-${String(index).padStart(2, "0")}-${safeLabel}.jpg`);
}
