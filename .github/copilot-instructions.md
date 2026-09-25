# Copilot Instructions — Allocate (resource-dashboard)

## Architecture
This is **not** a localStorage app despite what older docs may say — it's a two-process
system:
- **`server/index.js`** (Express, port 3001): loads `Community Sheet.xlsx` into memory on
  startup via `server/workbook.js`, exposes a REST API (`/api/data`, `/api/optys`,
  `/api/resources`, `/api/allocations`, `/api/reset`), and writes every mutation straight
  back into the workbook file (preserving other sheets). A one-time `.backup.xlsx` is taken
  before the first write (`backupOnce`).
- **Vite dev server** (port 5173): serves the React SPA and proxies `/api/*` to port 3001
  (see `vite.config.js`). `src/db/db.js` is a thin `fetch` wrapper over that API — despite
  the folder name `db/`, there is no client-side database anymore.

**External-edit sync**: `server/index.js` watches the xlsx file with `fs.watch` and reloads
on external changes (e.g. someone edits the sheet directly in Excel), debounced and
mtime-verified to avoid reacting to its own writes (`suppressWatchUntil` window). The React
side polls `GET /api/data` every 5s (`AppContext.jsx`) so the UI reflects external edits
without a manual refresh — this polling is silent (doesn't toggle `loading`/`busy`) so it
never interrupts in-progress edits.

**Data model** (three relational tables, IDs cross-reference each other):
- `Opty` (`id`, `name`, `status`, `client`, `budget`, `start_date`, `end_date`)
- `Resources` (`id`, `name`, `role`, `email`, `max_hours`)
- `Allocation` (`id`, `opty_id`, `resource_id`, `hours_allocated`, `role_on_project`)

Deleting an Opty or Resource **cascades** to purge dependent Allocation rows — this logic
lives server-side in `workbook.js`/`index.js`, not in the React client.

## Key conventions
- **All mutations flow through `AppContext.jsx`'s `run(fn, successMsg, tone)` helper**: it
  sets `busy`, calls the mutation, calls `refresh()`, shows a toast, and catches errors into
  a warning toast. Follow this pattern for any new mutation rather than calling `db.js`
  functions directly from a page component.
- **IDs are generated server-side** via `makeId(prefix)` in `server/index.js`
  (`opty-<timestamp36><rand36>`), not client-side.
- Allocations enforce a hard business rule: total `hours_allocated` for a resource cannot
  exceed its `max_hours` — this validation/blocking happens in `Allocations.jsx` (live
  remaining-capacity math) and should be mirrored server-side if you add new write paths.
- Dashboard charts (Recharts) are **clickable and deep-link** into other pages by setting
  `pendingFilter` in `AppContext.jsx`, then the target page (`Opportunities.jsx`/
  `Resources.jsx`) reads and clears it on mount to pre-apply a filter.
- Styling is Tailwind utility classes only (see `tailwind.config.js`); no CSS modules or
  styled-components. Shared small UI atoms (badges, utilization bar, currency formatting,
  empty states) live in `src/components/ui.jsx` — reuse these instead of re-implementing.

## Developer workflows
- **Package manager: use `pnpm`**, not `npm`. The README documents a specific npm 11.6.0/Node
  25 bug (`Yallist is not a constructor`) that breaks `npm install` on this machine.
- Run both processes together: `pnpm dev` (uses `concurrently` to start
  `node server/index.js` + `vite --host` — see `package.json` scripts). Use `pnpm dev:api` /
  `pnpm dev:web` to run either process alone (e.g. when debugging the API independently).
- `pnpm restart` runs `restart.ps1` (PowerShell) — check this script if dev servers get into
  a bad state (stale locks on the xlsx file, orphaned node processes on Windows).
- Logs: `server.log`/`server.err.log` and `vite.log`/`vite.err.log` at the repo root capture
  output from the two processes — check these first when diagnosing a broken dev session.
- No test suite currently exists in this project.
- `pnpm build` → Vite production build to `dist/`; `pnpm preview` serves it. Note: the
  Express API server is a separate process not bundled by Vite — production deployment
  needs both running.

## Gotchas
- Editing `Community Sheet.xlsx` while the dev servers are running is supported (external
  edit detection), but avoid opening it in Excel *and* leaving it locked for writes, since
  the API server needs write access to persist mutations from the UI.
- `Community Sheet.backup.xlsx` is a one-time safety snapshot, not a rolling backup — don't
  rely on it for point-in-time recovery of later edits.
