# Dubai Residential Plot Analysis

**Feasibility studies for residential plots in Dubai and Abu Dhabi — in minutes, not weeks.**

A web platform for developers, investment teams and architects: read the plot from the DLD affection plan,
split the GFA by use, get the unit mix for the zone's market class, fill the apartments floor by floor, size
parking and lifts, see the massing in 3D and print a one-page areas & ratios report.

Ships with the neutral **PLOTIQ** brand and is built to be white-labelled per client in one file (see
[White-labelling](#white-labelling--rebranding)).

## What it does

| Tab | What you get |
| --- | --- |
| 00 · Plot | Upload the affection plan (PDF / image). The parcel is detected by its DLD highlight colours and the scale from the dimension labels — polygon and calibration land with zero clicks. Trace ground / podium / tower footprints (several towers supported), zoom and pan for precision |
| 01 · Setup | Zone (Dubai / Abu Dhabi) with automatic market-class detection, plot area, target GFA, stratified floor breakdown (basements / ground / podium / type floors) and GFA breakdown by use (residential, retail, commercial, hospitality) in m² or % |
| 02 · Distribution | Tower floors derived from the residential GFA and the tower footprint (zoning cap optional); residential GFA split into apartments, amenities, circulation and services |
| 03 · Typologies | Apply the class unit mix in one click, per-typology mix %, balcony % and how much of each balcony counts as GFA (0 / 50 / 100 %), Dubai DCD occupancy defaults |
| 04 · Apartments | Units per floor, auto-filled from the apartments GFA and the unit mix (largest-remainder distribution) |
| 05 · Parking | Required spaces per typology, retail and other uses, POD (People of Determination) tiered rule, parking surface vs basements / ground / podium and the number of basements needed |
| 06 · Lifts | Dubai Building Code D.8.8 |
| 07 · Massing | Stratified 3D model (basement / ground / podium / tower) with per-edge setbacks, street context, parametric façade, podium roof amenities, AI render (Gemini) and a first-person immersive walk |
| 08 · Areas Summary | GFA, GSA (sellable) and construction BUA derivations and efficiency ratios |
| 🔒 Class Library | Reference matrix of UAE market classes (A · most luxurious → G · economical): zones, unit mix, unit areas, prices, floor heights and parking standard — editable |

**Report PDF** in the header produces a one-page areas & ratios summary ready to share.

Projects are saved in the browser automatically; enable the optional [cloud sync](#cloud-sync-optional) to
share them with the whole team.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind — fully static export
- Calculations: pure TS modules in `lib/calc/`, covered by Vitest
- 3D: react-three-fiber + drei + postprocessing
- State: Zustand with `localStorage` persistence (+ optional Supabase cloud sync)
- Optional AI renders: Google Gemini (each user enters their own API key in the UI)

## Scripts

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
npm test         # calculation, plot-detection and parity tests
```

## White-labelling / rebranding

1. `lib/brand.ts` — wordmark, descriptor, product name, tagline. It is the only place a product/company name
   lives in the code (header, browser tab, report footer, demo).
2. `tailwind.config.ts` — the `brand` colour scale. Swap the 10 hex values to restyle every accent.
3. Optional: the logo mark is inline SVG in `components/header-bar.tsx`, the favicon is `app/icon.svg`.
4. For each client deployment set their own cloud project and, if wanted, their own Class Library password
   (below).

## Class Library access

The Class Library holds the shared price / unit-mix matrix and is hidden behind the padlock at the right of the
tab bar. To restrict it to an admin, set `NEXT_PUBLIC_LIBRARY_PASSWORD_SHA256` to the SHA-256 hex of the
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
6. Redeploy. The header gains a **Team password** input; once unlocked, every change to a cloud-tracked
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
