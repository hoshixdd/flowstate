import assert from 'node:assert/strict';
import {workerPath,pathLength,simulateRun,frameAt,validateModel,sampleSummary} from './dist/engine.mjs';
import {template} from './dist/model.mjs';
const base=template('lab');
const stop=structuredClone(base);stop.nodes[1].pauseStart=10;stop.nodes[1].pauseLength=10;
const sr=simulateRun(stop,{horizon:121});assert.equal(sr.completed,1);assert.equal(sr.rows[0].available,111);assert.equal(sr.rows[0].util,1);
assert.equal(frameAt(stop,sr,12).n1.paused,true);assert.equal(frameAt(stop,sr,12).n1.progress,frameAt(stop,sr,18).n1.progress);
const full=structuredClone(base);full.nodes[1].pauseStart=0;full.nodes[1].pauseLength=3600;const fr=simulateRun(full,{});assert.equal(fr.completed,0);assert.equal(fr.rows[0].available,0);
console.log('PASS planned outage, paused playback, available-time utilization and full-window shutdown.');
const r=simulateRun(base,{});
assert.equal(r.completed,78);assert.equal(r.averageFlow,688.5);assert.equal(r.rows[1].peak,40);assert.equal(r.bottleneck,'n2');
assert.equal(r.completed+r.wip+r.rejected,120);assert.equal(frameAt(base,r,3600).n4.completed,78);
assert.ok(r.events>0);assert.ok(r.eventLog.some(event=>event.type==='arrival'));assert.equal(r.productMetrics[0].completed,78);
const split=structuredClone(base);split.edges.push(['n1','n3']);split.products=[{id:'standard',name:'Standard',interval:30,distribution:'fixed',route:[]},{id:'rush',name:'Rush',interval:45,distribution:'fixed',route:['n1','n3','n4']}];
assert.deepEqual(validateModel(split),[]);const splitRun=simulateRun(split,{horizon:600});assert.equal(splitRun.productMetrics.length,2);assert.ok(splitRun.productMetrics[1].completed>0);assert.ok(splitRun.eventLog.some(event=>event.productId==='rush'));assert.ok(splitRun.eventLog.some(event=>event.type==='departure'));
const badProduct=structuredClone(split);badProduct.products[1].route=['n1','n3'];assert.ok(validateModel(badProduct).some(issue=>issue.includes('must end at the sink')));
const faster=structuredClone(base);faster.nodes[2].seconds=40;assert.equal(simulateRun(faster,{}).completed,88);
for(const key of ['lab','production','campus'])assert.deepEqual(validateModel(template(key)),[]);
const finite=structuredClone(base);finite.nodes[2].limit=0;const f=simulateRun(finite,{});assert.ok(f.rejected>0);assert.equal(f.rows[1].peak,0);assert.equal(f.totalArrivals,f.wip+f.totalCompleted+f.rejected);
const q=structuredClone(base);q.nodes.push({id:'buffer',name:'Buffer',type:'queue',x:150,y:150,seconds:0,limit:2});q.edges=[['n0','n1'],['n1','buffer'],['buffer','n2'],['n2','n3'],['n3','n4']];const qr=simulateRun(q,{});assert.equal(qr.rows[1].peak,2);assert.ok(qr.rejected>0);assert.ok(frameAt(q,qr,3500).buffer.waiting<=2);
const s=structuredClone(base);s.nodes[2].distribution='exponential';s.nodes[2].servers=2;s.nodes[2].hourly=60;
const a=simulateRun(s,{seed:9,warmup:600}),b=simulateRun(s,{seed:9,warmup:600}),c=simulateRun(s,{seed:10,warmup:600});
assert.deepEqual(a,b);assert.notDeepEqual(a.tracks.n2,c.tracks.n2);assert.equal(a.cost,100);assert.ok(a.rows.every(row=>row.util>=0&&row.util<=1));
const inspection=structuredClone(base);inspection.nodes[3].type='inspection';inspection.nodes[3].rework=40;inspection.nodes[3].reworkTo='n1';const re=simulateRun(inspection,{});assert.ok(re.reworked>0);assert.equal(re.totalArrivals,re.totalCompleted+re.wip+re.rejected);
assert.equal(simulateRun(base,{horizon:110}).completed,0);assert.equal(simulateRun(base,{horizon:111}).completed,1);
const bad=structuredClone(base);bad.edges.pop();assert.throws(()=>simulateRun(bad,{}));assert.throws(()=>simulateRun(base,{warmup:3600}));
assert.equal(sampleSummary([78,78,78]).margin,0);assert.equal(sampleSummary([78]).margin,null);
console.log('PASS deterministic reference, completion boundaries, FIFO, capped and explicit buffers, conservation, parallel servers, costs, replicated randomness, warm-up, rework, confidence interval and invalid models.');
import {compareMethods, timeStudy, routeDistance, totalProductivity, samplingShares} from './dist/work-study.mjs';
const waitStep = {activity:'delay', seconds:15, metres:0};
assert.equal(compareMethods('worker',[waitStep],[]).savings.seconds,15);
assert.throws(()=>compareMethods('worker',[{...waitStep,activity:'disposal'}],[]));
assert.equal(timeStudy([40,50],100,0).cyclesPerHour,80);
assert.equal(timeStudy([45],100,10,'shift-time').standard,50);
assert.deepEqual(samplingShares({busy:8,idle:2}),{busy:.8,idle:.2});
assert.equal(totalProductivity(700,[250,100]),2);
assert.equal(routeDistance([{x:0,y:0},{x:3,y:4}],2),10);
console.log('PASS work study chart types, method savings, timing, sampling, productivity and route scale.');
import {simulationWorksheet} from './dist/study-lab.mjs';
const recording=simulateRun(base,{},true);
const routeStudy=simulationWorksheet('layout',base,recording,'n2');
assert.deepEqual(routeStudy.rows.map(r=>r.label),base.nodes.map(n=>n.name));
assert.ok(simulationWorksheet('timing',base,recording,'n2').observations.split(', ').every(t=>Number(t)===45));
assert.equal(simulationWorksheet('operations',base,recording,'n2').rows.length,3);
const sample=simulationWorksheet('sampling',base,recording,'n2');
assert.equal(sample.rows.reduce((s,r)=>s+r.count,0),100);
console.log('PASS simulation-derived worksheets, routed jobs and reproducible samples');
const packing=template('staffed');
for(const count of [1,2,3]){
  packing.crew.count=count;
  const run=simulateRun(packing,{}), observation=simulationWorksheet('worker',packing,run,'n1',1,0,300);
  assert.equal(run.completed,[10,49,86][count-1]);
  assert.equal(run.workers.length,count);
  assert.ok(Math.abs(observation.rows.reduce((total,r)=>total+r.seconds,0)-300)<1e-6);
  assert.ok(observation.rows.some(r=>r.activity==='move'&&r.metres>0));
  for(const worker of run.workers){
    let end=0;
    for(const seg of worker.intervals){assert.ok(Math.abs(seg.start-end)<1e-6);end=seg.end;}
    assert.ok(end>=run.config.horizon);
  }
}
packing.nodes[1].pauseStart=10;packing.nodes[1].pauseLength=50;
const pausedCrew=simulateRun(packing,{horizon:90});
assert.ok(pausedCrew.workers.some(w=>w.intervals.some(s=>s.kind==='Waiting')));
assert.ok(pausedCrew.eventLog.filter(e=>e.stationId==='n1'&&e.type==='service-start').every(e=>e.time>=60));
console.log('PASS staffed factory, non-overlapping worker histories, clipped observations and planned stops.');

const qualityLine=template('quality');
assert.deepEqual(validateModel(qualityLine),[]);
const study=simulateRun(qualityLine,{seed:42});
assert.deepEqual(study.quality,simulateRun(qualityLine,{seed:42},false).quality);
assert.equal(study.quality.goodShipped+study.quality.escaped,study.completed);
assert.equal(study.totalArrivals,study.wip+study.completed+study.totalScrap+study.rejected);
assert.ok(study.workers.some(w=>w.intervals.some(s=>s.kind==='Working'&&s.to==='repair')));
assert.ok(study.qualityTrace.every((e,i,rows)=>!i||rows[i-1].time<=e.time));
for(const [rate,catchRate,recover] of [[0,100,100],[100,0,100],[100,100,100],[100,100,0]]){
  const line=structuredClone(qualityLine);
  line.quality.modes.forEach(m=>m.rate=rate);line.quality.detection=catchRate;line.quality.recovery=recover;
  const r=simulateRun(line,{horizon:1800,warmup:300}),s=r.quality;
  assert.ok(s.inspected>0);assert.equal(s.firstGood,rate?0:s.inspected);
  assert.equal(s.goodShipped+s.escaped,r.completed);
  assert.equal(r.totalArrivals,r.wip+r.totalCompleted+r.totalScrap);
  assert.ok(s.counts.every(c=>c.faults===(rate?c.opportunities:0)));
  if(rate&&!catchRate){assert.equal(s.detected,0);assert.equal(s.escaped,r.completed);assert.ok(s.escaped>0);}
  if(rate&&catchRate){assert.equal(s.detected,s.inspected);assert.equal(s.escaped,0);assert.ok(recover?s.repaired>0:s.scrapped>0);}
  if(!rate){assert.equal(s.detected,0);assert.equal(s.escaped,0);}
}
const invalidQuality=structuredClone(qualityLine);invalidQuality.quality.detection=101;assert.throws(()=>simulateRun(invalidQuality,{}),/quality/);
console.log('PASS causal fault creation, branch routing, repair labor, scrap conservation, escaped shipments, warm-up, and unique first-pass counts.');

const roles=template('roles'),roleRun=simulateRun(roles,{});
assert.equal(roleRun.completed,28);
for(const e of roleRun.eventLog.filter(e=>e.type==='service-start'))assert.ok(roles.crew.roster[e.workerId-1].stations.includes(e.stationId));
const crossTrained=structuredClone(roles);crossTrained.crew.roster[1].stations.push('n2');
const crossRun=simulateRun(crossTrained,{});assert.equal(crossRun.completed,58);
assert.ok(crossRun.workers[1].intervals.some(i=>i.kind==='Working'&&i.to==='n2'));
assert.ok(crossRun.rows.find(n=>n.id==='n3').avgQueue>roleRun.rows.find(n=>n.id==='n3').avgQueue);
const vacant=structuredClone(roles);vacant.crew.roster[1].stations=[];const blocked=simulateRun(vacant,{});
assert.equal(blocked.completed,0);assert.ok(blocked.rows.find(s=>s.id==='n3').peak>0);
assert.ok(blocked.workers[1].intervals.every(s=>s.kind==='Idle'));
const legacy=template('staffed'),allSkilled=structuredClone(legacy);
allSkilled.crew.roster=Array.from({length:2},()=>({role:'Operator',stations:['n1','n2','n3']}));
assert.deepEqual(simulateRun(legacy,{}).tracks,simulateRun(allSkilled,{}).tracks);
const badRoster=structuredClone(roles);badRoster.crew.roster[0].stations=['bogus'];assert.throws(()=>simulateRun(badRoster,{}),/Invalid worker roster/);
console.log('PASS restricted crews, cross-training, uncovered stations, legacy dispatch parity and roster validation.');

const aisleStudy=template('walking');
const [prep,fill]=aisleStudy.nodes.slice(1,3);
assert.deepEqual(workerPath(aisleStudy,prep,fill),workerPath(aisleStudy,fill,prep).reverse());
const originalAisle=simulateRun(aisleStudy,{});
assert.equal(originalAisle.completed,28);
const shortAisle=structuredClone(aisleStudy);
shortAisle.walkingRoutes[0]={from:'n1',to:'n2',via:[],metres:8};
const newLayout=simulateRun(shortAisle,{});
assert.equal(newLayout.completed,36);
for(const r of [originalAisle,newLayout]){
  const trips=r.workers.flatMap(w=>w.intervals).filter(i=>i.kind==='Walking'&&[i.from,i.to].sort().join(',')==='n1,n2');
  assert.ok(trips.length>1);
  for(const leg of trips){assert.equal(leg.distance,r===originalAisle?22:8);assert.ok(Math.abs((leg.end-leg.start)*aisleStudy.crew.speed-leg.distance)<1e-8);}
}
shortAisle.walkingRoutes[0].metres=null;shortAisle.crew.scale=2;
const geometric=simulateRun(shortAisle,{}).workers[0].intervals.find(i=>i.from==='n1'&&i.to==='n2');
assert.equal(geometric.distance,2*pathLength(workerPath(shortAisle,prep,fill)));
shortAisle.walkingRoutes.push({from:'n2',to:'n1',via:[]});assert.throws(()=>simulateRun(shortAisle,{}),/Invalid walking route/);
shortAisle.walkingRoutes=[{from:'missing',to:'n1',via:[]}];assert.throws(()=>simulateRun(shortAisle,{}),/Invalid walking route/);
console.log('PASS measured and scaled walking, reverse trips, cross-training compatibility and invalid routes.');

const supplyLine=template('materials'),late=simulateRun(supplyLine,{});
assert.equal(late.inventory.shortageSeconds,1200);assert.equal(late.inventory.peakWaiting,60);
assert.equal(late.inventory.orderWaitSeconds,36600);assert.equal(late.inventory.orders[30].lot,'BLANK-B');
assert.equal(late.inventory.orders[30].issued,1800);
assert.equal(frameAt(supplyLine,late,900).receiving.materialBacklog,16);
assert.equal(frameAt(supplyLine,late,1800).receiving.materialBacklog,0);
assert.equal(late.inventory.lots.reduce((a,l)=>a+l.good,0),late.quality.goodShipped);
assert.equal(late.inventory.lots.reduce((a,l)=>a+l.scrapped,0),late.totalScrap);
assert.equal(late.inventory.lots.reduce((a,l)=>a+l.escaped,0),late.quality.escaped);
const onTime=structuredClone(supplyLine);onTime.supply.lots[1].at=600;
const ready=simulateRun(onTime,{});assert.equal(ready.inventory.shortageSeconds,0);
assert.equal(ready.completed,simulateRun(template('quality'),{}).completed);
const dry=structuredClone(supplyLine);dry.supply.lots=[];
const noStock=simulateRun(dry,{horizon:300,warmup:100});
assert.equal(noStock.inventory.shortageSeconds,200);assert.equal(noStock.wip,0);assert.equal(noStock.inventory.waiting,noStock.totalArrivals);
assert.equal(noStock.completed,0);assert.ok(noStock.inventory.orders.every(j=>j.lot===null));
const tieLots=structuredClone(supplyLine);tieLots.supply.lots=[{id:'first',at:40,quantity:1},{id:'second',at:40,quantity:2}];
const tie=simulateRun(tieLots,{horizon:41});assert.deepEqual(tie.inventory.orders.map(o=>o.lot),['first','second','second']);assert.equal(tie.inventory.waiting,0);
tieLots.supply.lots[1].id='first';assert.throws(()=>simulateRun(tieLots,{}),/Invalid material supply/);
const cappedLots=structuredClone(onTime);cappedLots.nodes.find(s=>s.id==='filler').limit=0;
const cappedSupply=simulateRun(cappedLots,{});assert.ok(cappedSupply.rejected>0);
assert.equal(cappedSupply.rejected,cappedSupply.inventory.lots.reduce((a,l)=>a+l.rejected,0));
assert.equal(cappedSupply.totalArrivals,cappedSupply.completed+cappedSupply.totalScrap+cappedSupply.rejected+cappedSupply.wip+cappedSupply.inventory.waiting);
console.log('PASS FIFO supply, lot dispositions, same-time receipts, warm-up shortage, replay and conservation.');

import {insertStation,workplaceSummary} from './dist/workplace.mjs';
{
 const bakery=template('bakery'),config={seed:42,horizon:14400};
 const trial=simulateRun(bakery,config),c=trial.quality.counts[0];
 assert.ok(c.exposed>0);assert.equal(c.exposed,c.opportunities);
 bakery.nodes.find(n=>n.id==='oven').setting=205;
 const adjusted=simulateRun(bakery,config);
 assert.equal(adjusted.quality.counts[0].exposed,0);
 assert.ok(workplaceSummary(adjusted).faults<workplaceSummary(trial).faults);
 assert.ok(!trial.workers.some(w=>w.intervals.some(i=>i.kind==='Working'&&i.to==='oven')));
 const laundry=template('laundry'),fold=simulateRun(laundry,{horizon:7200}).quality.counts[0];
 assert.ok(fold.exposed>0 && fold.exposed<fold.opportunities);
 const shop=template('printshop'),binder=shop.nodes.find(n=>n.id==='binder');
 const initial=simulateRun(shop,{horizon:3600,seed:42}),stops=initial.calendars.binder;
 assert.ok(stops.length>0);assert.deepEqual(stops,simulateRun(shop,{horizon:3600,seed:42}).calendars.binder);
 assert.ok(initial.quality.counts[0].exposed>0);
 for(const s of stops){const frame=frameAt(shop,initial,(s.start+s.end)/2);assert.equal(frame.binder.paused,true);}
 binder.reliability={life:604800,repair:120,pmAge:80,pmTime:20};binder.pauseStart=40;binder.pauseLength=60;
 const serviced=simulateRun(shop,{horizon:600,seed:42});
 assert.deepEqual(serviced.calendars.binder.slice(0,2).map(s=>[s.start,s.end,s.reason]),[[40,100,'Planned stop'],[140,160,'Preventive maintenance']]);
 const supplied=template('materials'),mode=supplied.quality.modes[0];mode.rate=0;mode.condition={type:'lot',threshold:1,rate:100};
 const lot=simulateRun(supplied,{horizon:3600}).quality.counts[0];
 assert.equal(lot.exposed,2);assert.equal(lot.faults,2);
 const line=template('lab');line.products=[{id:'tray',name:'Tray',interval:30,route:['n1','n2','n3','n4']}];
 insertStation(line,{id:'bench',name:'Weigh',type:'processor',seconds:8,x:200,y:200,unattended:false},'n1','n2');
 assert.deepEqual(line.products[0].route,['n1','bench','n2','n3','n4']);assert.deepEqual(validateModel(line),[]);
 assert.ok(simulateRun(line,{horizon:600}).rows.find(row=>row.id==='bench').starts>0);
 console.log('PASS workplace routes, staffed and unattended service, conditional quality, lot boundaries, reproducible breakdowns and preventive maintenance.');
}

