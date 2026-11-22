import { useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FloorViewport } from './FloorViewport';

const nav = [
  ['workspaceNav', 'Studio', 'M3 6l9-4 9 4-9 5z M3 6v11l9 5 9-5V6 M12 11v11'],
  ['workplace', 'Workplace', 'M3 20V9l6 3V7l6 3V4h5l1 16z M6 16h2m3 0h2m3 0h2'],
  ['projects', 'Projects', 'M3 6h6l2 2h10v12H3z'],
  ['products', 'Products', 'M4 5h6v6H4z M14 5h6v6h-6z M9 15h6v6H9z'],
  ['workStudy', 'Work study', 'M5 5h14v16H5z M9 3h6v4H9z M8 11h8 M8 15h6'],
  ['experiments', 'Experiments', 'M8 3h8 M10 3v7l-6 9q0 2 2 2h12q2 0 2-2l-6-9V3 M7 15h10'],
];

function Navigation() {
  return (
    <header>
      <a className="brand" href="#studio" aria-label="Flowstate studio">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <rect width="36" height="36" rx="9" />
          <path d="M7 25l9-16h6l-9 16zm11 0 7-12h5l-7 12z" />
        </svg>
        Flowstate
      </a>
      <nav aria-label="Workspace">
        {nav.map(([id, label, icon]) => (
          <button key={id} id={id} className={id === 'workspaceNav' ? 'nav active' : 'nav'}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d={icon} /></svg>{label}
          </button>
        ))}
      </nav>
      <span className="save" id="save" role="status" />
    </header>
  );
}

function RunHeader() {
  return (
    <>
      <div className="titlebar">
        <div><h1 id="title" /><p id="category" /></div>
        <div className="actions">
          <button id="settings">Run setup</button>
          <button id="run" className="primary">▶ Run simulation</button>
        </div>
      </div>
      <div className="study-tools" aria-label="Study tools" role="group">
        <button id="qualityOpen">Quality lab</button>
        <button id="materials">Materials</button>
        <button id="walking">Walking routes</button>
        <button id="workers">Worker lab</button>
      </div>
      <section className="runstrip" aria-label="Run snapshot">
        <div className="runstate"><i id="runSignal" /><div><span>Run snapshot</span><strong id="runState" role="status" /></div></div>
        <div className="runfacts" id="runFacts" />
      </section>
    </>
  );
}

function ReplayTools() {
  return (
    <>
      <section id="supplyDeck" className="quality-deck" hidden>
        <div><small>Receiving</small><strong id="supplyReadout" /></div>
        <button id="reviewMaterials">Review lots</button>
      </section>
      <section id="qualityDeck" className="quality-deck" hidden>
        <div><small>Quality control</small><strong id="qualityStatus" /></div>
        <div><button id="nextFault">Replay next incident</button><button id="qualityReview">Review shift</button></div>
      </section>
      <div id="crewReplay" className="crew-replay" hidden>
        <label>Camera <select id="followWorker" aria-label="Follow worker" /></label>
        <button id="nextActivity">Next activity</button>
        <button id="markObservation">Start observation</button>
        <button id="workerChart">Worker chart</button>
      </div>
      <div className="transport">
        <button id="play" aria-label="Play or pause replay">▶</button>
        <button id="reviewEvents" className="review-events" disabled>Event review</button>
        <strong id="clock">00:00:00</strong>
        <input id="scrub" aria-label="Simulation time" type="range" min="0" max="3600" defaultValue="0" step="1" />
        <select id="speed" aria-label="Playback speed" defaultValue="60">
          {[1, 10, 60, 240].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </div>
    </>
  );
}

function Workspace({ floor }) {
  const view = useSyncExternalStore(floor.subscribeView, floor.getView);
  const reduced = useReducedMotion();
  const transition = { duration: reduced ? 0 : 0.19, ease: [0.2, 0.72, 0.24, 1] };
  return (
    <section className="workspace" aria-label="Process workspace">
      <div className="modelpane">
        <div className="panelhead">
          <div className="switch" role="group" aria-label="Model view">
            <button id="view3d" aria-controls="stage" aria-pressed={view === '3d'}>3D floor</button>
            <button id="view2d" aria-controls="two" aria-pressed={view === '2d'}>2D editor</button>
          </div>
          <div className="model-tools">
            <button id="undo" aria-label="Undo" title="Undo">↶</button>
            <button id="redo" aria-label="Redo" title="Redo">↷</button>
            <button id="link" aria-pressed="false">Connect</button>
            <button id="add">+ Station</button>
          </div>
        </div>
        <div className="stage" id="stage">
          <div className="stage-toolbar">
            <div className="stagetitle"><i /><span id="stageStatus">Factory floor</span></div>
            <select id="floorLayer" aria-label="Floor analysis layer" defaultValue="live">
              <option value="live">Live equipment</option>
              <option value="load">Station utilization</option>
              <option value="Present">Present study route</option>
              <option value="Proposed">Proposed study route</option>
            </select>
            <button id="expandFloor" aria-pressed="false">Expand floor</button>
            <div className="camera-tools">
              <button id="focusStation" className="focusstation">Station close-up</button>
              <button id="fit" className="fit">Reset view</button>
            </div>
          </div>
          <div className="floor-body">
            {view === '3d' && (
              <motion.div className="floor-surface" initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }} transition={transition}>
                <FloorViewport floor={floor} />
              </motion.div>
            )}
            <div id="observerHud" hidden>
              <strong id="observerTitle" /><span id="observerTask" />
              <progress id="observerProgress" max="1" value="0" aria-label="Activity progress" />
            </div>
          </div>
        </div>
        <motion.div className="scroll" id="two" hidden initial={false}
          animate={{ opacity: view === '2d' ? 1 : 0 }} transition={transition}>
          <svg id="graph" viewBox="0 0 820 365" role="group" aria-label="Process canvas. Select a station to edit it." />
        </motion.div>
        <ReplayTools />
        <div className="canvasfoot">
          <div className="modelmeta">
            <span><i /><span id="count" /></span>
            <div id="productLegend" className="product-legend" aria-label="Product flows" />
          </div>
          <button id="checks">Check model</button>
        </div>
      </div>
      <aside>
        <div className="panelhead"><h2>Station inspector</h2></div>
        <div className="stationpick">
          <label htmlFor="stationPick">Selected station</label><select id="stationPick" />
        </div>
        <div id="inspect" />
        <button id="measure">Measure station time →</button>
      </aside>
    </section>
  );
}

export function Studio({ floor, mountStudio }) {
  return (
    <>
      <a href="#studio" className="skip-link">Skip to simulation</a>
      <Navigation />
      <main id="studio" tabIndex={-1} ref={mountStudio}>
        <RunHeader />
        <Workspace floor={floor} />
        <section className="analysis" aria-labelledby="results-title">
          <div className="reporttitle">
            <h2 id="results-title">Run results</h2>
            <div className="reportactions"><span id="windowNote" /><button id="report">Export report</button></div>
          </div>
          <div className="metrics" id="metrics" />
          <div id="details" className="resultpanel" tabIndex={0} aria-label="Detailed run results" />
        </section>
        <details className="ideal"><summary>Ideal line capacity</summary><div className="metrics" id="idealMetrics" /></details>
        <div id="notice" role="status" aria-live="polite" />
        <dialog id="dialog" aria-labelledby="dialogtitle">
          <div className="dialoghead"><h2 id="dialogtitle" /><button id="close" aria-label="Close">×</button></div>
          <div id="dialogbody" />
        </dialog>
      </main>
    </>
  );
}
