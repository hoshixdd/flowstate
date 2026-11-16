// Authoritative discrete-event engine for Flowstate.
// Event priority is: releases/resumes, transfers/completions, then arrivals.
const VERSION = 'flowstate-des-2.3';

function randomStream(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let x = Math.imul(value ^ (value >>> 15), value | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function hashText(value) {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function sample(mean, distribution, random) {
  if (distribution === 'exponential') return Math.max(1e-8, -Math.log1p(-random()) * mean);
  if (distribution === 'uniform') return mean * (0.75 + 0.5 * random());
  return mean;
}
class EventHeap {
  constructor() { this.items = []; this.serial = 0; }
  before(a, b) { return a.time < b.time || (a.time === b.time && (a.rank < b.rank || (a.rank === b.rank && a.serial < b.serial))); }
  push(item) {
    item.serial = this.serial++;
    const heap = this.items;
    let i = heap.length;
    heap.push(item);
    while (i) {
      const parent = (i - 1) >> 1;
      if (!this.before(item, heap[parent])) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = item;
  }
  pop() {
    const heap = this.items, first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && this.before(heap[child + 1], heap[child])) child++;
        if (!this.before(heap[child], last)) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  }
}
function normalizeConfig(input = {}) {
  const c = { horizon: 3600, warmup: 0, seed: 42, reps: 1, ...input };
  if (!Number.isFinite(c.horizon) || c.horizon <= 0 || c.horizon > 604800) throw Error('Run duration must be positive and at most seven days.');
  if (!Number.isFinite(c.warmup) || c.warmup < 0 || c.warmup >= c.horizon) throw Error('Warm-up must be shorter than the run.');
  if (!Number.isInteger(c.seed) || c.seed < 0 || c.seed > 4294967295 || !Number.isInteger(c.reps) || c.reps < 1 || c.reps > 30) throw Error('Choose 1–30 replications and a whole-number seed from 0 to 4294967295.');
  return c;
}
function mainRouteIds(model) {
  const outgoing = new Map();
  for (const edge of model.edges ?? []) if (!outgoing.has(edge[0])) outgoing.set(edge[0], edge[1]);
  const source = model.nodes?.find(n => n.type === 'source');
  const route = [], seen = new Set();
  let id = source ? outgoing.get(source.id) : null;
  while (id && !seen.has(id)) { route.push(id); seen.add(id); id = outgoing.get(id); }
  return route;
}
function normalizeProducts(model) {
  const source = model.nodes?.find(n => n.type === 'source');
  const fallback = { id: 'unit', name: 'Unit', color: '#d8fc81', interval: source?.seconds ?? 30, distribution: source?.distribution ?? 'fixed', route: [] };
  const raw = Array.isArray(model.products) && model.products.length ? model.products : [fallback];
  return raw.map((p, index) => ({
    id: String(p.id ?? ('product-' + (index + 1))),
    name: String(p.name ?? ('Product ' + (index + 1))),
    color: String(p.color ?? '#d8fc81'),
    interval: p.interval == null ? fallback.interval : Number(p.interval),
    distribution: p.distribution ?? fallback.distribution,
    route: Array.isArray(p.route) ? p.route.slice() : []
  }));
}
function validateModel(model) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges) || !model.nodes.length || model.nodes.length > 100 || model.edges.length > 300) return ['Use 1–100 stations and at most 300 connections.'];
  const issues = [], nodes = new Map(), outgoing = new Map(), incoming = new Map(), sources = [], sinks = [];
  if(model.crew && (!Number.isInteger(model.crew.count)||model.crew.count<1||model.crew.count>16||!Number.isFinite(model.crew.speed)||model.crew.speed<.1||model.crew.speed>4||!Number.isFinite(model.crew.scale)||model.crew.scale<=0||model.crew.scale>100))issues.push('Choose 1–16 workers, walking speed 0.1–4 m/s and a valid floor scale.');
  for (const n of model.nodes) {
    if (!n || typeof n.id !== 'string' || !/^[\w-]{1,80}$/.test(n.id) || nodes.has(n.id) || ['__proto__', 'constructor', 'prototype'].includes(n.id) || !Object.hasOwn({ source: 1, sink: 1, processor: 1, inspection: 1, queue: 1 }, n.type) || typeof n.name !== 'string' || !n.name.trim() || n.name.length > 80 || !Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000) return ['A station has an invalid ID, name, type or position.'];
    nodes.set(n.id, n); outgoing.set(n.id, []); incoming.set(n.id, []);
    if (n.type === 'source') sources.push(n);
    if (n.type === 'sink') sinks.push(n);
    if (['source', 'processor', 'inspection'].includes(n.type) && (!(n.seconds > 0) || !Number.isFinite(n.seconds) || n.seconds > 604800)) issues.push(n.name + ' needs a valid positive time.');
    if (n.distribution && !['fixed', 'uniform', 'exponential'].includes(n.distribution)) issues.push(n.name + ' has an unknown distribution.');
    if (n.servers != null && (!Number.isInteger(n.servers) || n.servers < 1 || n.servers > 64)) issues.push(n.name + ' needs 1–64 servers.');
    if (n.limit != null && (!Number.isInteger(n.limit) || n.limit < 0 || n.limit > 100000)) issues.push(n.name + ' has an invalid waiting limit.');
    if (n.hourly != null && (!Number.isFinite(n.hourly) || n.hourly < 0 || n.hourly > 1e7)) issues.push(n.name + ' has an invalid hourly cost.');
    if (n.pauseLength != null && (!Number.isFinite(n.pauseLength) || n.pauseLength < 0 || n.pauseLength > 604800 || !Number.isFinite(n.pauseStart) || n.pauseStart < 0 || n.pauseStart > 604800)) issues.push(n.name + ' has invalid downtime settings.');
    if (n.rework != null && (!Number.isFinite(n.rework) || n.rework < 0 || n.rework > 100)) issues.push(n.name + ' has an invalid rework percentage.');
  }
  for (const edge of model.edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || !nodes.has(edge[0]) || !nodes.has(edge[1]) || edge[0] === edge[1]) return ['A connection has a missing or invalid endpoint.'];
    outgoing.get(edge[0]).push(edge[1]); incoming.get(edge[1]).push(edge[0]);
  }
  if (sources.length !== 1 || sinks.length !== 1) issues.push('Use one source and one sink.');
  for (const n of nodes.values()) {
    const next = outgoing.get(n.id);
    if (n.type === 'sink' && next.length) issues.push('The sink cannot feed another station.');
    if (n.type !== 'sink' && !next.length) issues.push('Choose at least one destination for ' + n.name + '.');
    if (n.type === 'queue' && next.some(id => !['processor', 'inspection'].includes(nodes.get(id)?.type))) issues.push(n.name + ' must feed a processor or inspection station.');
    if (n.type === 'inspection' && n.rework > 0 && !['processor', 'inspection'].includes(nodes.get(n.reworkTo)?.type)) issues.push('Choose a rework station for ' + n.name + '.');
  }
  const visiting = new Set(), reachable = new Set();
  function visit(id) {
    if (!id) return;
    if (visiting.has(id)) { issues.push('The main routes contain a cycle. Use inspection rework for a controlled return.'); return; }
    if (reachable.has(id)) return;
    visiting.add(id); reachable.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next);
    visiting.delete(id);
  }
  visit(sources[0]?.id);
  if (reachable.size !== nodes.size) issues.push('Connect every station to the source route.');
  const canReachSink = new Set([sinks[0]?.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes.values()) if (!canReachSink.has(n.id) && outgoing.get(n.id).some(id => canReachSink.has(id))) { canReachSink.add(n.id); changed = true; }
  }
  if (sinks.length && canReachSink.size !== nodes.size) issues.push('Every route must reach the sink.');
  const products = normalizeProducts(model), ids = new Set();
  for (const p of products) {
    if (ids.has(p.id) || !/^[\w-]{1,80}$/.test(p.id)) issues.push('Product IDs must be unique and use letters, numbers, _ or -.');
    ids.add(p.id);
    if (!p.name.trim() || p.name.length > 80) issues.push('Give every product a name up to 80 characters.');
    if (!/^#[0-9a-f]{6}$/i.test(p.color)) issues.push(p.name + ' needs a six-digit playback color.');
    if (!Number.isFinite(p.interval) || p.interval <= 0 || p.interval > 604800) issues.push(p.name + ' needs a positive arrival interval.');
    if (!['fixed', 'uniform', 'exponential'].includes(p.distribution)) issues.push(p.name + ' has an unknown arrival distribution.');
    if (!Array.isArray(p.route) || (p.route.length > 0 && p.route[p.route.length - 1] !== sinks[0]?.id)) issues.push(p.name + ' must end at the sink or follow the main route.');
    const seen = new Set();
    for (const id of p.route) {
      if (!nodes.has(id) || id === sources[0]?.id || seen.has(id)) issues.push(p.name + ' has an invalid or repeated route station.');
      seen.add(id);
    }
    if (p.route.length && !p.route.some(id => ['processor', 'inspection'].includes(nodes.get(id)?.type))) issues.push(p.name + ' needs at least one processing station.');
  }
  if (model.quality) {
    const q = model.quality, percent = v => Number.isFinite(v) && v >= 0 && v <= 100;
    if (nodes.get(q.gate)?.type !== 'inspection' || nodes.get(q.repair)?.type !== 'processor' ||
        !percent(q.detection) || !percent(q.recovery) || !Array.isArray(q.modes) || !q.modes.length || q.modes.length > 20 ||
        q.modes.some(m => !m || !/^[a-z][\w-]{0,39}$/.test(m.id) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80 ||
          nodes.get(m.station)?.type !== 'processor' || !percent(m.rate)) || new Set(q.modes.map(m=>m.id)).size !== q.modes.length) {
      issues.push('Invalid quality setup. Check fault sources, inspection gate, repair bench and percentages.');
    } else if (products.some(p => {
      const route = p.route.length ? p.route : mainRouteIds(model), gate = route.indexOf(q.gate);
      return gate < 0 || route.includes(q.repair) || !outgoing.get(q.repair).includes(route[gate+1]) ||
        q.modes.some(m => route.indexOf(m.station) < 0 || route.indexOf(m.station) >= gate);
    }) || model.nodes.some(n=>n.type==='inspection' && n.rework>0) || !outgoing.get(q.gate).includes(q.repair)) {
      issues.push('Invalid quality route. All products must pass fault sources before the gate. Connect the gate to the separate repair bench and disable other inspection returns.');
    }
  }
  return issues;
}
function workerPath(model,from,to){
  const a=[from.x/36,from.y/30+1.16],b=[to.x/36,to.y/30+1.16];
  const aisle=Math.max(...model.nodes.map(n=>n.y/30))+2.9;
  return from.id===to.id?[a,b]:[a,[a[0],aisle],[b[0],aisle],b];
}
function simulateRun(model, settings, record = true) {
  const config = normalizeConfig(settings), issues = validateModel(model);
  if (issues.length) throw Error(issues.join(' '));
  const { horizon, warmup, seed } = config, window = horizon - warmup;
  const nodes = new Map(model.nodes.map(n => [n.id, n])), source = model.nodes.find(n => n.type === 'source'), sink = model.nodes.find(n => n.type === 'sink');
  const mainRoute = mainRouteIds(model), products = normalizeProducts(model).map((p, index) => ({ ...p, route: p.route.length ? p.route : mainRoute.slice(), index }));
  const stations = model.nodes.filter(n => ['processor', 'inspection'].includes(n.type));
  const rng = new Map(model.nodes.map((n, i) => [n.id, randomStream(seed + Math.imul(i + 1, 2654435761))]));
  const arrivalRng = products.map((p, i) => [p.id, products.length === 1 ? rng.get(source.id) : randomStream((seed ^ hashText(p.id) ^ Math.imul(i + 1, 2246822519)) >>> 0)]);
  const queueBefore = new Map();
  const q = model.quality;
  const quality = q ? {inspected:0, firstGood:0, detected:0, repaired:0, scrapped:0, escaped:0, goodShipped:0,
    counts:q.modes.map(m=>({id:m.id,name:m.name,station:m.station,faults:0,opportunities:0}))} : null;
  const qualityTrace=[];
  let totalScrap=0;
  // Key each quality draw to its carton so prevention trials retain matched exposure.
  const occurs=(job,key,rate)=>randomStream((seed ^ hashText(job.id+'|'+key))>>>0)()*100 < rate;
  function qualityEvent(kind,t,stationId,job,mode){
    if(record)qualityTrace.push({kind,time:t,stationId,jobId:job.id,mode});
  }
  function finishQualityStep(n,job,t){
    const observed=t>=warmup;
    for(const [i,mode] of q.modes.entries()){
      if(mode.station!==n.id)continue;
      if(observed)quality.counts[i].opportunities++;
      if(occurs(job,mode.id,mode.rate)){
        (job.faults??=[]).push(mode.id);
        if(observed)quality.counts[i].faults++;
        qualityEvent('fault',t,n.id,job,mode.id);
      }
    }
    if(n.id===q.gate){
      if(observed){quality.inspected++;if(!job.faults?.length)quality.firstGood++;}
      if(job.faults?.length && occurs(job,'gate-detection',q.detection)){
        if(observed)quality.detected++;
        reworked++;productStats.get(job.productId).reworked++;
        qualityEvent('detected',t,n.id,job,job.faults.join(','));
        job.route.splice(job.position+1,0,q.repair);
      }
    }
    if(n.id===q.repair){
      const recovered=occurs(job,'repair-recovery',q.recovery);
      if(observed)quality[recovered?'repaired':'scrapped']++;
      qualityEvent(recovered?'repair':'scrap',t,n.id,job,job.faults.join(','));
      if(!recovered){totalScrap++;return false;}
      job.faults=[];
    }
    return true;
  }
  for (const p of products) for (let i = 1; i < p.route.length; i++) if (nodes.get(p.route[i - 1])?.type === 'queue') queueBefore.set(p.route[i], nodes.get(p.route[i - 1]));
  const stats = new Map(stations.map(n => [n.id, { id: n.id, name: n.name, capacity: n.servers ?? 1, queue: [], head: 0, busy: 0, active: new Map(), last: 0, busyArea: 0, queueArea: 0, peak: 0, waitTotal: 0, starts: 0, finished: 0, drops: 0 }]));
  const tracks = Object.fromEntries(model.nodes.map(n => [n.id, []])), heap = new EventHeap(), eventLog = [], EVENT_LOG_LIMIT = 50000;
  let jobs = 0, finished = 0, arrived = 0, observedFinished = 0, totalFlow = 0, rejected = 0, observedRejected = 0, reworked = 0, eventCount = 0;
  const productStats = new Map(products.map(p => [p.id, { id: p.id, name: p.name, color: p.color, arrivals: 0, completed: 0, rejected: 0, reworked: 0, route: p.route.slice() }]));
  const logEvent = (type, time, stationId, job, extra = {}) => { if (record && eventLog.length < EVENT_LOG_LIMIT) eventLog.push({ type, time, stationId: stationId ?? null, jobId: job?.id ?? null, productId: job?.productId ?? null, ...extra }); };
  const trace = (id, time, busy, waiting, completed, active) => {
    if (!record) return;
    const row = { time, busy, waiting, completed, start: active?.start ?? time, end: active?.end ?? time, productId: active?.productId ?? null };
    const track = tracks[id];
    if (track.length && track[track.length - 1].time === time) track[track.length - 1] = row; else track.push(row);
  };
  function offTime(n, from, to) { return n.pauseLength ? Math.max(0, Math.min(to, n.pauseStart + n.pauseLength) - Math.max(from, n.pauseStart)) : 0; }
  function isPaused(n, t) { return n.pauseLength > 0 && t >= n.pauseStart && t < n.pauseStart + n.pauseLength; }
  function integral(s, t) {
    const dt = Math.max(0, Math.min(t, horizon) - Math.max(s.last, warmup));
    const n = nodes.get(s.id), lost = offTime(n, Math.max(s.last, warmup), Math.min(t, horizon));
    s.busyArea += (dt - lost) * s.busy; s.queueArea += dt * (s.queue.length - s.head); s.last = t;
  }
  function bufferFor(job) { const previous = job.route[job.position - 1]; return nodes.get(previous)?.type === 'queue' ? nodes.get(previous) : null; }
  function snapshot(s, t, job, explicit) {
    const len = s.queue.length - s.head, active = s.active.values().next().value;
    trace(s.id, t, s.busy, explicit ? 0 : len, s.finished, active);
    if (explicit) trace(explicit.id, t, 0, len, s.starts, active);
  }
  function start(n, s, job, t, joined, w=null) {
    let end = t + sample(n.seconds, n.distribution, rng.get(n.id));
    if (n.pauseLength > 0 && t < n.pauseStart && end > n.pauseStart) end += n.pauseLength;
    if (t >= warmup) { s.starts++; s.waitTotal += t - joined; }
    s.busy++; s.active.set(job.id, { start: t, end, productId: job.productId });
    logEvent('service-start', t, n.id, job, { end });
    if(w){
      const stop=n.pauseStart;
      if(offTime(n,t,end)>0){
        segment(w,'Working',t,stop,n.id,n.id,job);
        segment(w,'Waiting',stop,stop+n.pauseLength,n.id,n.id,job);
        segment(w,'Working',stop+n.pauseLength,end,n.id,n.id,job);
      }else segment(w,'Working',t,end,n.id,n.id,job);
    }
    heap.push({ time: end, rank: 0, type: 'done', id: n.id, job,w });
  }
  function visit(job, t) {
    while (job.position < job.route.length && nodes.get(job.route[job.position])?.type === 'queue') job.position++;
    const id = job.route[job.position], n = nodes.get(id);
    if (!n) throw Error('A product route points to a missing station.');
    if (id === sink.id) {
      if(q){
        if(t>=warmup)quality[job.faults?.length?'escaped':'goodShipped']++;
        if(job.faults?.length)qualityEvent('escape',t,id,job,job.faults.join(','));
      }
      finished++; const ps = productStats.get(job.productId); ps.completed++;
      if (t >= warmup) { observedFinished++; totalFlow += t - job.entered; }
      logEvent('departure', t, id, job); trace(id, t, 0, 0, finished); return;
    }
    const s = stats.get(id); if (!s) throw Error('A product route must use processing stations and the sink.');
    const explicit = bufferFor(job); integral(s, t);
    if (s.busy+(reserved.get(n.id)||0)<s.capacity && !isPaused(n,t) && (!crew.length||crew.some(w=>!w.assigned))){
      if(crew.length)assign(n,s,job,t,t);else start(n,s,job,t,t);
    }
    else {
      const limit = explicit ? explicit.limit : n.limit;
      if (limit != null && s.queue.length - s.head >= limit) {
        rejected++; productStats.get(job.productId).rejected++;
        if (t >= warmup) { s.drops++; observedRejected++; }
        logEvent('rejected', t, id, job, { limit });
      } else { s.queue.push({ job, time: t }); if (t >= warmup) s.peak = Math.max(s.peak, s.queue.length - s.head); logEvent('queued', t, id, job); }
    }
    snapshot(s, t, job, explicit);
  }
  // A server is reserved from dispatch until the worker finishes the job.
  const crew=Array.from({length:model.crew?.count||0},(_,i)=>({id:i+1,station:source.id,assigned:false,segments:[]}));
  const reserved=new Map();
  function segment(w,kind,a,b,from,to,job,distance=0){
    if(record&&b>a)w.segments.push({kind,start:a,end:b,from,to,job:job?.id??null,distance});
  }
  function assign(n,s,job,t,joined){
    const w=crew.find(person=>!person.assigned);
    w.assigned=true;
    const path=workerPath(model,nodes.get(w.station),n);
    const distance=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0)*model.crew.scale;
    const end=t+distance/model.crew.speed;
    segment(w,'Walking',t,end,w.station,n.id,job,distance);
    reserved.set(n.id,(reserved.get(n.id)||0)+1);
    heap.push({type:'at-station',time:end,rank:1,id:n.id,job,w,joined});
  }
  function dispatch(t){
    while(crew.some(w=>!w.assigned)){
      let best=null;
      for(const n of stations){
        const s=stats.get(n.id),head=s.queue[s.head];
        if(head&&!isPaused(n,t)&&s.busy+(reserved.get(n.id)||0)<s.capacity&&(!best||head.time<best.head.time))best={n,s,head};
      }
      if(!best)break;
      const {n,s,head}=best;integral(s,t);s.head++;
      assign(n,s,head.job,t,head.time);snapshot(s,t,head.job,bufferFor(head.job));
      if(s.head>256&&s.head*2>s.queue.length){s.queue=s.queue.slice(s.head);s.head=0;}
    }
  }
  const scheduleArrival = (product, time) => heap.push({ time, rank: 2, type: 'arrival', productId: product.id });
  for (const product of products) scheduleArrival(product, 0);
  for (const n of stations) if (n.pauseLength > 0) heap.push({ time: n.pauseStart + n.pauseLength, rank: 0, type: 'resume', id: n.id });
  if (warmup > 0) heap.push({ time: warmup, rank: -1, type: 'warmup' });
  while (heap.items.length) {
    const e = heap.pop(), t = e.time;
    if (t > horizon) break;
    if (++eventCount > 150000) throw Error('This run exceeds 150,000 events. Shorten the run or increase arrival intervals.');
    if (e.type === 'warmup') { for (const s of stats.values()) s.peak = s.queue.length - s.head; continue; }
    if(e.type==='at-station'){
      const n=nodes.get(e.id),s=stats.get(e.id);e.w.station=n.id;
      if(isPaused(n,t)){
        const until=n.pauseStart+n.pauseLength;
        segment(e.w,'Waiting',t,until,n.id,n.id,e.job);
        heap.push({...e,time:until});continue;
      }
      integral(s,t);reserved.set(n.id,reserved.get(n.id)-1);
      start(n,s,e.job,t,e.joined,e.w);snapshot(s,t,e.job,bufferFor(e.job));continue;
    }
    if (e.type === 'resume') {
      if(crew.length){dispatch(t);continue;}
      const n = nodes.get(e.id), s = stats.get(e.id); integral(s, t);
      while (s.head < s.queue.length && s.busy < s.capacity) { const q = s.queue[s.head++]; start(n, s, q.job, t, q.time); }
      snapshot(s, t, null, null); continue;
    }
    if (e.type === 'arrival') {
      const product = products.find(p => p.id === e.productId), job = { id: ++jobs, productId: product.id, entered: t, visits: 0, route: product.route.slice(), position: 0 };
      if (t >= warmup) arrived++;
      productStats.get(product.id).arrivals++;
      logEvent('arrival', t, source.id, job);
      trace(source.id, t, 0, 0, jobs);
      visit(job, t);
      const random = arrivalRng.find(([id]) => id === product.id)[1], later = t + sample(product.interval, product.distribution, random);
      if (later < horizon) scheduleArrival(product, later);
    } else if (e.type === 'transfer') visit(e.job, t);
    else {
      const n = nodes.get(e.id), s = stats.get(n.id); integral(s, t); s.active.delete(e.job.id); s.busy--; s.finished++;
      logEvent('service-complete', t, n.id, e.job);
      if(e.w)e.w.assigned=false;
      if (!crew.length && s.head < s.queue.length && !isPaused(n, t)) { const queued = s.queue[s.head++]; start(n, s, queued.job, t, queued.time); if (s.head > 256 && s.head * 2 > s.queue.length) { s.queue = s.queue.slice(s.head); s.head = 0; } }
      let targetPosition = e.job.position + 1;
      if(q && !finishQualityStep(n,e.job,t)){
        snapshot(s,t,e.job,bufferFor(e.job));if(crew.length)dispatch(t);continue;
      }
      if (n.type === 'inspection' && n.rework > 0 && rng.get(n.id)() * 100 < n.rework) {
        if (++e.job.visits > 100) throw Error('A unit exceeded 100 inspection returns. Lower rework or change its route.');
        targetPosition = e.job.route.indexOf(n.reworkTo); if (targetPosition < 0) throw Error('Rework destination is not on the product route.');
        reworked++; productStats.get(e.job.productId).reworked++;
      }
      e.job.position = targetPosition; logEvent('transfer', t, n.id, e.job, { nextStationId: e.job.route[targetPosition] ?? null });
      snapshot(s, t, e.job, bufferFor(e.job)); heap.push({ time: t, rank: 1, type: 'transfer', job: e.job });
    }
    if(crew.length)dispatch(t);
  }
  const workers=record?crew.map(w=>{
    const intervals=[];let last=0,location=source.id;
    for(const seg of w.segments){
      if(seg.start>=horizon)break;
      if(seg.start>last)intervals.push({kind:'Idle',start:last,end:seg.start,from:location,to:location,distance:0});
      intervals.push(seg);last=seg.end;location=seg.to;
    }
    if(last<horizon)intervals.push({kind:'Idle',start:last,end:horizon,from:location,to:location,distance:0});
    return {id:w.id,intervals};
  }):[];
  const rows = stations.map(n => {
    const s = stats.get(n.id); integral(s, horizon);
    const available = window - offTime(n, warmup, horizon);
    return { id: n.id, name: n.name, capacity: s.capacity, available, util: available ? s.busyArea / (s.capacity * available) : 0, avgQueue: s.queueArea / window, peak: s.peak, avgWait: s.starts ? s.waitTotal / s.starts : 0, starts: s.starts, rejected: s.drops };
  });
  const cost = stations.reduce((a, n) => a + (n.hourly ?? 0) * (n.servers ?? 1) * window / 3600, 0);
  const bottleneck = rows.slice().sort((a, b) => b.avgQueue - a.avgQueue || b.util - a.util)[0];
  return { version: VERSION, config, tracks, rows, workers, quality, qualityTrace, totalScrap, arrivals: arrived, completed: observedFinished, totalCompleted: finished, totalArrivals: jobs, throughput: observedFinished / window * 3600, averageFlow: observedFinished ? totalFlow / observedFinished : null, rejected: observedRejected, wip: jobs - finished - rejected - totalScrap, reworked, cost, unitCost: observedFinished ? cost / observedFinished : null, bottleneck: bottleneck?.id ?? null, events: eventLog.length, processedEvents: eventCount, eventLog, eventLogTruncated: eventLog.length >= EVENT_LOG_LIMIT, productMetrics: [...productStats.values()] };
}
function frameAt(model, run, time) {
  const frame = {};
  for (const n of model.nodes) {
    const track = run?.tracks[n.id] ?? []; let lo = 0, hi = track.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (track[mid].time <= time) lo = mid + 1; else hi = mid; }
    const row = track[lo - 1];
    const paused = n.pauseLength > 0 && time >= n.pauseStart && time < n.pauseStart + n.pauseLength;
    const off = (a, b) => n.pauseLength ? Math.max(0, Math.min(b, n.pauseStart + n.pauseLength) - Math.max(a, n.pauseStart)) : 0;
    const duration = row ? row.end - row.start - off(row.start, row.end) : 0;
    const progress = duration > 0 ? (time - row.start - off(row.start, time)) / duration : 0;
    frame[n.id] = { busy: paused ? 0 : row?.busy ?? 0, waiting: row?.waiting ?? 0, completed: row?.completed ?? 0, capacity: n.servers ?? 1, paused, progress: Math.min(1, Math.max(0, progress)) };
  }
  return frame;
}
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.128, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045];
function sampleSummary(values) {
  const n = values.length, mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, margin: null };
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
  return { n, mean, margin: T95[n - 1] * Math.sqrt(variance / n) };
}
export { workerPath, simulateRun, normalizeConfig, validateModel, frameAt, sampleSummary, VERSION, mainRouteIds, normalizeProducts };

