# Flowstate

Flowstate is a browser-based production-process simulation studio. It lets you draw a station flow, configure service and arrival rules, run a seeded discrete-event simulation, inspect bottlenecks, compare scenarios, and export a reproducible report.

## Included

- 2D process editor with undo/redo and direct connection mode
- 3D factory floor driven by recorded simulation state
- Station service times, parallel servers, queue limits, planned stops, and inspection rework
- Multiple product flows with independent arrival distributions and custom routes
- Seeded replications, KPIs, queue history, bottleneck analysis, and capacity experiments
- Local project library with version history, import/export, and offline standalone HTML build

## Work study lab

Open **Work study** from the studio navigation. Choose Present or Proposed and a worksheet. Save study stores the worksheets inside the active model so project export, version history and undo include them. Print study report opens a printable summary.

The lab includes operations charts, material/worker/form process charts, scaled floor routes, stopwatch observations, work sampling, reference-based motion and standard data, and productivity. Use **Apply standard time and save** to set a processor or inspection station's mean service time. Rerun the simulation to see the effect. Manual and automatic time are sequential in the timing worksheet. Provide your own reference motion times, inputs and layout scale.

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
