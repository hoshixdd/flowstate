import {chartActivities,compareMethods,timeStudy,routeDistance,samplingShares,productivity,totalProductivity} from './work-study.mjs';

const topics = {
  overview: ['Study record', 'Select the job, record the present method, examine its purpose, place, sequence, person and means, then develop, install and maintain the improved method. Record what you directly observed.'],
  material: ['Material process chart', 'Follow one material from receipt to completion. A combined operation and inspection is one recorded step.'],
  worker: ['Worker process chart', 'Follow one worker. Distinguish a required move between workstations from a delay or movement within a workstation.'],
  form: ['Form process chart', 'Follow one document from creation to disposal. Record filing separately from temporary waiting.'],
  operations: ['Operations chart', 'Trace the main component through fabrication, assembly and packing. Record purchased parts at the operation where they join. Compare pieces per hour for each operation.'],
  layout: ['Flow diagram', 'Mark the actual route in order on the floor plan, including aisle turns. Calibrate the drawing scale. Examine crossings, backtracking and congestion before proposing a new layout.'],
  timing: ['Direct time study', 'Describe a repeatable method and observe a qualified worker. Rate the worker-controlled time, then add allowances for personal needs, fatigue and unavoidable delays.'],
  standards: ['Motion and standard data', 'For predetermined motion times, list basic motions with values from your chosen reference. For standard data, use previously established normal element times for comparable conditions. Document each source.'],
  sampling: ['Work sampling', 'Define mutually exclusive activities and observe at randomly chosen times across a representative period. The proportion of observations estimates the share of time in each category.'],
  productivity: ['Productivity', 'Compare output with the resources used in the same period. A gain in labor productivity can coincide with increased material or machine costs. Use one currency for total productivity.']
};
const methods=['Present','Proposed'];
const guides={
  overview:'What changed in the material, equipment, operator training or working conditions? When should the standard be measured again?',
  operations:'Could the material specification change? Which parts should be made or purchased? Which operations can be eliminated, combined, rearranged or simplified?',
  material:'Which transports, delays or inspections could be removed? Can the inspection take place during an operation?',
  worker:'Which movements add distance? Could tools or materials be repositioned to reduce waiting and travel?',
  form:'Which copies, approvals or handoffs are redundant? Can the same record serve more than one purpose?',
  layout:'Where do routes cross, reverse or compete for aisle space? How would rerouting affect distance, handling and safety?',
  timing:'Why is this worker and method representative? Separate recurring and irregular work. How were personal, fatigue and unavoidable delay allowances established?',
  standards:'How closely do the reference conditions match this method? Estimates and historical records may lack a performance rating. Record the units and convert to seconds before entry.',
  sampling:'What population and period do the observations represent? Could the sampling schedule miss a shift or part of a cycle?',
  productivity:'Which technical, production, organizational, personnel, finance, management, government or location factor could explain the change? Compare present and proposed results and name the action you would maintain.'
};
const fields={
  overview:[['activity','Activity or product'],['observer','Observer / IE'],['date','Study date','date'],['location','Location'],['start','Starting point'],['end','Ending point'],['approved','Approved by'],['method','Standard method, tools and conditions'],['analysis','Analysis and improvement opportunities'],['conclusion','Conclusion and follow-up']],
  timing:[['observations','Observed manual seconds per cycle (comma-separated)'],['rating','Performance rating (%)','number',100],['allowance','Manual allowance (%)','number',0],['basis','Allowance basis',['normal-time','shift-time']],['machine','Sequential machine-controlled seconds per cycle','number',0],['machineAllowance','Machine allowance on machine time (%)','number',0]],
  productivity:[['output','Finished units','number'],['value','Output value (₱)','number'],['labor','Labor hours','number'],['material','Material used (kg)','number'],['machine','Machine hours','number'],['capital','Capital employed (₱)','number'],...['Labor','Material','Machine','Capital','Other'].map(k=>[k+'Cost',k+' input cost for the period (₱)','number',0])],
  layout:[['scale','Metres per drawing unit','number',1]],
  standards:[['system','Source system',['Predetermined motion times','Standard data']],['allowance','Allowance on normal time (%)','number',0]],
};
const columns={
  operations:[['part','Part / branch'],['kind','Part type',['Fabricated','Buyout']],['task','Operation or purchased item'],['join','Feeds operation #','integer'],['seconds','Seconds / cycle','number'],['qty','Pieces / cycle','number',1]],
  layout:[['label','Waypoint'],['x','Floor X','coordinate'],['y','Floor Y','coordinate']],
  standards:[['element','Motion / element'],['source','Reference and conditions'],['seconds','Normal seconds','number'],['frequency','Occurrences / cycle','number',1]],
  sampling:[['label','Observed activity'],['count','Observation count','integer']],
};
for(const [type,activities] of Object.entries(chartActivities)){
  columns[type]=[['description','Step description'],['activity','Classification',activities],['qty','Quantity','number',1],['metres','Distance (m)','number',0],['seconds','Time (s)','number',0],['remarks','Remarks']];
}
const num=(v,positive=false)=>{
  if(v==null||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0||(positive&&Number(v)===0))throw Error('Enter valid measurements in all required numeric fields.');
  return Number(v);
};
const format=n=>Number(n.toFixed(3)).toLocaleString();
function numericRows(rows){
  return rows.map(r=>({...r,seconds:num(r.seconds),metres:num(r.metres),qty:num(r.qty)}));
}
function duration(t){
  const manual=timeStudy(String(t.observations||'').split(',').map(v=>num(v,true)),num(t.rating,true),num(t.allowance),t.basis);
  const machine=num(t.machine)*(1+num(t.machineAllowance)/100);
  return {...manual,standard:manual.standard+machine};
}
function standardFromData(t){
  if(!t.rows.length||t.rows.some(r=>!r.element?.trim()||!r.source?.trim()))throw Error('Enter an element and a reference for each time value.');
  const normal=t.rows.reduce((s,r)=>s+num(r.seconds,true)*num(r.frequency,true),0);
  return {normal,standard:normal*(1+num(t.allowance)/100)};
}
function blankTopic(key){
  const obj={rows:[]};
  for(const [id,,type,initial] of fields[key]||[])obj[id]=initial??(Array.isArray(type)?type[0]:'');
  return obj;
}

// Use one completed job so branching and repeated visits stay in event order.
export function simulationWorksheet(topic,model,run,stationId,workerId=1,from=run.config.warmup,to=run.config.horizon){
  const name=id=>model.nodes.find(n=>n.id===id)?.name||id;
  const stamp='Simulation · seed '+run.config.seed+' · observation window '+run.config.warmup+'–'+run.config.horizon+' s';
  const end=run.eventLog.find(ev=>ev.type==='departure'&&ev.time>=run.config.warmup);
  const context=stamp+' · '+run.completed+' completed · bottleneck '+name(run.bottleneck);
  if(topic==='worker'&&run.workers?.length){
    if(!Number.isFinite(from)||!Number.isFinite(to)||from<run.config.warmup||to>run.config.horizon||to<=from)throw Error('Choose a positive observation window within the measured run.');
    const worker=run.workers.find(w=>w.id===workerId);if(!worker)throw Error('Choose a worker from this run.');
    const rows=[];
    for(const i of worker.intervals){
      const start=Math.max(i.start,from),end=Math.min(i.end,to);if(end<=start)continue;
      const activity=i.kind==='Walking'?'move':i.kind==='Working'?(model.nodes.find(n=>n.id===i.to)?.type==='inspection'?'inspection':'operation'):'delay';
      rows.push({description:i.kind+' · '+(i.from===i.to?name(i.to):name(i.from)+' → '+name(i.to)),activity,qty:1,seconds:end-start,metres:(i.distance||0)*(end-start)/(i.end-i.start),remarks:'W'+worker.id+' · '+format(start)+'–'+format(end)+' s'+(i.job?' · unit '+i.job:'')});
      if(rows.length>500)throw Error('Choose a shorter observation window (500 activities maximum per worksheet).');
    }
    return {rows,provenance:stamp+' · worker '+worker.id+(worker.role?' ('+worker.role+')':'')+' · observed '+from+'–'+to+' s · simulated worker activity.'};
  }
  if(['worker','form','standards'].includes(topic))return {provenance:context+'. Record actual worker movement, document handling or reference times separately.'};
  if(topic==='sampling'){
    const track=run.tracks[stationId]||[];
    if(!track.length)throw Error('Select a processing station in the studio first.');
    // Stratified pseudo-random observation times within the recorded run.
    let seed=run.config.seed>>>0,i=0,busy=0;
    const node=model.nodes.find(n=>n.id===stationId);
    for(let k=0;k<100;k++){
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      const t=run.config.warmup+(k+seed/4294967296)*(run.config.horizon-run.config.warmup)/100;
      while(i+1<track.length&&track[i+1].time<=t)i++;
      if(track[i].time<=t&&track[i].busy>0&&!(node.pauseLength&&t>=node.pauseStart&&t<node.pauseStart+node.pauseLength))busy++;
    }
    return {rows:[{label:'Station busy',count:busy},{label:'Idle or stopped',count:100-busy}],provenance:stamp+' · 100 simulated observations at '+name(stationId)};
  }
  if(topic==='timing'){
    const starts=new Map(),times=[];
    for(const ev of run.eventLog){
      if(ev.stationId!==stationId)continue;
      if(ev.type==='service-start'&&ev.time>=run.config.warmup)starts.set(ev.jobId,ev.time);
      if(ev.type==='service-complete'&&starts.has(ev.jobId)){
        times.push(Number((ev.time-starts.get(ev.jobId)).toFixed(6)));starts.delete(ev.jobId);
        if(times.length===30)break;
      }
    }
    if(!times.length)throw Error('No complete cycles recorded for this station in the observation window.');
    return {observations:times.join(', '),provenance:stamp+' · '+name(stationId)+' · simulated elapsed cycles, including any planned stops.'};
  }
  if(!end)throw Error('No completed job in the recorded event log for this window.');
  const trace=run.eventLog.filter(ev=>ev.jobId===end.jobId);
  const rows=[];let queued,started;
  for(const ev of trace){
    const node=model.nodes.find(n=>n.id===ev.stationId);
    if(topic==='layout'&&['arrival','service-start','departure'].includes(ev.type)&&node)rows.push({label:node.name,x:node.x,y:node.y});
    if(ev.type==='queued')queued=ev.time;
    if(ev.type==='service-start'){
      if(topic==='material'&&queued!=null&&ev.time>queued)rows.push({description:'Wait at '+name(ev.stationId),activity:'delay',qty:1,metres:0,seconds:ev.time-queued});
      queued=null;started=ev.time;
    }
    if(ev.type==='service-complete'&&started!=null){
      const seconds=ev.time-started;
      if(topic==='material')rows.push({description:name(ev.stationId),activity:node?.type==='inspection'?'inspection':'operation',qty:1,metres:0,seconds});
      if(topic==='operations')rows.push({part:'Product '+end.productId,kind:'Fabricated',task:name(ev.stationId),qty:1,seconds,join:''});
      started=null;
    }
  }
  return {rows,provenance:stamp+' · simulated job '+end.jobId+' · product '+end.productId+'. Confirm physical distances and component relationships by observation.'};
}

export function openStudy({model,run,selected,topic='overview',initialWorker=1,range=null,draftKey,getRevision,modal,commit,escape:e,notify,rerun}){
  let draft=structuredClone(model.workStudy||{Present:{},Proposed:{}});
  let recovered=false;
  try{const saved=JSON.parse(localStorage.getItem(draftKey));if(saved?.revision===getRevision()&&saved.data?.Present&&saved.data?.Proposed){draft=saved.data;recovered=true;}}catch{}
  const discardDraft=()=>{try{localStorage.removeItem(draftKey);}catch{}};
  function checkpoint(){
    try{localStorage.setItem(draftKey,JSON.stringify({revision:getRevision(),data:draft}));}
    catch{const status=id('status');if(status)status.textContent='Draft recovery unavailable. Save study and export the project.';}
  }
  let method='Present';
  let station=selected,workerId=initialWorker,from=run?.config.warmup||0,to=run?Math.min(run.config.horizon,run.config.warmup+300):0;
  if(range){from=range.from;to=range.to;}
  const methodTimes=m=>draft[m].stationTimes||{};
  const get=(k=topic,m=method)=>draft[m][k]??=(blankTopic(k));
  let watchStart=null;
  const id=v=>document.getElementById('ws-'+v);
  const svg=(body,vb)=>'<svg role="img" aria-label="'+e(topics[topic][0])+'" viewBox="'+vb+'" style="width:100%;min-height:130px;background:#f4f8f6">'+body+'</svg>';
  function graphic(t,key){
    if(key==='layout'){
      const pts=t.rows.map(r=>{
        if([r.x,r.y].some(v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))))throw Error('Enter both coordinates for each waypoint.');
        return {x:Number(r.x),y:Number(r.y)};
      });
      const length=routeDistance(pts,num(t.scale,true));
      if(!pts.length&&!model.nodes.length)return 'Add a waypoint to start the route.';
      const xs=[...pts.map(p=>p.x),...model.nodes.map(n=>n.x)],ys=[...pts.map(p=>p.y),...model.nodes.map(n=>n.y)];
      const minX=Math.min(...xs)-25,minY=Math.min(...ys)-30,w=Math.max(150,Math.max(...xs)-minX+120),h=Math.max(100,Math.max(...ys)-minY+40);
      const stations=model.nodes.map(n=>'<g><rect x="'+Number(n.x)+'" y="'+Number(n.y)+'" width="90" height="20" fill="#cfdfda"/><text x="'+(Number(n.x)+3)+'" y="'+(Number(n.y)+14)+'" font-size="10">'+e(n.name)+'</text></g>').join('');
      return '<strong>'+format(length)+' m travelled</strong>'+svg(stations+'<polyline points="'+pts.map(p=>p.x+','+p.y).join(' ')+'" fill="none" stroke="#23785a" stroke-width="3"/>'+pts.map((p,i)=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="4" fill="#175648"/><text x="'+(p.x+5)+'" y="'+(p.y-5)+'" font-size="11">'+(i+1)+' '+e(t.rows[i].label)+'</text>').join(''),[minX,minY,w,h].join(' '));
    }
    const parts=[...new Set(t.rows.map(r=>r.part||'Part'))], pos=i=>({x:100+180*(parts.length-1-parts.indexOf(t.rows[i].part||'Part')),y:35+i*65});
    let edges='',nodes=''; const last=new Map();
    for(const [i,r] of t.rows.entries()){
      const {x,y}=pos(i),buy=r.kind==='Buyout',prior=last.get(r.part);
      if(prior!==undefined)edges+='<path d="M '+x+' '+pos(prior).y+' V '+y+'" stroke="#668"/>';
      last.set(r.part,i);
      if(r.join){const j=num(r.join,true)-1;if(!Number.isInteger(j)||j<=i||j>=t.rows.length)throw Error('A component must feed a later operation number.');const q=pos(j);edges+='<path d="M '+x+' '+y+' V '+q.y+' H '+q.x+'" fill="none" stroke="#287a67"/>';}
      const rate=buy?'Purchased':format(3600*num(r.qty,true)/num(r.seconds,true))+' pieces/h';
      nodes+=(buy?'<rect x="'+(x-13)+'" y="'+(y-12)+'" width="26" height="24" fill="#d6e2dc"/>':'<circle cx="'+x+'" cy="'+y+'" r="13" fill="#dbedce" stroke="#28644d"/>')+'<text x="'+x+'" y="'+(y+4)+'" text-anchor="middle">'+(i+1)+'</text><text x="'+x+'" y="'+(y+25)+'" text-anchor="middle" font-size="11">'+e(r.part)+' · '+e(r.task)+'</text><text x="'+x+'" y="'+(y+39)+'" text-anchor="middle" font-size="10">'+rate+'</text>';
    }
    return t.rows.length?svg(edges+nodes,'0 0 '+(parts.length*180+25)+' '+(t.rows.length*65+20)):'Add a component or operation.';
  }
  function output(k,t,m){
    if(Object.hasOwn(chartActivities,k)){
      const other=m==='Present'?'Proposed':'Present';
      const current=numericRows(t.rows),peer=numericRows(get(k,other).rows);
      const c=compareMethods(k,m==='Present'?current:peer,m==='Proposed'?current:peer);
      const rows=[['Steps','steps'],['Seconds','seconds'],['Metres','metres']];
      const row=(name,values)=>'<tr><th>'+e(name)+'</th>'+values.map(n=>'<td>'+format(n)+'</td>').join('')+'</tr>';
      const summaries=[c.present,c.proposed,c.savings];
      const quantities=[current,peer].map(list=>list.reduce((sum,r)=>sum+r.qty,0));
      if(m==='Proposed')quantities.reverse();
      return '<table><tr><th>Measure</th><th>Present</th><th>Proposed</th><th>Saving</th></tr>'+rows.map(([l,v])=>row(l,summaries.map(x=>x[v]))).join('')+row('Quantity across steps', [...quantities,quantities[0]-quantities[1]])+chartActivities[k].map(a=>row(a,summaries.map(x=>x.counts[a]))).join('')+'</table>'+(peer.length?'':'Record both methods before interpreting savings.');
    }
    if(k==='layout'||k==='operations'){
      let drawing=graphic(t,k);
      if(k==='layout'&&methods.every(m=>draft[m].layout?.rows.length)){
        const lengths=methods.map(m=>{const l=draft[m].layout;return routeDistance(l.rows.map(r=>({x:Number(r.x),y:Number(r.y)})),num(l.scale,true));});
        drawing+='<p>Present '+format(lengths[0])+' m · Proposed '+format(lengths[1])+' m · Distance saved '+format(lengths[0]-lengths[1])+' m</p>';
      }
      return drawing;
    }
    if(k==='timing'||k==='standards'){
      const v=k==='timing'?duration(t):standardFromData(t);
      return (k==='timing'?'Mean observed manual time '+format(v.observed)+' s · ':'')+'Normal '+(k==='timing'?'manual ':'')+'time '+format(v.normal)+' s · <b>Standard cycle '+format(v.standard)+' s</b> · '+format(3600/v.standard)+' cycles/h';
    }
    if(k==='sampling'){
      const counts=new Map();for(const r of t.rows){if(!r.label?.trim())throw Error('Name each activity.');const n=num(r.count);if(!Number.isSafeInteger(n))throw Error('Use whole observation counts.');counts.set(r.label,(counts.get(r.label)||0)+n);}
      return Object.entries(samplingShares(Object.fromEntries(counts))).map(([name,share])=>e(name)+' · '+format(100*share)+'%').join('<br>');
    }
    if(k==='productivity'){
      const units={labor:'labor h',material:'kg',machine:'machine h',capital:'₱ capital'};
      const partial=Object.entries(units).filter(([k])=>t[k]!==''&&t[k]!=null).map(([k,u])=>format(productivity(num(t.output),num(t[k],true)))+' units / '+u);
      if(t.value!=='')partial.push('Total productivity · '+format(totalProductivity(num(t.value),['Labor','Material','Machine','Capital','Other'].map(k=>num(t[k+'Cost']))))+' ₱ output / ₱ input');
      return partial.join('<br>')||'Enter output and at least one input for the same period.';
    }
    return '';
  }
  function safeOutput(k,t,m){try{return output(k,t,m);}catch(err){return e(err.message);}}
  const control=(spec,value,attr)=>{
    const [key,label,type]=spec,a=' aria-label="'+e(label)+'" data-key="'+key+'" '+attr;
    if(Array.isArray(type))return '<select '+a+'>'+type.map(o=>'<option'+(o===value?' selected':'')+'>'+e(o)+'</option>').join('')+'</select>';
    const numeric=['number','integer','coordinate'].includes(type);
    return '<input '+a+' type="'+(numeric?'number':type==='date'?'date':'text')+'" '+(numeric?'step="'+(type==='integer'?'1':'any')+'" '+(type==='coordinate'?'':'min="0"'):'')+' value="'+e(value)+'">';
  };
  function refresh(){
    const t=get(),cols=columns[topic]||[], form=fields[topic]||[];
    const select=(name,opts,active)=>'<select id="ws-'+name+'">'+opts.map(([k,v])=>'<option value="'+e(k)+'"'+(active===k?' selected':'')+'>'+e(v)+'</option>').join('')+'</select>';
    const node=model.nodes.find(n=>n.id===station);
    const snapshot=draft[method].evidence;
    const source='<div class="study-source"><div><strong>'+e(model.title)+'</strong><small>'+(run?e(run.completed)+' completed · '+e(format(run.throughput))+' units/h · seed '+e(run.config.seed):'Run the simulation to capture evidence')+'</small></div>'+(run?'<button id="ws-capture">Capture '+method.toLowerCase()+' run</button>':'')+'</div>';
    const paired=draft.Present.evidence&&draft.Proposed.evidence;
    const evidence=snapshot?'<p class="study-evidence">Saved '+e(method.toLowerCase())+' run · '+e(snapshot.completed)+' units · '+e(format(snapshot.rate))+' units/h'+(paired?' · Proposed throughput change '+e(format(draft.Proposed.evidence.rate-draft.Present.evidence.rate))+' units/h':'')+'</p>':'';
    const stations=model.nodes.filter(n=>['processor','inspection'].includes(n.type));
    modal('Work study','<section id="ws-lab">'+source+evidence+'<div class="ws-tools"><label>Worksheet '+select('topic',Object.entries(topics).map(([k,v])=>[k,v[0]]),topic)+'</label><label>Method '+select('method',methods.map(m=>[m,m]),method)+'</label></div><p>'+e(topics[topic][1])+'</p><div class="ws-fields">'+form.map(f=>'<label>'+e(f[1])+control(f,t[f[0]],'')+'</label>').join('')+'</div>'+
      (cols.length?'<div class="ws-scroll"><table><thead><tr><th>#</th>'+cols.map(c=>'<th>'+e(c[1])+'</th>').join('')+'<th></th></tr></thead><tbody>'+t.rows.map((r,i)=>'<tr><td>'+(i+1)+'</td>'+cols.map(c=>'<td>'+control(c,r[c[0]],'data-row="'+i+'"')+'</td>').join('')+'<td><button data-remove="'+i+'" aria-label="Remove row '+(i+1)+'">×</button></td></tr>').join('')+'</tbody></table></div><button id="ws-add">Add row</button>':'')+
      (topic==='layout'?select('station',model.nodes.map(n=>[n.id,n.name]),'')+' <button id="ws-point">Add station waypoint</button><p>Click the floor plan to trace aisle turns, or enter coordinates in the table.</p>':'')+
      (topic==='worker'&&run?.workers?.length?'<div class="ws-tools"><label>Observe worker '+select('person',run.workers.map(w=>[w.id,'Worker '+w.id+(w.role?' · '+w.role:'')]),workerId)+'</label><label>From second<input type="number" id="ws-from" value="'+from+'"></label><label>Through second<input type="number" id="ws-to" value="'+to+'"></label></div>':'')+
      (run&&['material','operations','layout','form','worker','timing','sampling','standards'].includes(topic)?'<button id="ws-import">Use simulation '+((['form','standards'].includes(topic)||topic==='worker'&&!run.workers?.length)?'as study context':'data')+'</button>':'')+
      (topic==='productivity'&&run?'<button id="ws-use">Use '+e(run.completed)+' completed units from run</button>':'')+
      (topic==='timing'?'<button id="ws-watch">'+(watchStart===null?'Start observation':'Record elapsed seconds')+'</button>':'')+
      '<p class="study-evidence">'+e(t.provenance||'')+'</p><div id="ws-output" aria-live="polite">'+safeOutput(topic,t,method)+'</div><label>'+e(guides[topic])+'<textarea data-key="discussion" rows="3">'+e(t.discussion||'')+'</textarea></label>'+
      (['timing','standards'].includes(topic)&&stations.length?'<label>Simulation station '+select('station',stations.map(n=>[n.id,n.name]),station)+'</label> <button id="ws-apply">Apply standard time and save</button>':'')+
      (Object.keys(methodTimes(method)).length?'<section class="method-times"><strong>'+e(method)+' station standards</strong><p>'+Object.entries(methodTimes(method)).map(([id,s])=>e(model.nodes.find(n=>n.id===id)?.name||'Removed station')+' · '+e(format(s))+' s').join(' / ')+'</p><button id="ws-replay">Run this method</button></section>':'')+
      '<div class="ws-tools"><button id="ws-copy">Copy present worksheet to proposed</button><button id="ws-print">Print study report</button><button id="ws-save" class="primary">Save study</button></div><small id="ws-status" role="status"></small></section>');
    
    id('lab').addEventListener('click',ev=>{if(ev.target.closest('button')&&!['ws-save','ws-replay','ws-apply','ws-print'].includes(ev.target.id))checkpoint();});
    id('topic').onchange=ev=>{watchStart=null;topic=ev.target.value;refresh();};id('method').onchange=ev=>{watchStart=null;method=ev.target.value;refresh();};
    if(id('station')&&topic!=='layout')id('station').onchange=()=>{station=id('station').value;};
    if(id('capture'))id('capture').onclick=()=>{
      draft[method].stationTimes=Object.fromEntries(model.nodes.filter(n=>['processor','inspection'].includes(n.type)).map(n=>[n.id,n.seconds]));
      draft[method].crew=model.crew?structuredClone(model.crew):null;
      draft[method].evidence={completed:run.completed,rate:run.throughput,cost:run.cost,config:structuredClone(run.config),bottleneck:run.rows.find(r=>r.id===run.bottleneck)?.name||'—'};
      refresh();id('status').textContent='Run captured. Save study to keep this evidence.';
    };
    if(id('import'))id('import').onclick=()=>{
      try{
        if(id('person')){workerId=Number(id('person').value);from=id('from').valueAsNumber;to=id('to').valueAsNumber;}
        const data=simulationWorksheet(topic,model,run,id('station')?.value||station,workerId,from,to);
        if(data.rows?.length&&t.rows.length&&!confirm('Replace these worksheet rows with simulation data?'))return;
        if(data.observations&&t.observations&&!confirm('Replace the listed cycle times with simulated cycles?'))return;
        Object.assign(t,data);refresh();id('status').textContent=t.provenance;
      }catch(err){id('status').textContent=err.message;}
    };
    if(id('watch'))id('watch').onclick=()=>{
      if(watchStart===null)watchStart=performance.now();
      else{const seconds=((performance.now()-watchStart)/1000).toFixed(3);t.observations=[t.observations,seconds].filter(Boolean).join(', ');watchStart=null;}
      refresh();
    };
    id('lab').oninput=ev=>{const {row,key}=ev.target.dataset;if(!key)return;(row==null?t:t.rows[Number(row)])[key]=ev.target.value;id('output').innerHTML=safeOutput(topic,t,method);id('status').textContent='Unsaved changes';checkpoint();};
    id('lab').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{t.rows.splice(Number(b.dataset.remove),1);refresh();});
    if(id('add'))id('add').onclick=()=>{t.rows.push(Object.fromEntries(cols.map(([k,,type,v])=>[k,v??(Array.isArray(type)?type[0]:'')])));refresh();};
    if(id('point'))id('point').onclick=()=>{const n=model.nodes.find(n=>n.id===id('station').value);if(n)t.rows.push({x:n.x,y:n.y,label:n.name});refresh();};
    if(topic==='layout')id('output').onclick=ev=>{
      const plan=ev.target.closest('svg');if(!plan)return;
      const point=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(plan.getScreenCTM().inverse());
      t.rows.push({x:Math.round(point.x),y:Math.round(point.y),label:'Waypoint '+(t.rows.length+1)});checkpoint();refresh();
    };
    if(id('use'))id('use').onclick=()=>{t.output=run.completed;t.provenance='Simulation output · seed '+run.config.seed+' · '+run.config.warmup+'–'+run.config.horizon+' s';refresh();};
    id('copy').onclick=()=>{if(draft.Proposed[topic]&&!confirm('Replace the proposed worksheet with the present one?'))return;draft.Proposed[topic]=structuredClone(get(topic,'Present'));method='Proposed';refresh();};
    id('save').onclick=()=>{commit(()=>{model.workStudy=structuredClone(draft);},true);discardDraft();id('status').textContent='Study saved with this project.';};
    if(id('replay'))id('replay').onclick=()=>{
      const times=methodTimes(method);
      commit(()=>{model.workStudy=structuredClone(draft);if(Object.hasOwn(draft[method],'crew'))model.crew=structuredClone(draft[method].crew);for(const n of model.nodes)if(['processor','inspection'].includes(n.type)&&Number.isFinite(times[n.id])&&times[n.id]>=.001&&times[n.id]<=604800)n.seconds=times[n.id];});
      discardDraft();document.getElementById('dialog').close();rerun();
    };
    if(id('apply'))id('apply').onclick=()=>{try{const seconds=(topic==='timing'?duration(t):standardFromData(t)).standard;if(seconds<0.001||seconds>604800)throw Error('Station time must be between 0.001 and 604800 seconds.');const n=model.nodes.find(n=>n.id===id('station').value);draft[method].stationTimes={...Object.fromEntries(model.nodes.filter(n=>['processor','inspection'].includes(n.type)).map(n=>[n.id,n.seconds])),...methodTimes(method),[n.id]:seconds};commit(()=>{model.workStudy=structuredClone(draft);for(const st of model.nodes)if(Object.hasOwn(methodTimes(method),st.id))st.seconds=methodTimes(method)[st.id];});discardDraft();document.getElementById('dialog').close();notify('Applied '+format(seconds)+' s to '+n.name+'. Running updated model.');rerun();}catch(err){id('status').textContent=err.message;}};
    id('print').onclick=()=>{
      const win=window.open('','_blank');if(!win){id('status').textContent='Allow a new window to print.';return;}
      const blocks=methods.filter(m=>draft[m].evidence).map(m=>{const v=draft[m].evidence;return '<p><b>'+e(m)+' simulation</b> · '+e(v.completed)+' completed · '+e(format(v.rate))+' units/h · seed '+e(v.config.seed)+' · '+e(v.config.warmup)+'–'+e(v.config.horizon)+' s · bottleneck '+e(v.bottleneck)+'</p>';});for(const m of methods)for(const [k,data] of Object.entries(draft[m])){
        if(!Object.hasOwn(topics,k))continue;const fs=fields[k]||[],cs=columns[k]||[];
        blocks.push('<section><h2>'+e(m)+' · '+e(topics[k][0])+'</h2>'+fs.map(([id,label])=>'<p><b>'+e(label)+'</b> '+e(data[id])+'</p>').join('')+(data.rows?.length?'<table><tr><th>#</th>'+cs.map(c=>'<th>'+e(c[1])+'</th>').join('')+'</tr>'+data.rows.map((r,i)=>'<tr><td>'+(i+1)+'</td>'+cs.map(c=>'<td>'+e(r[c[0]])+'</td>').join('')+'</tr>').join('')+'</table>':'')+safeOutput(k,data,m)+'<p>'+e(data.provenance||'')+'</p></section>');
      }
      const discussion=methods.flatMap(m=>Object.entries(draft[m]).filter(([k,t])=>topics[k]&&t.discussion).map(([k,t])=>'<h3>'+e(m)+' · '+e(topics[k][0])+'</h3><p>'+e(guides[k])+'</p><p>'+e(t.discussion)+'</p>')).join('');
      win.document.write('<!doctype html><meta charset="utf-8"><title>Work study report</title><style>body{font:14px system-ui;color:#163e33;margin:2em}table{border-collapse:collapse;width:100%}td,th{padding:5px;border:1px solid #aaa}h2{break-after:avoid}tr,svg{break-inside:avoid}</style><h1>'+e(model.title)+' · Work study</h1>'+blocks.join('')+(discussion?'<h2>Discussion</h2>'+discussion:''));win.document.close();win.focus();win.print();
    };
  }
  refresh();if(recovered)id('status').textContent='Recovered your worksheet draft. Save study to include it in this project.';
}
