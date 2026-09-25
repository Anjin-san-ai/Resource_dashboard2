# Allocate — Project & Resource Allocation Dashboard

A responsive single-page app for tracking project opportunities, staffing
resources, and their weekly allocations. Built with **React + Vite**, styled
with **Tailwind CSS**, iconography from **Lucide**, charts from **Recharts**,
and a relational **localStorage**-backed mock database.

## Features

- **Dashboard** — KPI cards (total budget, active projects, allocated staff,
  over-allocation count), a project-status pie chart, and a resource
  utilization bar chart. Both charts are clickable and deep-link into the
  Opportunities / Resources pages with a filter applied.
- **Opportunities** — searchable, filterable data table (status + budget
  range) with an add/edit modal and delete-safety dialogs.
- **Resources** — profile-card grid with color-coded utilization bars
  (🔴 over-allocated / 🟡 under-allocated / 🟢 balanced) and add/edit forms
  with email-uniqueness validation.
- **Allocations** — a project-to-staff matrix plus an assignment form that
  shows live remaining-capacity math and **blocks over-allocation** beyond a
  resource's `max_hours`.
- **Relational integrity** — deleting an Opportunity or Resource cascades to
  purge its Allocation rows (no orphans).
- **Persistence** — all state lives in `localStorage`, seeded on first run
  with 5 opportunities, 8 resources, and 10 allocations. "Reset demo data" in
  the sidebar restores the seed.

## Getting started

> **Package manager: use `pnpm`.** The globally installed `npm` on this
> machine (npm 11.6.0 on Node 25) has a bug — `Yallist is not a constructor` —
> that crashes dependency installation during the reify step. `pnpm` (available
> via the bundled `corepack`) installs cleanly and is what this project is set
> up for. See "Troubleshooting" below.

```bash
# from the resource-dashboard/ folder
pnpm install
pnpm dev        # dev server at http://localhost:5173
```

Other scripts:

```bash
pnpm build      # production build into dist/
pnpm preview    # preview the production build
```

## Project structure

```
src/
  db/
    seed.js            # default seed data + enums
    db.js              # localStorage CRUD + cascading deletes
  context/
    AppContext.jsx     # global state, mutations, derived selectors, toasts
  components/
    Sidebar.jsx        # responsive side navigation
    Modal.jsx          # accessible modal shell
    ConfirmDialog.jsx  # delete-safety dialog
    Toast.jsx          # transient notifications
    ui.jsx             # badges, utilization bar, currency, empty state
  pages/
    Dashboard.jsx      # KPIs + Recharts visualizations
    Opportunities.jsx  # data table + CRUD
    Resources.jsx      # profile cards + CRUD
    Allocations.jsx    # matrix + allocation engine
  App.jsx              # layout shell + state-based navigation
  main.jsx             # entry point
```

## Data model

Three relational "tables" persisted in `localStorage`:

- **Opty** (`id`, `name`, `status`, `client`, `budget`, `start_date`, `end_date`)
- **Resources** (`id`, `name`, `role`, `email`, `max_hours`)
- **Allocation** (`id`, `opty_id` → Opty, `resource_id` → Resources,
  `hours_allocated`, `role_on_project`)

## Troubleshooting

**`npm install` fails with `Yallist is not a constructor`.** This is a known
defect in npm 11.6.0 under Node 25. Use `pnpm` instead (this project is
configured for it). If you must use npm, upgrade it first (`npm 11.19.0+`
resolves the issue) — but upgrading npm itself may need to be done through
`corepack` or a Node reinstall since the broken npm can't reify packages.

**`ERR_PNPM_IGNORED_BUILDS: esbuild`.** Harmless. `esbuild`'s post-install
script is not required — its prebuilt platform binary resolves at runtime. The
build approval is recorded in `pnpm-workspace.yaml` (`onlyBuiltDependencies`).
