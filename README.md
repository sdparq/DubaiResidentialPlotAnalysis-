# Dubai Residential Plot Analysis

**Feasibility studies for residential plots in Dubai — in minutes, not weeks.**

A web platform for developers, investment teams and architects: trace the plot, define typologies and the
unit program, and get GFA, parking, lifts, waste room, 3D massing on the real site, sun and views, and the
project economics — including the residual land value — computed live, with a printable report and a
multi-sheet Excel export ready to share.

Ships with the neutral **PLOTIQ** brand and is built to be white-labelled per client in one file (see
[White-labelling](#white-labelling--rebranding)).

## What it does

| Tab | What you get |
| --- | --- |
| 00 · Plot | Trace the parcel over the affection plan (PDF or image), or pick a polygon straight from a vector PDF; 2-point scale calibration |
| 01 · Setup | Plot number, area / community, plot area, floors, heights · **planning constraints** (permitted GFA, max FAR, max height) with live pass / fail · location from coordinates or a pasted Google Maps link |
| 02 · Typologies | Unit types with interior + balcony areas (m² and sq ft), occupancy and parking ratios |
| 03 · Program | Typologies × floors matrix → units, sellable area, GFA; repeat a typical floor on every floor above in one click |
| 04 · Common areas | Lobbies, corridors, lifts, MEP, amenities — each flagged GFA / BUA / open-air, in m² or % of GFA |
| 05 · Parking | Required (per-typology ratios + other uses + accessible spaces) vs available by level |
| 06 · Lifts | CIBSE Guide D up-peak round-trip time, handling capacity and interval, rule of thumb and a configurable minimum |
| 07 · Waste | Dubai Municipality waste generation, storage and room sizing (every parameter editable) |
| 08 · Massing | 3D volumes (block, podium + tower, courtyard, twin towers, stepped, L, U) and ranked variants — in studio or dropped on the real site with a satellite / topo basemap and OpenStreetMap neighbours |
| 09 · Sun & Views | Annual sun hours or shadows at a date and UAE clock time, and views to a landmark, painted on the façades |
| 10 · Economics | GDV, total development cost (incl. 4 % DLD land transfer fee), profit, margins, land price per sq ft of GFA and the **residual land value** at a target margin · prices in AED / sq ft or AED / m² |
| 11 · Results | KPI dashboard, economics summary, compliance checks and a **Print / Save PDF** report |

Projects are saved automatically in the browser (IndexedDB — client data never leaves their machine).
Share a project with *Export JSON*, keep a copy of everything with *Backup all* in the project menu, and
restore either with *Import*. The Excel export writes 8 sheets: setup, typologies & mix, program, parking,
lifts, waste room, economics and conclusions.

A scripted product walkthrough lives at `/demo` — every number in it is computed live from the bundled
sample project (Dubai Production City), not hard-coded. The sample's prices and costs are illustrative.

## Calculation methods

- **Areas** — GFA = unit interiors + GFA common areas − shafts; BUA adds balconies and BUA-only commons;
  sellable = interior + balcony. Program, parking and waste reproduce the reference spreadsheet cell by cell
  (`lib/calc/parity.test.ts`).
- **Lifts (CIBSE Guide D)** — `S = N·[1 − (1 − 1/N)^P]`, `H = N − Σ(i/N)^P`,
  `RTT = 2·H·t_v + (S + 1)·t_s + 2·P·t_p`, handling per lift `300·P / RTT`. Lifts are sized on handling
  capacity (5 % / 7 %) and on the target interval, then compared with the rule of thumb and the minimum count.
- **Parking** — each typology uses its own ratio (Dubai defaults: 1 space per studio / 1BR / 2BR, 2 per 3BR+);
  totals and other uses are rounded up to whole spaces; accessible (PRM) spaces as a share of the requirement.
- **Economics** — residual land value = `(GDV × (1 − target margin) − all non-land costs) / (1 + DLD fee)`,
  i.e. the most that can be paid for the plot while still hitting the target margin.
- **Sun** — sun position from latitude, day of year and apparent solar time (UAE clock UTC+4 corrected for
  longitude and the equation of time); façades are rotated with the plot's north heading.

All defaults (ratios, rates, percentages) are editable per project. Results are pre-concept feasibility
figures — always verify against current Dubai Municipality, Dubai Civil Defence and RTA requirements.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind — fully static export
- Calculations: pure TS modules in `lib/calc/`, covered by Vitest
- 3D: react-three-fiber + drei; site context from Esri World Imagery / Topo + OSM Overpass (free, no API keys)
- State: Zustand persisted to IndexedDB (localStorage fallback), multi-project
- Export: ExcelJS · Optional AI scheme render: Gemini image-to-image (user supplies their own key in the UI)

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
npm test         # calculation, import, geometry and Excel tests
```

## Project structure

```
app/                   # Next.js routes (main app + /demo walkthrough)
components/            # tab UIs, 3D scenes, shared NumInput
lib/
  brand.ts             # product identity — edit to white-label
  types.ts             # data model
  store.ts             # Zustand store (multi-project)
  persist-storage.ts   # IndexedDB persistence + save-error reporting
  project-io.ts        # import validation, backup format
  site.ts              # plot / buildable / massing derivation shared by Massing and Sun & Views
  massing.ts, geom.ts  # massing shapes and polygon maths
  building-physics.ts  # sun, shadow and view analyses
  export-xlsx.ts       # multi-sheet Excel export
  standards/dubai.ts   # Dubai defaults (parking, waste, lifts) + area suggestions
  calc/                # program, parking, lifts, garbage, economic, compliance
```

## White-labelling / rebranding

The product is brand-neutral by design so it can be sold or licensed per client:

1. `lib/brand.ts` — wordmark, descriptor, product name, tagline. This is the only place a product/company
   name exists in the codebase.
2. `tailwind.config.ts` — the `brand` colour scale (currently a desert-sage green). Swap the 10 hex values to
   restyle every accent in the app.
3. Optional: the logo mark is inline SVG in `components/header-bar.tsx`, the favicon is `app/icon.svg`.

## Deploy to Netlify

The app is a fully static export — no server, no env vars, no plugins.

1. In Netlify: **Add new site → Import from Git** → pick this repo and branch.
2. `netlify.toml` is read automatically (build `npm run build`, publish `out/`, Node 20).
3. Deploy.

Any other static host (Vercel, Cloudflare Pages, S3…) works the same way.

## Urban-context 3D view

Massing → **In context** drops the project onto an Esri basemap and extrudes the surrounding buildings from
OpenStreetMap. Set the location in Setup (paste coordinates or a Google Maps link) and, if the plot's +Y axis
isn't true north, its north heading. Click any neighbour to override its height or hide it, add your own
neighbour towers for plots not yet built, and move the building with *Click to place* for fine alignment.
Esri tiles and Overpass are free, rate-limited services; if Overpass is busy the view and the sun analysis
still work, and say so.

## Adding new normatives

Standards live in `lib/standards/dubai.ts`. Add new jurisdictions as separate files (e.g. `abudhabi.ts`,
`sharjah.ts`) and inject via the active project — no changes needed in calc modules if the rules follow the
same shape.
