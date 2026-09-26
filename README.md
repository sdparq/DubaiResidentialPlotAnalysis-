# Dubai Residential Plot Analysis

**Feasibility studies for residential plots in Dubai and Abu Dhabi — in minutes, not weeks.**

A web platform for developers, investment teams and architects: read the plot from the DLD affection plan,
split the GFA by use, get the unit mix for the zone's market class, fill the apartments floor by floor, size
the parking and see the scheme as a designed Dubai residential tower in 3D, with its areas and ratios.

Ships with the neutral **PLOTIQ** brand and is built to be white-labelled per client (see
[White-labelling](#white-labelling--rebranding)). Every new browser opens a fully worked **demo scheme** — a
fictional 2B+G+3P+35 residential tower on a 3,200 m² plot in Business Bay — so every step and the 3D model have
something to show from the first click.

## The workspace

- **Workflow sidebar** — the study in eight steps grouped by phase (Site · Programme · Services · Design ·
  Results), with a tick on every step that has its data and a progress bar.
- **Live KPI bar** — plot area, GFA vs target, FAR, units, sellable area, efficiency, height in Dubai storey
  notation (e.g. `2B+G+3P+35`) and parking, recomputed on every keystroke. Each figure links to the step
  that drives it.
- **Guided steps** — every page opens with what it does and closes with the next step.

| Step | What you get |
| --- | --- |
| 01 · Plot | Upload the affection plan (PDF / image). The parcel is detected by its DLD highlight colours and the scale from the dimension labels — polygon and calibration land with zero clicks. Trace ground / podium / tower footprints (several towers supported), zoom and pan for precision |
| 02 · Setup | Zone (Dubai / Abu Dhabi) with automatic market-class detection, plot area, target GFA, stratified floor breakdown (basements / ground / podium / type floors) and GFA split by use (residential, retail, commercial, hospitality) in m² or % |
| 03 · Distribution | Tower floors derived from the residential GFA and the tower floor plate (zoning cap optional); residential GFA split into apartments, amenities, circulation and services |
| 04 · Typologies | Apply the class unit mix in one click, per-typology mix %, balcony % and how much of each balcony counts as GFA (0 / 50 / 100 %), parking ratio per unit |
| 05 · Apartments | Units per floor, auto-filled from the apartments GFA and the unit mix (largest-remainder distribution) |
| 06 · Parking | Required spaces per typology, retail and other uses, POD (People of Determination) tiered rule, parking surface vs basements / ground / podium and the number of basements needed |
| 07 · 3D Massing | See below |
| 08 · Areas & ratios | GFA, GSA (sellable) and construction BUA derivations and efficiency ratios |
| 🔒 Class library | Reference matrix of UAE market classes (A · most luxurious → G · economical): zones, unit mix, unit areas, prices, floor heights and parking standard — editable |

### 3D massing

- Stratified model (basement / ground / podium / tower) with per-edge setbacks, street context, podium pool
  and lounge, street palms.
- **Tower design** — the tower is drawn as a Dubai residential tower, not a box. Four façade concepts:
  *Resort balconies* (wraparound balconies with glass balustrades), *Glass curtain wall* (floor-to-ceiling
  glazing with slim fins), *Vertical fins* (rippling full-height metal fins) and *Framed grid* (double-height
  architectural frame). Pick the glass tint (azure, aqua, grey, bronze) and the metal (white, champagne,
  bronze, graphite), and switch on rounded corners, a crown screen with a rooftop sky pool and lounge, a glazed
  lobby with an entrance canopy and a metal fin screen on the podium. The design is visual only — areas and
  ratios never change — and *Plain massing* brings back the simple tier volumes.
- **Three styles** — *Realistic* (sky, desert ground, the chosen glass and metal), *Model* (white
  architectural model) and *Diagram* (colour by tier, with legend).
- **Dubai sun & shadow study** — pick 21 Mar / Jun / Sep / Dec, scrub or play the day from sunrise to sunset;
  the sun position is computed for Dubai (±0.1°) and oriented by the plot's true-north bearing.
- **Aerial view** — orbit, pan and zoom freely; one click flies back to the aerial view. Turntable rotation.
- **Presentation mode** — full screen with the project title and headline figures, for client meetings.
- **Presentation image** — a 2× PNG of the current view with a branded title bar and key figures.

Projects are saved in the browser automatically; enable the optional [cloud sync](#cloud-sync-optional) to
share them with the whole team. A scripted promo of the product plays at **`/demo`** (all figures computed
from the demo scheme, 3D included) — record it with any screen recorder.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind — fully static export
- Calculations: pure TS modules in `lib/calc/`, covered by Vitest
- 3D: react-three-fiber + drei; façades are generated from the tier footprints (`components/tower-facade.tsx`,
  plan geometry in `lib/facade-geometry.ts`) and drawn with instancing
- Icons: lucide-react
- State: Zustand with `localStorage` persistence (+ optional Supabase cloud sync)

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
npm test         # calculation, plot-detection, façade-geometry and parity tests
```

## White-labelling / rebranding

1. `lib/brand.ts` — wordmark, descriptor, product name, tagline. It is the only place a product/company name
   lives in the code (sidebar, browser tab, presentation images, demo).
2. `tailwind.config.ts` — the `brand` colour scale (10 hex values) restyles every accent; `sand` is the warm
   secondary accent used by the sun study.
3. Logo mark: `components/shell/brand-mark.tsx` (app), `lib/branded-image.ts` (`MARK_SVG`, presentation images)
   and `app/icon.svg` (favicon).
4. The demo scheme lives in `lib/sample.ts` — replace it with a reference project of the client if they prefer.
5. For each client deployment set their own cloud project and, if wanted, their own Class Library password
   (below).

## Class Library access

The Class Library holds the shared price / unit-mix matrix and is reached from the padlock at the bottom of the
sidebar. To restrict it to an admin, set `NEXT_PUBLIC_LIBRARY_PASSWORD_SHA256` to the SHA-256 hex of the
password at build time (only the hash ships in the bundle):

```bash
printf '%s' 'your-admin-password' | shasum -a 256
```

Without that variable the padlock opens the library directly.

## Cloud sync (optional)

The app can sync projects to a shared Supabase database so every team member sees and edits the same set of
projects. The whole team enters with a **single password** that you choose — there are no individual user
accounts. Without these settings the app runs unchanged in local-only mode.

1. Create a Supabase project (free tier is enough). Note its `Project URL` and `anon public` key.
2. In the SQL editor, run:

   ```sql
   create table public.projects (
     id uuid primary key default gen_random_uuid(),
     name text not null default 'Untitled project',
     data jsonb not null default '{}'::jsonb,
     created_by uuid references auth.users(id) on delete set null,
     created_at timestamptz default now(),
     updated_by uuid references auth.users(id) on delete set null,
     updated_at timestamptz default now()
   );
   create index projects_updated_at_idx on public.projects (updated_at desc);

   alter table public.projects enable row level security;
   create policy "auth read"   on public.projects for select using (auth.role() = 'authenticated');
   create policy "auth insert" on public.projects for insert with check (auth.role() = 'authenticated');
   create policy "auth update" on public.projects for update using (auth.role() = 'authenticated');
   create policy "auth delete" on public.projects for delete using (auth.role() = 'authenticated');

   create function public.touch_updated_at() returns trigger language plpgsql as $$
   begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
   create trigger projects_touch before update on public.projects
   for each row execute function public.touch_updated_at();

   -- Edit locks: while someone has a project open, teammates see it read-only
   -- so nobody overwrites anyone's work. Locks expire on their own after 90 s
   -- without a heartbeat (crashed browser, closed laptop). If this table is
   -- missing the app still works — locking is just inactive.
   create table public.project_locks (
     project_id uuid primary key references public.projects(id) on delete cascade,
     device_id text not null,
     label text,
     locked_at timestamptz not null default now()
   );
   alter table public.project_locks enable row level security;
   create policy "auth read"   on public.project_locks for select using (auth.role() = 'authenticated');
   create policy "auth insert" on public.project_locks for insert with check (auth.role() = 'authenticated');
   create policy "auth update" on public.project_locks for update using (auth.role() = 'authenticated');
   create policy "auth delete" on public.project_locks for delete using (auth.role() = 'authenticated');
   ```

3. In **Authentication → Providers → Email**, enable email and turn **off** "Confirm email".
4. In **Authentication → Users → Add user → Create new user**, create the single shared team account:
   - Email: any address, e.g. `team@example.com` (it does not need to be a real inbox).
   - Password: the team password you'll hand out.
   - Tick **Auto Confirm User**.

   To rotate the password later, edit the same user and tell the team — old sessions end the next time they
   load the app.
5. Set the env vars (copy `.env.example` → `.env.local`, and add the same in Netlify → Site settings →
   Environment):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   NEXT_PUBLIC_SUPABASE_SHARED_EMAIL=team@example.com
   ```
6. Redeploy. The top bar gains a **Team password** input; once unlocked, every change to a cloud-tracked
   project auto-saves, and teammates see a project as read-only while someone else has it open.

## Deploy to Netlify

The app is a fully static export — no server needed.

1. In Netlify: **Add new site → Import from Git** → pick this repo and branch.
2. `netlify.toml` is read automatically (build `npm run build`, publish `out/`, Node 20).
3. Optional: add the cloud sync and Class Library variables above in Site settings → Environment.
4. Deploy.

## Adding new normatives

Standards live in `lib/standards/dubai.ts` and the market classes in `lib/zone-classes.ts`. Add new
jurisdictions as separate files and inject them via the active project.

## Disclaimer

Results are feasibility-level figures, not for construction. Verify against the current Dubai Municipality,
Dubai Civil Defence, RTA and Dubai Building Code requirements before committing to a scheme or submission.
