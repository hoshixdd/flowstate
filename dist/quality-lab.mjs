const eventNames={fault:'Fault introduced',detected:'Diverted to rework',repair:'Repair completed',scrap:'Scrapped',escape:'Escaped inspection'};
const measures={faults:'Faults introduced',detected:'Cartons sent to rework',scrapped:'Cartons scrapped',escaped:'Faulty cartons shipped',goodShipped:'Good cartons shipped'};
const number=v=>Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
const $=id=>document.getElementById(id);
const clock=t=>new Date(Math.floor(t)*1000).toISOString().slice(11,19)+(t>=86400?' +'+Math.floor(t/86400)+'d':'');
export function openQualityLab(ctx){
 const {model,run,modal,escape,apply,seek,trial,saveTrial,previous,download}=ctx,q=model.quality;
 const station=id=>escape(model.nodes.find(n=>n.id===id)?.name||id);
 const names=ids=>ids.split(',').map(id=>q.modes.find(m=>m.id===id)?.name||id).join(', ');
 const panel=(tab,html)=>{
   modal('Factory quality lab','<nav class="quality-tabs" aria-label="Quality study">'+[['results','Shift review'],['field','Workplace data'],['trial','Test a change']].map(([id,title])=>'<button data-qt="'+id+'" aria-pressed="'+(tab===id)+'">'+title+'</button>').join('')+'</nav>'+html);
   document.querySelectorAll('[data-qt]').forEach(b=>b.onclick=()=>views[b.dataset.qt]());
 };
 function review(){
   if(!run?.quality){panel('results','<p>Run this revision to review its quality events.</p>');return;}
   const s=run.quality,ranked=s.counts.slice().sort((a,b)=>b.faults-a.faults),total=ranked.reduce((n,r)=>n+r.faults,0);
   const events=run.qualityTrace.filter(e=>e.time>=run.config.warmup),units=[...new Set(events.map(e=>e.jobId))];
   panel('results','<h3>First-pass quality</h3><p><b class="q-yield">'+(s.inspected?number(100*s.firstGood/s.inspected)+'%':'—')+'</b> '+s.firstGood+' of '+s.inspected+' cartons arrived at the gate free of modeled faults.</p><div class="q-facts">'+[['Sent to rework',s.detected],['Recovered',s.repaired],['Scrapped',s.scrapped],['Shipped faulty',s.escaped],['Shipped good',s.goodShipped]].map(([k,v])=>'<div><b>'+v+'</b><small>'+k+'</small></div>').join('')+'</div>'+
     '<h3>Faults by source</h3><p>Ranked by occurrences during the observation window. A carton can have several faults.</p><div class="q-rank">'+ranked.map(r=>'<div><span>'+escape(r.name)+' <small>'+station(r.station)+'</small></span><progress max="'+Math.max(1,ranked[0].faults)+'" value="'+r.faults+'"></progress><b>'+r.faults+'</b><small>'+number(total?100*r.faults/total:0)+'%</small></div>').join('')+'</div>'+
     '<h3>Trace a carton</h3>'+(units.length?'<label>Carton with a quality event<select id="qUnit">'+units.map(id=>'<option value="'+id+'">Carton '+id+'</option>').join('')+'</select></label><div id="qTrace"></div><button id="qExport">Export quality event CSV</button>':'<p>No quality events in this observation window.</p>'));
   if(!units.length)return;
   function trace(){
     const rows=run.qualityTrace.filter(e=>e.jobId===+$('qUnit').value);
     $('qTrace').innerHTML=rows.map((e,i)=>'<div class="listitem"><div><strong>'+eventNames[e.kind]+' · '+station(e.stationId)+'</strong><small>'+escape(names(e.mode))+'</small></div><button data-jump="'+i+'">Replay '+clock(e.time)+'</button></div>').join('');
     document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>seek(rows[+b.dataset.jump]));
   }
   $('qUnit').onchange=trace;trace();
   $('qExport').onclick=()=>{
     const csvCell=v=>{let s=String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
     const rows=[['Simulation seconds','Carton','Station','Event','Defect'],...events.map(e=>[e.time,e.jobId,model.nodes.find(n=>n.id===e.stationId)?.name,eventNames[e.kind],names(e.mode)])];
     download('flowstate-quality-events.csv','\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv');
   };
 }
 function field(){
   const saved=q.field||{};
   const input=(id,val,min,max,step='1',required=true)=>'<input type="number" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" '+(required?'required':'')+' value="'+escape(val??'')+'">';
   panel('field','<h3>Calibrate a shift</h3><p>Count faults at their source. Enter the number of cartons checked there and how many showed that fault. Leave both counts empty to keep the stated probability.</p><form id="qField"><div class="datagrid"><table><thead><tr><th>Fault / station</th><th>Checked</th><th>Faulty</th><th>Model rate</th></tr></thead><tbody>'+q.modes.map((m,i)=>'<tr><th>'+escape(m.name)+'<small>'+station(m.station)+'</small></th><td>'+input('qN'+i,saved[m.id]?.n,1,1e8,1,false)+'</td><td>'+input('qD'+i,saved[m.id]?.d,0,1e8,1,false)+'</td><td>'+number(m.rate)+'%</td></tr>').join('')+'</tbody></table></div><div class="grid2"><label>Faulty cartons caught at gate (%)'+input('qCatch',q.detection,0,100,'any')+'</label><label>Reworked cartons recovered (%)'+input('qRecover',q.recovery,0,100,'any')+'</label></div><label>Shift or sample reference<input id="qRef" maxlength="100" value="'+escape(q.reference||'')+'" placeholder="e.g. Line A, morning shift"></label><label>Good cartons shipped on a separate observed shift (optional)'+input('qActual',q.actual,0,1e8,1,false)+'</label><p class="muted">Match the run duration, arrivals, staffing and starting inventory. This model starts empty. Compare a separate shift of the same length and exclude warm-up from both totals.</p><p id="qError" role="alert"></p><button class="primary">Save workplace data and run</button></form>'+
    (q.actual!=null&&run?.quality?'<p><b>Baseline check</b> · '+q.actual+' observed good cartons versus '+run.quality.goodShipped+' simulated in this run. Difference '+number(run.quality.goodShipped-q.actual)+' cartons.</p>':''));
   const investigation=document.createElement('details');
   investigation.innerHTML='<summary>Define workplace defects and record a cause to investigate</summary><p>Describe an observable defect at each station. Record the evidence you would need to confirm a cause on the floor.</p>'+
     q.modes.map((m,i)=>'<label>'+station(m.station)+' defect<input id="qName'+i+'" maxlength="80" required value="'+escape(m.name)+'"></label>').join('')+
     '<label>Suspected cause and supporting observation<textarea id="qCause" maxlength="1500" rows="2" placeholder="e.g. Underfilled cartons clustered after hopper refills.">'+escape(q.cause||'')+'</textarea></label>'+
     '<label>Countermeasure and verification plan<textarea id="qPlan" maxlength="1500" rows="2" placeholder="e.g. Check the dose after each refill. Compare the next shift at the same volume.">'+escape(q.plan||'')+'</textarea></label>';
   $('qField').prepend(investigation);
   q.modes.forEach((m,i)=>{ $('qN'+i).setAttribute('aria-label',m.name+' cartons checked');$('qD'+i).setAttribute('aria-label',m.name+' faulty cartons'); });
   $('qField').onsubmit=e=>{
     e.preventDefault();const next=structuredClone(q);next.field={};next.reference=$('qRef').value.trim();next.actual=$('qActual').value===''?null:$('qActual').valueAsNumber;
     next.cause=$('qCause').value.trim();next.plan=$('qPlan').value.trim();
     for(const [i,m] of next.modes.entries()){
       const name=$('qName'+i).value.trim();
       if(!name){investigation.open=true;$('qError').textContent='Give every workplace defect an observable name.';return;}
       m.name=name;
       const n=$('qN'+i),d=$('qD'+i);
       if(!n.value&&!d.value)continue;
       if(!n.value||!d.value||d.valueAsNumber>n.valueAsNumber){$('qError').textContent='Enter both counts for '+m.name+' and keep faulty cartons at or below cartons checked.';return;}
       next.field[m.id]={n:n.valueAsNumber,d:d.valueAsNumber};m.rate=100*d.valueAsNumber/n.valueAsNumber;
     }
     next.detection=$('qCatch').valueAsNumber;next.recovery=$('qRecover').valueAsNumber;apply(next);
   };
 }
 function experiment(){
   const choices=[...q.modes.map((m,i)=>({id:'mode'+i,label:m.name+' occurrence',value:m.rate,index:i})),{id:'detection',label:'Gate detection',value:q.detection},{id:'recovery',label:'Repair recovery',value:q.recovery}];
   function table(report){
     if(!report)return '';
     return '<h3>Matched shift results</h3><p>'+escape(report.label)+' · '+number(report.from)+'% → '+number(report.to)+'%. '+report.reps+' paired runs, starting seed '+report.seed+'. Values are cartons per observation window, except fault occurrences.</p><div class="datagrid"><table><thead><tr><th>Measure</th><th>Current</th><th>Proposed</th><th>Mean change [95% interval]</th></tr></thead><tbody>'+Object.entries(measures).map(([key,title])=>{const row=report.metrics[key],d=row.delta;return '<tr><th>'+title+'</th><td>'+number(row.before)+'</td><td>'+number(row.after)+'</td><td>'+number(d.mean)+' ['+number(d.mean-d.margin)+', '+number(d.mean+d.margin)+']</td></tr>';}).join('')+'</tbody></table></div><p class="muted">The interval describes simulation variability under these assumptions. Test the proposed change on the floor and measure a fresh sample.</p>';
   }
   panel('trial','<h3>Test one process change</h3><p>Enter the rate you expect after a change, such as a filler adjustment. Each pair uses the same shift seed, demand, staffing and duration.</p><form id="qTrial"><label>Change to test<select id="qChoice">'+choices.map(c=>'<option value="'+c.id+'">'+escape(c.label)+'</option>').join('')+'</select></label><div class="grid2"><label>Proposed rate (%)<input id="qTo" type="number" step="any" min="0" max="100" required></label><label>Paired shifts<input type="number" id="qReps" min="2" max="30" value="10" required></label></div><p id="qBase"></p><button class="primary">Compare shifts</button></form><div id="qOutcome" aria-live="polite">'+table(previous())+'</div>');
   function candidate(c,to){
     const proposed=structuredClone(model);
     if(c.index!=null){
       const mode=proposed.quality.modes[c.index];mode.rate=to;
       if(proposed.quality.field)delete proposed.quality.field[mode.id];
     }else proposed.quality[c.id]=to;
     proposed.quality.actual=null;
     return proposed;
   }
   function addActions(report,out){
     const c=choices.find(choice=>choice.id===report?.parameter);
     if(!c)return;
     out.insertAdjacentHTML('beforeend','<div class="group"><button id="qProposal">Open proposed factory as a copy</button><button id="qCompareCSV">Export comparison CSV</button></div>');
     $('qProposal').onclick=()=>ctx.openProposal(candidate(c,report.to));
     $('qCompareCSV').onclick=()=>{
       const rows=[['Measure','Current mean','Proposed mean','Mean change','Lower 95%','Upper 95%','Paired runs','First seed','Warm-up s','Horizon s','Parameter','Current %','Proposed %']];
       for(const [key,label] of Object.entries(measures)){const r=report.metrics[key],d=r.delta;rows.push([label,r.before,r.after,d.mean,d.mean-d.margin,d.mean+d.margin,report.reps,report.seed,ctx.config.warmup,ctx.config.horizon,report.parameter,report.from,report.to]);}
       download('flowstate-quality-comparison.csv',rows.map(r=>r.join(',')).join('\r\n'),'text/csv');
     };
   }
   addActions(previous(),$('qOutcome'));
   function select(){const c=choices[$('qChoice').selectedIndex];$('qBase').textContent='Current rate: '+number(c.value)+'%';$('qTo').value=c.value;}
   $('qChoice').onchange=select;select();
   $('qTrial').onsubmit=async e=>{
     e.preventDefault();const c=choices[$('qChoice').selectedIndex],to=$('qTo').valueAsNumber,reps=$('qReps').valueAsNumber,proposed=candidate(c,to),out=$('qOutcome'),button=e.target.querySelector('button');
     button.disabled=true;out.textContent='Comparing shifts…';
     try{const metrics=await trial(proposed,reps);const report={metrics,parameter:c.id,from:c.value,to,label:c.label,reps,seed:ctx.config.seed};saveTrial(report);out.innerHTML=table(report);if(out.isConnected)addActions(report,out);}
     catch(err){out.textContent=err.message;}finally{button.disabled=false;}
   };
 }
 const views={results:review,field,trial:experiment};review();
}
