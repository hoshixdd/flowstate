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

The 3D floor opens by default. Its layer selector shows event playback, station utilization, or saved Present and Proposed flow routes. Capture a run in Work study to record its settings and outputs with a method. Use simulation data to trace one completed product, inspect station cycle times, or sample simulated equipment occupancy. Worker, form and reference-data worksheets retain simulation context while leaving real observations to the analyst. Apply a measured time to rerun the model, then capture the other method and compare throughput. In-progress worksheets have local draft recovery.

## Staffed factory observation

Open **Worker lab → Open staffed packing factory**. Follow a worker and expand the floor. Start an observation during replay, then use **Finish and chart → Use simulation data** to populate a worker process chart for that interval. Each task needs a free station server and one shared worker. Travel follows a common aisle at the configured speed, and planned stops hold the assigned worker. Workers share all manual tasks. The starter dimensions, times and staffing are illustrative. The Worker lab compares hands-on, walking and idle/wait time across the observation window. Capture Present and Proposed runs to compare staffing changes.

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

## Factory quality study

Open **Quality lab** or use `Flowstate.html#quality-factory`. The seven-station packing line starts with five shared workers. Forming, filling and sealing independently introduce faults when service finishes. The gate tests each faulty carton once, with one detection probability covering all its fault modes. Detected cartons take a worker and bench time. A successful repair clears all faults, a failed repair scraps the carton, and an undetected faulty carton ships. Station buffer rejections are separate. The demo assumes no false inspection alarms, independent source faults, and empty starting inventory.

Use **Review shift** for fault counts by source, carton history and replay. Source bars count occurrences. First-pass quality counts unique conforming cartons divided by all cartons first inspected, using the simulated true condition. The reported counts use the observation window for each event independently. Work crossing the window can affect totals. The CSV contains quality events in that window, while tracing a selected carton includes its earlier history.

In **Workplace data**, enter source-level sample counts for each defect, inspection sensitivity and successful repair percentage. Set measured station times, shift duration, arrivals, floor scale and staffing in the studio. Enter good output from a comparable independent shift to check the simulated baseline. **Test a change** compares the current model with one proposed rate over 2–30 matched seeds. The interval is a paired Student t interval across simulated shifts. Counts and intervals reflect the model assumptions. Verify causal hypotheses and actual savings with a workplace trial.

Methods: [ASQ check sheets](https://asq.org/quality-resources/check-sheet), [ASQ Pareto analysis](https://asq.org/quality-resources/pareto), [NIST fraction nonconforming](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm), [NIST on credibility of manufacturing digital twins](https://www.nist.gov/publications/credibility-consideration-digital-twins-manufacturing).

## Worker assignment study

Open **Worker lab → Open crew assignment example** or `Flowstate.html#staffing-study`. The example has two workers and three manual stations. The packing operator prepares and fills cartons and the inspector inspects and seals them. In Worker lab, add **Fill cartons** to Worker 2 and apply staffing. Reopen Worker lab to compare completed units and each station’s mean queue for the same shift. With the starter layout and one-hour run, output rises from 28 to 58 cartons, and the inspection queue grows. These are simulated counts for this layout.

Turn on **Assign workers by station** in any factory to create its own roster. A checked station qualifies the worker to perform that service. The dispatcher takes the oldest ready job with a free qualified worker and a free server, breaking worker ties by roster order. A station with no qualified worker accumulates waiting work up to its buffer limit. Existing shared crews retain their original dispatch behavior. Roles apply for the entire run.

## Measured walking routes

Open **Walking routes → Open packing aisle example** or `Flowstate.html#walking-study`. The preparation-to-filling trip starts at a measured 22 m. Choose **Straight path** for a hypothetical direct aisle, enter 8 m if that is the measured proposed distance, then **Apply route and run**. Reopen Walking routes to compare output, walking time and distance for the same shift. Use the map or metre coordinates to enter bends around equipment. The route applies in both directions. Unspecified station pairs follow the original shared aisle. An entered trip distance controls simulation time, while the drawn path controls replay geometry. Confirm walkability on site. Re-measure a tape distance after moving an endpoint.

## Material supply and lot tracing

Open **Materials → Open carton supply example** or `Flowstate.html#materials-study`. Receiving issues one carton blank to each order in FIFO order. A delivery at second 0 sets opening stock. Deliveries precede orders at the same timestamp, and simultaneous lots are consumed in schedule row order. Orders wait before entering production if stock is empty. One consumed unit stays linked to its order through inspection, rework, shipment, scrap or buffer rejection. This version models one shared input material and scheduled deliveries.

The example supplies 30 blanks at opening and 150 more at 1,800 seconds. Compare that with the same second lot at 600 seconds. The run starts empty and lasts one hour. **Review lots** shows the full-run balance by supplier lot, the disposition of each order, a trace CSV, and simulated shortage time. Shortage is elapsed time with at least one order awaiting material. Order-minutes sum the wait across all such orders. Neither measures machine downtime. Both time metrics are clipped to the observation window. Orders still awaiting material are reported separately from work in progress on the line.

## Workplace studies

Open **Workplace** from Studio to build a process or load a bakery, print-finishing shop or laundry. Insert equipment between two stations, specify seconds per job and parallel capacity, and select staffed or unattended operation. Each job represents one tray, print job or linen load. Parallel capacity represents independent service places. It does not synchronize multiple jobs into a batch.

In **Fault rules**, choose an observable defect, its source, the operating condition, and the normal and exposed probabilities. Exposure is evaluated when service starts. Quality events are counted when service finishes. Conditions include a high/low station setting, pre-service delay, a recent restart, and the first starts from a material lot. Estimate the two probabilities separately from your own counts of faulty units and units checked under each condition.

**Maintenance** simulates station-wide breakdowns with a seeded Weibull failure age (shape 2), fixed repair times and optional preventive replacement. Age advances during online time, including idle time. Service pauses during downtime and resumes with the remaining work. **Shift review** shows exposed and unexposed counts, equipment stops and the previous run when you apply a change. Each comparison uses the primary run at the configured seed. Use additional replications and workplace observations before estimating real savings.

Examples open directly at `#bakery-study`, `#print-study` and `#laundry-study`. The examples use illustrative times, settings and fault probabilities.

