/**
 * Product identity — the single place to (re)brand the app.
 *
 * To white-label for a client: change the values below and, if you want a
 * different accent colour, the `brand` palette in tailwind.config.ts.
 * Nothing else in the codebase hard-codes a company or product name.
 */
export const BRAND = {
  /** Wordmark shown in the header and demo (short, uppercase reads best). */
  wordmark: "PLOTIQ",
  /** Small descriptor under the wordmark. */
  descriptor: "Plot Feasibility",
  /** Full product name — browser tab, Excel exports. */
  productName: "PlotIQ — Residential Plot Feasibility",
  /** One-line pitch used in metadata and the demo. */
  tagline: "Residential plot feasibility for Dubai developers",
  /** Market line shown next to the brand. */
  market: "Dubai",
} as const;
