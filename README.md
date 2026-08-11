# Dubai Residential Plot Analysis

**Feasibility studies for residential plots in Dubai — in minutes, not weeks.**

A web platform for developers, investment teams and architects: paste in a plot,
define typologies and the unit program, and get GFA, parking, lifts, waste room,
3D massing on the real site, solar behaviour and project economics — all
computed live against Dubai norms, with a multi-sheet Excel export ready to share.

Ships with the neutral **PLOTIQ** brand and is built to be white-labelled per
client in one file (see [White-labelling](#white-labelling--rebranding)).

## What it does

| Tab | What you get |
| --- | --- |
| 00 · Plot | Trace the parcel over a PDF / aerial image with a 2-point scale; per-edge setbacks compute the buildable polygon automatically |
| 01 · Setup | Zone, plot area, floors, heights, shafts, PRM ratio |
| 02 · Typologies | Unit types with interior + balcony areas, occupancy and parking ratios |
| 03 · Program | Matrix of typologies × floors → units, sellable area, GFA |
| 04 · Common areas | Lobbies, corridors, lifts, MEP, amenities — each flagged GFA / BUA / open-air |
| 05 · Parking | Required (Dubai ratios incl. PRM) vs available by level, plus retail/F&B demand |
| 06 · Lifts | CIBSE Guide D round-trip calculation + rule-of-thumb + DCD minimums |
| 07 · Garbage | Dubai Municipality waste generation, storage and room sizing |
| 08 · Massing | 3D volumes (block, podium, courtyard, twin, stepped, L, U…) — in studio or dropped onto the real site with satellite imagery and OSM neighbours |
| 09 · Physics | Sun path and shadow studies on the massing |
| 10 · Economic | Land, construction and soft costs vs sellable revenue → margin |
| 11 · Results | KPI dashboard with compliance checks, plus scheme variants |

Everything auto-saves locally in the browser (no backend — client data never
leaves their machine). Analyses are shareable via Export/Import JSON, and the
Excel export recreates a full 5-sheet feasibility workbook.

A scripted product walkthrough lives at `/demo` — every number in it is computed
live from the bundled sample project (Production City, IMPZ), not hard-coded.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind — fully static export
- Calculations: pure TS modules in `lib/calc/` (unit-tested)
- 3D: react-three-fiber + drei; site context from Esri World Imagery + OSM Overpass (free, no API keys)
- State: Zustand persisted to `localStorage` (multi-project)
- Export: ExcelJS
- Optional AI scheme render: Gemini image-to-image (user supplies their own API key in the UI)

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
npm test         # calculation parity suite
```

## Project structure

```
app/                 # Next.js routes (main app + /demo walkthrough)
components/          # tab UIs (plot, setup, typologies, program, …)
lib/
  brand.ts           # product identity — edit to white-label
  types.ts           # data model
  store.ts           # Zustand store + localStorage persistence
  sample.ts          # bundled sample project (Production City)
  export-xlsx.ts     # multi-sheet Excel export
  standards/dubai.ts # Dubai DCD/DM constants (parking, waste, lifts, fire)
  calc/
    program.ts       # GFA, units, mix, common areas, efficiency
    parking.ts       # required vs available, PRM
    lifts.ts         # CIBSE Guide D + practical checks
    garbage.ts       # Dubai DM waste room
    parity.test.ts   # regression suite over the sample project
```

## White-labelling / rebranding

The product is brand-neutral by design so it can be sold or licensed per client:

1. `lib/brand.ts` — wordmark, descriptor, product name, tagline. This is the
   only place a product/company name exists in the codebase.
2. `tailwind.config.ts` — the `brand` colour scale (currently a desert-sage
   green). Swap the 10 hex values to restyle every accent in the app.
3. Optional: the logo mark is inline SVG in `components/header-bar.tsx`.

## Deploy to Netlify

The app is a fully static export — no server, no env vars, no plugins.

1. In Netlify: **Add new site → Import from Git** → pick this repo and branch.
2. `netlify.toml` is read automatically (build `npm run build`, publish `out/`, Node 20).
3. Deploy.

Any other static host (Vercel, Cloudflare Pages, S3…) works the same way.

## Urban-context 3D view

The Massing tab has a *Studio / In context* toggle. In-context drops the project
onto an Esri satellite/topo basemap and extrudes the surrounding buildings as
white volumes from OpenStreetMap data — no API keys or signups.

1. Fill **Latitude** / **Longitude** in Setup (optional **North heading** if the
   plot's +Y axis isn't true north).
2. Massing → **In context**.
3. Click any neighbour volume to override its height (useful for masterplan
   plots not yet built), hide it, or reset to the OSM default. You can also add
   custom neighbour towers and shuffle heights for skyline studies. Edits
   persist with the project.

Heights default to OSM's `height` tag (or `building:levels × 3.2 m`, fallback
9 m). Esri tiles and Overpass are rate-limited free services — fine for normal
interactive use.

## Adding new normatives

Standards live in `lib/standards/dubai.ts`. Add new jurisdictions as separate
files (e.g. `abudhabi.ts`, `sharjah.ts`) and inject via the active project — no
changes needed in calc modules if the rules follow the same shape.

## Disclaimer

Results are pre-concept feasibility figures. Regulations change and vary by
zone and authority — always verify against the current Dubai Municipality /
DCD / RTA requirements before committing to a scheme or submission.
