# Flowstate

Flowstate is a browser-based production-process simulation studio. It lets you draw a station flow, configure service and arrival rules, run a seeded discrete-event simulation, inspect bottlenecks, compare scenarios, and export a reproducible report.

## Included

- 2D process editor with undo/redo and direct connection mode
- 3D factory floor driven by recorded simulation state
- Station service times, parallel servers, queue limits, planned stops, and inspection rework
- Multiple product flows with independent arrival distributions and custom routes
- Seeded replications, KPIs, queue history, bottleneck analysis, and capacity experiments
- Local project library with version history, import/export, and offline standalone HTML build

## Run locally

Serve `dist` over HTTP so module workers can load:

```powershell
npx serve dist -l 4173
```

Then open `http://127.0.0.1:4173`.

To build a single-file offline copy:

```powershell
node build-offline.mjs Flowstate.html
```

## Verify

```powershell
node verify.mjs
```

The verification script covers deterministic reference runs, queues, downtime, rework, replications, custom product routes, branching, event playback, and invalid-model handling.

## Scope

This repository is a local-first prototype and MVP vertical slice. Authentication, server-side authorization, hosted persistence, background job infrastructure, billing, and production operations remain future SaaS work.
