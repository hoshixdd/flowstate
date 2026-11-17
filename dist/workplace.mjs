import {fixtures,templates} from './model.mjs';
import {validateModel} from './engine.mjs';

const $=id=>document.getElementById(id);
const methods=['bakery','printshop','laundry'];
const triggers={high:'Setting above threshold',low:'Setting below threshold',wait:'Pre-service wait exceeds seconds',restart:'Within seconds after a station restart',lot:'First N starts from each material lot'};
const fmt=v=>Number(v).toLocaleString(undefined,{maximumFractionDigits:1});

export function insertStation(model,node,from,to){
  const edge=model.edges.findIndex(e=>e[0]===from&&e[1]===to);
  if(edge<0)throw Error('Select an existing connection.');
  model.nodes.push(node);
  model.edges.splice(edge,1,[from,node.id],[node.id,to]);
  const source=model.nodes.find(n=>n.type==='source').id;
  for(const p of model.products||[]){
    if(!p.route?.length)continue;
    const i=p.route.findIndex((s,i)=>s===to&&(i?p.route[i-1]:source)===from);
    if(i>=0)p.route.splice(i,0,node.id);
  }
}
function installGate(m){
  const sink=m.nodes.find(n=>n.type==='sink');
  if(!sink)throw Error('Connect the line to a sink before adding a quality rule.');
  const id=()=>crypto.randomUUID(),gate=id(),repair=id();
  for(const edge of m.edges)if(edge[1]===sink.id)edge[1]=gate;
  m.edges.push([gate,sink.id],[gate,repair],[repair,sink.id]);
  for(const p of m.products||[])if(p.route?.length)p.route.splice(-1,0,gate);
  m.nodes.push({id:gate,name:'Quality inspection',fixture:'vision',type:'inspection',seconds:15,x:sink.x,y:sink.y+125},
    {id:repair,name:'Rework bench',fixture:'repair',type:'processor',seconds:30,x:sink.x+215,y:sink.y+125});
  m.quality={gate,repair,detection:85,recovery:90,modes:[]};
}

export function openWorkplace({model,run,selected,modal,escape,apply,openExample,replay,baseline,tab='methods'}){
 const opt=(v,t)=>'<option value="'+escape(v)+'">'+escape(t)+'</option>';
 const pick=(id,label,items)=>'<label>'+label+'<select id="'+id+'">'+items.map(([a,b])=>opt(a,b)).join('')+'</select></label>';
 const num=(id,label,value,min,max,step='any')=>'<label>'+label+'<input required id="'+id+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+escape(value)+'"></label>';
 const ids=()=>model.nodes.filter(n=>['processor','inspection'].includes(n.type));
 const station=id=>model.nodes.find(n=>n.id===id);
 const tabs={methods:'Workspaces',add:'Add station',condition:'Fault rules',maintenance:'Maintenance',results:'Shift review'};
 function screen(active,body){
   modal('Workplace studio','<nav class="quality-tabs" aria-label="Workplace tools">'+Object.entries(tabs).map(([k,v])=>'<button data-wtab="'+k+'" aria-pressed="'+(k===active)+'">'+v+'</button>').join('')+'</nav>'+body);
   document.querySelectorAll('[data-wtab]').forEach(b=>b.onclick=()=>views[b.dataset.wtab]());
 }
 function submit(id,fn){
   $(id).onsubmit=e=>{e.preventDefault();try{
     const m=structuredClone(model);fn(m);
     const issues=validateModel(m);if(issues.length)throw Error(issues[0]);
     apply(m);
   }catch(err){$('wpError').textContent=err.message;}};
 }
 const footer='<p id="wpError" role="alert"></p><button class="primary">Apply and run</button></form>';
 function examples(){
   const detail={bakery:'Mix dough, proof trays, bake and cool rolls. Test a hotter oven.',printshop:'Prepare, print, trim and crease jobs. Study registration after restarts.',laundry:'Wash, dry, fold and stack linen. Test the effect of a queue before folding.'};
   screen('methods','<h3>Choose a working method</h3>'+methods.map(k=>'<button class="choice" data-method="'+k+'">'+templates[k].title+'<span>'+detail[k]+'</span></button>').join('')+'<p>Study times and defect probabilities are illustrative. Calibrate them with your own process observations.</p>');
   document.querySelectorAll('[data-method]').forEach(b=>b.onclick=()=>openExample(b.dataset.method));
 }
 function add(){
   const edges=model.edges.filter(([a,b])=>a!==model.quality?.repair&&a!==model.quality?.gate&&b!==model.quality?.repair);
   if(!edges.length){screen('add','<p>Use + Station and Connect in the 2D editor to create a connected line first.</p>');return;}
   screen('add','<h3>Insert a station into the line</h3><form id="wpAdd">'+pick('wpEdge','Insert between',edges.map(([a,b],i)=>[i,station(a).name+' → '+station(b).name]))+pick('wpFixture','Equipment or method',Object.entries(fixtures).map(([k,v])=>[k,v[0]]))+'<label>Station name<input id="wpName" required maxlength="60"></label><div class="grid2">'+num('wpSeconds','Seconds per job',30,.001,604800)+num('wpCapacity','Parallel jobs',1,1,64,1)+'</div><label class="checkline"><input id="wpAuto" type="checkbox"> Runs unattended during this step</label>'+
   (model.crew?.roster?pick('wpWorker','Worker to train for a staffed station',model.crew.roster.map((w,i)=>[i,'W'+(i+1)+' · '+w.role])):'')+footer);
   const preset=()=>{const v=fixtures[$('wpFixture').value];$('wpName').value=v[0];$('wpSeconds').value=v[1];$('wpAuto').checked=v[2];};
   $('wpFixture').onchange=preset;preset();
   submit('wpAdd',m=>{
     const [from,to]=edges[+$('wpEdge').value],a=station(from),b=station(to);
     const n={id:crypto.randomUUID(),fixture:$('wpFixture').value,name:$('wpName').value.trim(),type:'processor',seconds:$('wpSeconds').valueAsNumber,servers:$('wpCapacity').valueAsNumber,unattended:$('wpAuto').checked,x:(a.x+b.x)/2,y:(a.y+b.y)/2+100};
     insertStation(m,n,from,to);if(m.crew?.roster&&!n.unattended)m.crew.roster[+$('wpWorker').value].stations.push(n.id);
   });
 }
 function condition(){
   const available=ids().filter(n=>n.type==='processor'&&n.id!==model.quality?.repair);
   if(!available.length){screen('condition','<p>Add a processing station first.</p>');return;}
   const modes=model.quality?.modes||[];
   screen('condition','<h3>Condition-dependent defects</h3><form id="wpCondition">'+pick('wpRule','Fault to model',[...modes.map((m,i)=>[i,m.name]),['new','Add a new fault']])+pick('wpSource','Fault originates at',available.map(n=>[n.id,n.name]))+'<label>Observable defect<input id="wpFault" required maxlength="80"></label>'+
     pick('wpTrigger','Operating condition',[['none','Constant rate'],...Object.entries(triggers)])+'<div class="grid2">'+num('wpSetting','Current station setting',0,-100000,100000)+num('wpThreshold','Trigger threshold',0,-100000,100000)+'</div><div class="grid2">'+num('wpRate','Normal defect chance (%)',3,0,100)+num('wpRisk','Chance while exposed (%)',30,0,100)+'</div><p id="wpHint" class="muted"></p>'+
     (!model.quality?'<p>Applying the first rule adds a final inspection and rework bench. Inspection catches 85% of faulty units and 90% of rework succeeds by default. Adjust these in Quality lab.</p>':'')+footer);
   function hint(){
     const type=$('wpTrigger').value;
     $('wpSetting').disabled=!['high','low'].includes(type);$('wpThreshold').disabled=$('wpRisk').disabled=type==='none';
     $('wpHint').textContent={high:'Use the same unit for the setting and threshold, such as °C.',low:'Both inputs use the same unit.',wait:'Wait is measured from joining this station to service start, including worker travel.',restart:'The interval starts when a repair or planned stop ends.',lot:'Requires material lots. Counts service starts from the same lot at this station.',none:'Each eligible unit uses the normal rate.'}[type];
   }
   function fill(){const old=modes[Number($('wpRule').value)],id=old?.station??(available.find(n=>n.id===selected)||available[0]).id;
     $('wpSource').value=id;$('wpSetting').value=station(id).setting??0;$('wpFault').value=old?.name??'';$('wpRate').value=old?.rate??3;
     $('wpTrigger').value=old?.condition?.type??'none';$('wpThreshold').value=old?.condition?.threshold??0;$('wpRisk').value=old?.condition?.rate??30;hint();}
   $('wpRule').onchange=fill;$('wpSource').onchange=()=>{$('wpSetting').value=station($('wpSource').value).setting??0;};$('wpTrigger').onchange=hint;fill();
   submit('wpCondition',m=>{
     if(!m.quality){
       installGate(m);
       if(m.crew?.roster)m.crew.roster[0].stations.push(m.quality.gate,m.quality.repair);
     }
     const index=$('wpRule').value,mode=index==='new'?{id:'m-'+crypto.randomUUID()}:m.quality.modes[+index];
     mode.name=$('wpFault').value.trim();mode.station=$('wpSource').value;mode.rate=$('wpRate').valueAsNumber;
     const type=$('wpTrigger').value;if(type==='none')delete mode.condition;else mode.condition={type,threshold:$('wpThreshold').valueAsNumber,rate:$('wpRisk').valueAsNumber};
     if(['high','low'].includes(type))m.nodes.find(n=>n.id===mode.station).setting=$('wpSetting').valueAsNumber;
     if(index==='new')m.quality.modes.push(mode);
   });
 }
 function maintenance(){
   if(!ids().length){screen('maintenance','<p>Add a processing station first.</p>');return;}
   screen('maintenance','<h3>Equipment availability</h3><form id="wpReliability">'+pick('wpMachine','Station',ids().map(n=>[n.id,n.name]))+'<label class="checkline"><input type="checkbox" id="wpEnabled"> Simulate age-related breakdowns</label><div class="grid2">'+num('wpLife','Characteristic online life (s)',3600,1,604800)+num('wpRepair','Repair duration (s)',120,1,604800)+num('wpAge','Preventive service age (s, 0 = off)',0,0,604800)+num('wpPm','Service duration (s)',60,0,604800)+'</div><p>Failure age varies by seed (Weibull shape 2). Each repair or preventive service resets equipment age. Age includes idle online time. An outage pauses all jobs at this station and work resumes afterward.</p>'+footer);
   $('wpMachine').value=ids().find(n=>n.id===selected)?.id??ids().find(n=>n.reliability)?.id??ids()[0].id;
   function fill(){const r=station($('wpMachine').value).reliability;$('wpEnabled').checked=!!r;$('wpLife').value=r?.life??3600;$('wpRepair').value=r?.repair??120;$('wpAge').value=r?.pmAge??0;$('wpPm').value=r?.pmTime??60;}
   $('wpMachine').onchange=fill;fill();
   submit('wpReliability',m=>{const n=m.nodes.find(n=>n.id===$('wpMachine').value);if(!$('wpEnabled').checked)delete n.reliability;else n.reliability={life:$('wpLife').valueAsNumber,repair:$('wpRepair').valueAsNumber,pmAge:$('wpAge').valueAsNumber,pmTime:$('wpPm').valueAsNumber};});
 }
 function results(){
   if(!run){screen('results','<p>Run the current revision to review conditions and stops.</p>');return;}
   const stops=Object.entries(run.calendars??{}).flatMap(([id,list])=>list.filter(s=>s.end>run.config.warmup&&s.start<run.config.horizon).map(s=>({...s,id}))).sort((a,b)=>a.start-b.start);
   const rows=(run.quality?.counts||[]).map(c=>'<tr><th>'+escape(c.name)+'</th><td>'+c.exposedFaults+' / '+c.exposed+'</td><td>'+(c.faults-c.exposedFaults)+' / '+(c.opportunities-c.exposed)+'</td></tr>').join('');
   const summary=workplaceSummary(run);
   screen('results','<h3>Shift results</h3><div class="datagrid"><table><tr><th>Measure</th>'+(baseline?'<th>Before</th>':'')+'<th>Current</th></tr>'+[['Units completed','completed'],['Fault occurrences','faults'],['Station downtime (min)','minutes']].map(([label,key])=>'<tr><th>'+label+'</th>'+(baseline?'<td>'+fmt(baseline[key])+'</td>':'')+'<td>'+fmt(summary[key])+'</td></tr>').join('')+'</table></div>'+(rows?'<h3>Faults / opportunities</h3><div class="datagrid"><table><tr><th>Defect</th><th>Condition present</th><th>Condition absent</th></tr>'+rows+'</table></div>':'')+'<h3>Equipment stops</h3>'+(stops.length?'<p>'+stops.length+' stops overlap this observation window. Select a stop to replay it.</p>'+stops.slice(0,50).map((s,i)=>'<button class="choice" data-stop="'+i+'">'+escape(station(s.id).name)+' · '+s.reason+'<span>'+fmt(s.start)+'–'+fmt(s.end)+' s</span></button>').join(''):'<p>No equipment stop in this observation window.</p>'));
   document.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{const s=stops[+b.dataset.stop];replay({time:Math.max(s.start,run.config.warmup),stationId:s.id,kind:s.reason});});
 }
 const views={methods:examples,add,condition,maintenance,results};views[tab]();
}
export function workplaceSummary(r){return {completed:r.completed,faults:(r.quality?.counts??[]).reduce((a,v)=>a+v.faults,0),minutes:r.rows.reduce((a,v)=>a+r.config.horizon-r.config.warmup-v.available,0)/60};}

