import { pathLength, workerPath } from '../dist/engine.mjs';

export const colors = {
  source: '#71d7a9', processor: '#8bbaef', queue: '#c1adeb',
  inspection: '#f1c381', sink: '#8fdec8', active: '#a9edb2',
  fault: '#f18c76', stopped: '#ff947d', idle: '#9bafc3',
};

const qualityLabels = {
  fault: 'Fault introduced', detected: 'Defect detected', repair: 'Repaired',
  scrap: 'Scrapped', escape: 'Shipped faulty',
};
const eventsByRun = new WeakMap();

// A replay frame shows the final state after all events at the same instant.
export function firstPeakQueue(track, from, until) {
  let peak = null;
  for (let index = 0; index < track.length; index++) {
    const { time, waiting } = track[index];
    if (time > until) break;
    const nextTime = track[index + 1]?.time;
    if (nextTime === time || nextTime <= from) continue;
    if (waiting > (peak?.waiting ?? 0)) {
      peak = { time: Math.max(from, time), waiting };
    }
  }
  return peak;
}

function lastAt(events, time, field) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle][field] <= time) low = middle + 1;
    else high = middle;
  }
  return events[low - 1];
}

function qualityEvents(run) {
  if (!run?.qualityTrace) return new Map();
  if (eventsByRun.has(run)) return eventsByRun.get(run);
  const byStation = new Map();
  for (const event of run.qualityTrace) {
    if (!Object.hasOwn(qualityLabels, event.kind)) continue;
    if (!byStation.has(event.stationId)) byStation.set(event.stationId, []);
    byStation.get(event.stationId).push(event);
  }
  eventsByRun.set(run, byStation);
  return byStation;
}

function workerPosition(model, worker, lookup, time) {
  const interval = lastAt(worker.intervals, time, 'start');
  const from = lookup.get(interval?.from);
  const to = lookup.get(interval?.to);
  if (!from || !to) return null;
  const walking = interval.kind === 'Walking';
  const path = workerPath(model, from.node, to.node);
  const progress = walking ? Math.min(1, (time - interval.start) / Math.max(0.001, interval.end - interval.start)) : 0;
  let distance = progress * pathLength(path);
  let [x, z] = walking ? path[0] : path.at(-1);
  let heading = 0;
  for (let i = 1; walking && i < path.length; i += 1) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const length = Math.hypot(bx - ax, bz - az);
    if (!length) continue;
    const step = Math.min(1, distance / length);
    x = ax + (bx - ax) * step;
    z = az + (bz - az) * step;
    heading = Math.atan2(bx - ax, bz - az);
    distance -= length;
    if (distance <= 0) break;
  }
  return {
    id: worker.id, x: x + ((worker.id - 1) % 4) * 0.29, z: z + Math.floor((worker.id - 1) / 4) * 0.28,
    heading, path: walking ? path : [], activity: interval.kind, role: worker.role,
  };
}

function studySegments(rows) {
  const point = (row) => {
    if (!row || [row.x, row.y].some((value) => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)))) return null;
    return [Number(row.x) / 36, Number(row.y) / 30];
  };
  return (rows ?? []).slice(1).flatMap((row, index) => {
    const a = point(rows[index]);
    const b = point(row);
    return a && b ? [[a, b]] : [];
  });
}

export function floorModel({ model, frame, layer, run, clock }) {
  const signals = qualityEvents(run);
  const utilization = new Map(run?.rows?.map((row) => [row.id, row.util]));
  const stations = model.nodes.map((node, index) => {
    const state = frame[node.id] ?? {};
    const event = lastAt(signals.get(node.id) ?? [], clock, 'time');
    const quality = event && clock - event.time < 9 ? qualityLabels[event.kind] : '';
    const load = layer === 'load' ? utilization.get(node.id) : undefined;
    const busy = state.busy > 0;
    const detail = load != null ? `${Math.round(load * 100)}% utilized`
      : quality || (state.paused ? state.stopReason || 'Stopped'
        : state.waiting ? `${state.waiting} waiting` : busy ? 'In service'
          : node.type === 'sink' ? `${state.completed ?? 0} completed` : 'Ready');
    const color = load != null ? (load >= 0.9 ? colors.fault : load >= 0.65 ? colors.inspection : colors.processor)
      : quality || state.paused ? colors.stopped : busy ? colors.active : colors[node.type];
    return { node, index, x: node.x / 36, z: node.y / 30, state, color, detail };
  });
  const lookup = new Map(stations.map((station) => [station.node.id, station]));
  const links = model.edges.flatMap(([from, to]) => {
    const a = lookup.get(from);
    const b = lookup.get(to);
    return a && b ? [{ a, b }] : [];
  });
  const routes = studySegments(model.workStudy?.[layer]?.layout?.rows);
  const workers = (run?.workers ?? []).map((worker) => workerPosition(model, worker, lookup, clock)).filter(Boolean);
  const points = [
    ...stations.map(({ x, z }) => [x, z]),
    ...routes.flat(),
    ...(model.walkingRoutes ?? []).flatMap((route) => route.via ?? []),
  ];
  if (!points.length) points.push([0, 0]);
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const left = Math.min(...xs) - 3.1;
  const right = Math.max(...xs) + 3.1;
  const top = Math.min(...zs) - 2.8;
  const bottom = Math.max(...zs) + (workers.length || model.crew ? 4.8 : 3.1);
  return {
    stations, lookup, links, routes, workers, routeColor: layer === 'Present' ? '#75dafa' : '#ffbf7a',
    bounds: { left, right, top, bottom, x: (left + right) / 2, z: (top + bottom) / 2, width: right - left, depth: bottom - top },
  };
}
