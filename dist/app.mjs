import {openStudy} from './study-lab.mjs';
import {kinds,templates,template} from './model.mjs';
import {validateModel,normalizeConfig,frameAt,VERSION,mainRouteIds,normalizeProducts} from './engine.mjs';
import {createFactory} from './factory.mjs';
const $=id=>document.getElementById(id);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID(), clone=structuredClone, storageKey='flowstate.studio.v2';
const workerURL=new URL('./worker.mjs',import.meta.url);
const defaults={horizon:3600,warmup:0,seed:42,reps:1};
const fmt=(v,d=1)=>v==null?'—':v.toLocaleString(undefined,{maximumFractionDigits:d});
const timeLabel=t=>[Math.floor(t/3600),Math.floor((t%3600)/60),Math.floor(t%60)].map(v=>String(v).padStart(2,'0')).join(':');
function record(model,settings=defaults){return {id:uuid(),model:clone(model),config:{...settings},revision:1,archives:[],experiments:[],updated:new Date().toISOString(),archived:false};}
function ensureProducts(){if(!Array.isArray(m.products)||!m.products.length){const source=m.nodes.find(n=>n.type==='source');m.products=[{id:'unit',name:'Unit',color:'#d8fc81',interval:source?.seconds??30,distribution:source?.distribution??'fixed',route:[]}];}return m.products;}
let db,warning='';
try{
  const saved=localStorage.getItem(storageKey);
  if(saved){db=JSON.parse(saved);if(db.version!==2||!db.projects.some(p=>p.id===db.active))throw Error('Invalid workspace');}
  else{const legacy=JSON.parse(localStorage.getItem('flowstate.process.v1')||'null');const first=record(legacy?.version===1&&Array.isArray(legacy.nodes)?legacy:template('lab'));db={version:2,active:first.id,projects:[first]};}
}catch{const first=record(template('lab'));db={version:2,active:first.id,projects:[first]};warning='Previous data could not be loaded';}
let project=db.projects.find(p=>p.id===db.active),m=project.model,selected=m.nodes.find(n=>n.type==='processor'&&n.name==='Assembly')?.id??m.nodes[0]?.id;
let past=[],future=[],result=null,worker=null,view='3d',cursor=0,playing=false,raf=0,lastPaint=0,noticeTimer,linkMode=false,linkFrom=null;
function notify(text){$('notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',4200);}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(db));warning='';}catch{warning='Storage full or unavailable · export project';} $('save').textContent=warning||'Saved on this device';}
function modal(title,html){$('dialogtitle').textContent=title;$('dialogbody').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
$('close').onclick=()=>$('dialog').close();
const factory=createFactory($('factory'),id=>selectStation(id));
function selectStation(id){selected=id;render();}
function stopPlaying(){playing=false;cancelAnimationFrame(raf);$('play').textContent='▶';}
function cancelRun(){if(worker){worker.terminate();worker=null;} $('run').textContent='▶  Run simulation';}
function clearRun(){cancelRun();stopPlaying();result=null;cursor=0;}
function remember(){project.archives.unshift({revision:project.revision,model:clone(m),config:{...project.config},at:project.updated});project.archives=project.archives.slice(0,12);}
function commit(edit,keepRun=false){past.push({model:clone(m),config:{...project.config}});past=past.slice(-60);future=[];remember();edit();project.model=m;project.revision++;project.updated=new Date().toISOString();if(!keepRun)clearRun();save();render();}
function history(from,to){if(!from.length)return;remember();to.push({model:clone(m),config:{...project.config}});const state=from.pop();m=project.model=state.model;project.config=state.config;project.revision++;project.updated=new Date().toISOString();clearRun();save();render();}
$('undo').onclick=()=>history(past,future);$('redo').onclick=()=>history(future,past);
function setView(next){view=next;$('stage').hidden=view!=='3d';$('two').hidden=view!=='2d';$('view3d').setAttribute('aria-pressed',view==='3d');$('view2d').setAttribute('aria-pressed',view==='2d');if(view==='3d')paint();else draw();}
$('view3d').onclick=()=>setView('3d');$('view2d').onclick=()=>setView('2d');$('fit').onclick=()=>factory.reset();$('focusStation').onclick=()=>factory.focus();
function paint(){const run=result?.primary;const frame=frameAt(m,run,cursor);if(view==='3d')factory.update(m,frame,selected,$('floorLayer').value,run);$('scrub').value=cursor;$('clock').textContent=timeLabel(cursor);}
function play(){
 if(!result)return; if(playing){stopPlaying();return;}if(cursor>=project.config.horizon)cursor=0;
 playing=true;$('play').textContent='Ⅱ';let then=performance.now();lastPaint=0;
 function tick(now){if(!playing)return;cursor=Math.min(project.config.horizon,cursor+(now-then)*Number($('speed').value)/1000);then=now;
 if(now-lastPaint>70||cursor>=project.config.horizon){paint();lastPaint=now;}if(cursor>=project.config.horizon){stopPlaying();return;}raf=requestAnimationFrame(tick);}
 raf=requestAnimationFrame(tick);
}
$('play').onclick=play;$('scrub').oninput=()=>{stopPlaying();cursor=+$('scrub').value;paint();};
$('stationPick').onchange=()=>selectStation($('stationPick').value);
function render(){
 const n=m.nodes.find(n=>n.id===selected)||m.nodes[0];selected=n?.id;
 $('title').textContent=m.title;$('category').textContent=m.category+' · Revision '+project.revision;$('save').textContent=warning||'Saved on this device';
 const products=normalizeProducts(m);$('undo').disabled=!past.length;$('redo').disabled=!future.length;$('count').textContent=m.nodes.length+' stations · '+m.edges.length+' connections · '+products.length+' product'+(products.length===1?'':'s');
 $('productLegend').innerHTML=products.map(p=>'<span title="'+escape(productRouteLabel(p.route))+'"><i class="swatch" style="background:'+escape(p.color)+'"></i>'+escape(p.name)+'</span>').join('');
 $('stageStatus').textContent=floorStatus();
 $('link').setAttribute('aria-pressed',String(linkMode));$('link').textContent=linkMode?'Cancel connect':'Connect';
 $('stationPick').innerHTML=m.nodes.map(s=>'<option value="'+escape(s.id)+'" '+(s.id===selected?'selected':'')+'>'+escape(s.name)+'</option>').join('');
 $('scrub').max=project.config.horizon;$('scrub').disabled=$('play').disabled=!result;
 draw();inspector(n);overview();analytics();summary();setView(view);paint();
}
function coordinates(event){return new DOMPoint(event.clientX,event.clientY).matrixTransform($('graph').getScreenCTM().inverse());}
const colors={source:'#d6e9c9',processor:'#dce6f1',inspection:'#f3e4c5',queue:'#e5dbef',sink:'#d4e9e0'};
const glyph={source:'↗',processor:'▤',sink:'✓',inspection:'◇',queue:'≡'};
function draw(){
 const nodes=m.nodes,svg=$('graph'),width=190,height=76;
 const links=m.edges.map(([a,b])=>{const A=nodes.find(n=>n.id===a),B=nodes.find(n=>n.id===b);if(!A||!B)return '';
 const dx=B.x-A.x,dy=B.y-A.y;let path;
 if(Math.abs(dx)>Math.abs(dy)){const x=A.x+(dx>0?width:0),y=A.y+height/2,ex=B.x+(dx>0?-7:width+7),ey=B.y+height/2,mid=(x+ex)/2;path='M'+x+' '+y+' H'+mid+' V'+ey+' H'+ex;}
 else{const x=A.x+width/2,y=A.y+(dy>=0?height:0),ex=B.x+width/2,ey=B.y+(dy>=0?-7:height+7),mid=(y+ey)/2;path='M'+x+' '+y+' V'+mid+' H'+ex+' V'+ey;}
 return '<path d="'+path+'" fill="none" stroke="#728875" stroke-width="1.8" marker-end="url(#arrow)"/>';}).join('');
 svg.setAttribute('viewBox','0 0 '+Math.max(820,...nodes.map(n=>n.x+216))+' '+Math.max(365,...nodes.map(n=>n.y+105)));
 svg.innerHTML='<defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="#728875"/></marker></defs>'+links+nodes.map(n=>{
 const active=n.id===selected,detail=n.type==='source'?(n.distribution&&n.distribution!=='fixed'?'Mean ':'Every ')+n.seconds+' s':['processor','inspection'].includes(n.type)?n.seconds+' s / unit':n.type==='sink'?'Completed units':'FIFO · '+(n.limit==null?'unlimited':n.limit+' places');
 return '<g tabindex="0" role="button" aria-label="'+escape(n.name)+'" data-id="'+escape(n.id)+'" transform="translate('+n.x+' '+n.y+')"><rect width="190" height="76" rx="10" fill="'+(active?'#f6f9ec':'#fff')+'" stroke="'+(active?'#58783e':'#aebfae')+'" stroke-width="'+(active?2.5:1.2)+'"/><rect x="12" y="13" width="28" height="28" rx="7" fill="'+colors[n.type]+'"/><text x="26" y="33" text-anchor="middle" font-size="19" fill="#284536">'+glyph[n.type]+'</text><text x="49" y="23" font-size="9" letter-spacing="1.2" fill="#576958">'+kinds[n.type].toUpperCase()+'</text><text x="49" y="43" font-size="16" font-weight="620" fill="#203a2c">'+escape(n.name.length>15?n.name.slice(0,14)+'…':n.name)+'</text><text x="13" y="64" font-size="11" fill="#536958">'+escape(detail)+'</text></g>';}).join('');
}
let drag=null;
$('link').onclick=()=>{linkMode=!linkMode;linkFrom=null;notify(linkMode?'Choose a source station, then its destination.':'Connection mode closed.');render();};
$('graph').onpointerdown=e=>{const g=e.target.closest('g[data-id]');if(!g)return;const n=m.nodes.find(n=>n.id===g.dataset.id);drag={id:n.id,at:coordinates(e),x:n.x,y:n.y};$('graph').setPointerCapture(e.pointerId);};
$('graph').onpointermove=e=>{if(!drag)return;const p=coordinates(e);const group=Array.from($('graph').querySelectorAll('g[data-id]')).find(g=>g.dataset.id===drag.id);
 group?.setAttribute('transform','translate('+Math.max(0,drag.x+p.x-drag.at.x)+' '+Math.max(0,drag.y+p.y-drag.at.y)+')');};
 $('graph').onpointerup=e=>{if(!drag)return;const d=drag,p=coordinates(e),target=e.target.closest('g[data-id]')?.dataset.id;drag=null;selected=d.id;
 if(linkMode&&Math.hypot(p.x-d.at.x,p.y-d.at.y)<=4){
  if(!linkFrom){linkFrom=d.id;notify('Choose the destination station.');render();return;}
  if(linkFrom===d.id){linkFrom=null;notify('Choose a different destination station.');render();return;}
  const from=linkFrom,to=target||d.id;linkFrom=null;commit(()=>{m.edges=m.edges.filter(edge=>edge[0]!==from);m.edges.push([from,to]);});notify('Connection updated.');return;
 }
 if(Math.hypot(p.x-d.at.x,p.y-d.at.y)>4)commit(()=>{const n=m.nodes.find(n=>n.id===d.id);n.x=Math.max(0,Math.round(d.x+p.x-d.at.x));n.y=Math.max(0,Math.round(d.y+p.y-d.at.y));});else render();};
$('graph').onpointercancel=()=>{drag=null;draw();};
$('graph').onkeydown=e=>{const id=e.target.dataset.id;if(id&&['Enter',' '].includes(e.key)){e.preventDefault();selected=id;render();$('name')?.focus();}};
function inspector(n){
 if(!n){$('inspect').innerHTML='<p>Add a station to begin.</p>';return;}
 const timed=['source','processor','inspection'].includes(n.type),proc=['processor','inspection'].includes(n.type),next=m.edges.find(e=>e[0]===n.id)?.[1];
 const usedBy=normalizeProducts(m).filter(p=>!p.route.length||p.route.includes(n.id)).map(p=>p.name);
 const options=(items,current)=>items.map(([v,label])=>'<option value="'+escape(v)+'" '+(String(v)===String(current)?'selected':'')+'>'+escape(label)+'</option>').join('');
 const field=(title,id,value,min,max,step=1)=>'<label>'+title+'<input id="'+id+'" type="number" value="'+escape(value)+'" min="'+min+'" max="'+max+'" step="'+step+'"></label>';
 $('inspect').innerHTML='<span class="kind">'+kinds[n.type]+'</span><form id="edit"><h3>'+escape(n.name)+'</h3><p class="inspector-context">'+(usedBy.length?escape(usedBy.join(', '))+' flow'+(usedBy.length===1?'':'s')+' use this station.':'No product flow uses this station yet.')+'</p><label>Station name<input id="name" maxlength="48" required value="'+escape(n.name)+'"></label>'+
 (timed?field(n.type==='source'?'Mean arrival interval (s)':'Mean service time (s)','seconds',n.seconds,.001,604800,'any'):'')+
 (n.type!=='sink'?'<label>Next station<select id="next">'+options([['','Disconnected'],...m.nodes.filter(s=>s.id!==n.id&&s.type!=='source').map(s=>[s.id,s.name])],next??'')+'</select></label>':'')+
 (n.type!=='sink'?'<details class="advanced"><summary>Operating rules</summary>'+
 (timed?'<label>Timing distribution<select id="distribution">'+options([['fixed','Fixed'],['uniform','Uniform · ±25%'],['exponential','Exponential']],n.distribution??'fixed')+'</select></label>':'')+
 (proc?field('Parallel servers','servers',n.servers??1,1,64)+field('Cost per server-hour (₱)','hourly',n.hourly??0,0,10000000,'any')+field('Planned stop starts at (s)','pauseStart',n.pauseStart??0,0,604800)+field('Planned stop duration (s)','pauseLength',n.pauseLength??0,0,604800):'')+
 (proc||n.type==='queue'?field('Waiting places · blank = unlimited','limit',n.limit??'',0,100000)+'<p class="muted">FIFO. A full buffer rejects new units. An upstream queue station sets the buffer limit.</p>':'')+
 (n.type==='inspection'?field('Inspection rework (%)','rework',n.rework??0,0,100,'any')+'<label>Rework destination<select id="reworkTo">'+options([['','Select station'],...m.nodes.filter(s=>['processor','inspection'].includes(s.type)).map(s=>[s.id,s.name])],n.reworkTo??'')+'</select></label>':'')+'</details>':'')+
 '<div><button class="primary">Apply edits</button><button type="button" id="remove" class="danger">Remove</button></div></form>';
 $('edit').onsubmit=e=>{e.preventDefault();const name=$('name').value.trim();if(!name){notify('Give the station a name.');return;}if(timed&&!Number($('seconds').value)){notify('Enter a positive time.');return;}if(proc&&!Number($('servers').value)){notify('Choose a positive number of servers.');return;}
 commit(()=>{n.name=name;if(timed){n.seconds=+$('seconds').value;n.distribution=$('distribution').value;if(n.type==='source'&&ensureProducts().length===1){ensureProducts()[0].interval=n.seconds;ensureProducts()[0].distribution=n.distribution;}}if(proc){n.servers=+$('servers').value;n.hourly=+$('hourly').value;n.pauseStart=+$('pauseStart').value;n.pauseLength=+$('pauseLength').value;}
 if($('limit'))n.limit=$('limit').value===''?null:+$('limit').value;
 if(n.type==='inspection'){n.rework=+$('rework').value;n.reworkTo=$('reworkTo').value;}
 if($('next')){m.edges=m.edges.filter(e=>e[0]!==n.id);if($('next').value)m.edges.push([n.id,$('next').value]);}});};
 $('remove').onclick=()=>commit(()=>{m.nodes=m.nodes.filter(s=>s.id!==n.id);m.edges=m.edges.filter(e=>!e.includes(n.id));});}
function metric(label,val,desc){return '<div class="metric"><span>'+escape(label)+'</span><strong>'+escape(val)+'</strong><p>'+escape(desc)+'</p></div>';}
function overview(){const p=m.nodes.filter(n=>['processor','inspection'].includes(n.type)),slow=p.slice().sort((a,b)=>b.seconds/(b.servers??1)-a.seconds/(a.servers??1))[0],good=!validateModel(m).length;
 $('idealMetrics').innerHTML=metric('Limiting station',good&&slow?slow.name:'—','Mean service capacity')+metric('Station limit',good&&slow?fmt(3600*(slow.servers??1)/slow.seconds)+' / h':'—','Before losses, starvation or rework')+metric('Service per pass',good?fmt(p.reduce((a,n)=>a+n.seconds,0))+' s':'—','Without waiting or repeat visits');}
function summary(){
 const products=normalizeProducts(m),issues=validateModel(m),state=$('runState'),signal=$('runSignal'),facts=$('runFacts');
 if(!result){state.textContent=issues.length?'Needs connection check':'Ready to simulate';signal.className=issues.length?'warn':'';facts.innerHTML='<span>'+products.length+' product'+(products.length===1?'':'s')+'</span><span>'+m.nodes.length+' stations · '+m.edges.length+' connections</span><span>'+ (issues.length?'Check model before running':'2D editor active') +'</span>';return;}
 const r=result.primary,b=r.rows.find(n=>n.id===r.bottleneck);state.textContent='Run complete';signal.className='done';facts.innerHTML='<span>'+fmt(r.throughput)+' / h throughput</span><span>'+fmt(r.completed,0)+' completed · '+fmt(r.events,0)+' events</span><span>'+(b?'Bottleneck · '+escape(b.name):'No bottleneck identified')+'</span>';
}
function analytics(){
 $('report').disabled=!result;$('windowNote').textContent=result?'Seed '+result.primary.config.seed+' · '+fmt(result.primary.events,0)+' recorded events':'';
 if(!result){$('metrics').innerHTML='';$('details').innerHTML='<p>Run this revision to see throughput, station queues, and 3D playback.</p>';return;}
 const r=result.primary,b=r.rows.find(n=>n.id===r.bottleneck);
 $('metrics').innerHTML=metric('Throughput',fmt(r.throughput)+' / h',r.completed+' completed in the observation window')+metric('Average flow time',r.averageFlow==null?'—':fmt(r.averageFlow)+' s','Time in system per completed unit')+metric('Queue pressure',b?.name??'—',b?fmt(b.avgQueue)+' waiting on average':'No processing stations')+metric('Work in progress',fmt(r.wip),'Units still in the system at run end');
 const rows=r.rows.map(s=>'<tr><td>'+escape(s.name)+'</td><td>'+fmt(s.util*100)+'% <span class="bar"><i style="width:'+Math.min(100,s.util*100)+'%"></i></span></td><td>'+fmt(s.avgQueue)+'</td><td>'+s.peak+'</td><td>'+fmt(s.avgWait)+' s</td><td>'+s.rejected+'</td></tr>').join('');
 const productRows=(r.productMetrics??[]).map(p=>'<tr><td><span class="swatch" style="background:'+escape(p.color)+'"></span>'+escape(p.name)+'</td><td>'+fmt(p.arrivals)+'</td><td>'+fmt(p.completed)+'</td><td>'+fmt(p.rejected)+'</td><td>'+fmt(p.reworked)+'</td><td>'+escape(productRouteLabel(p.route))+'</td></tr>').join('');
 const events=(r.eventLog??[]).slice(0,24).map(e=>'<tr><td>'+timeLabel(e.time)+'</td><td>'+escape(e.type)+'</td><td>'+escape(m.nodes.find(n=>n.id===e.stationId)?.name??'—')+'</td><td>'+escape(r.productMetrics?.find(p=>p.id===e.productId)?.name??'—')+'</td><td>'+escape(String(e.jobId??'—'))+'</td></tr>').join('');
 $('details').innerHTML='<h3>Station performance</h3><p>'+fmt(r.arrivals)+' arrivals · '+fmt(r.rejected)+' rejected · ₱'+fmt(r.cost,2)+' configured operating cost · '+result.throughput.n+' replication(s), mean '+fmt(result.throughput.mean)+' units/h'+(result.throughput.margin==null?'':' (95% CI ±'+fmt(result.throughput.margin)+')')+'</p><table><thead><tr><th>Station</th><th>Utilization</th><th>Mean queue</th><th>Peak queue</th><th>Mean wait¹</th><th>Rejected</th></tr></thead><tbody>'+rows+'</tbody></table><p>¹ Waiting time for units starting service in the observation window. Queue length is time-weighted. Utilization excludes planned stops.</p>'+(productRows?'<h3>Product flows</h3><table><thead><tr><th>Product</th><th>Arrivals</th><th>Completed</th><th>Rejected</th><th>Rework</th><th>Route</th></tr></thead><tbody>'+productRows+'</tbody></table>':'')+'<details class="eventlog"><summary>Recorded event playback · '+fmt(r.events,0)+' events</summary><p class="muted">The 3D floor replays station state from this discrete-event log. Showing the first 24 records.</p><table><thead><tr><th>Time</th><th>Event</th><th>Station</th><th>Product</th><th>Job</th></tr></thead><tbody>'+events+'</tbody></table></details>';
 if(b){const q=m.nodes.find(n=>n.type==='queue'&&m.edges.some(([a,d])=>a===n.id&&d===b.id));const track=r.tracks[q?.id??b.id]??[],max=Math.max(1,b.peak);
 let points='0,49',prev=0;const from=r.config.warmup,end=r.config.horizon,step=Math.max(1,Math.ceil(track.length/700));for(let i=0;i<track.length;i+=step){const s=track[i];if(s.time<from){prev=s.waiting;continue;}const x=(s.time-from)/(end-from)*600;points+=' '+x+','+(49-45*Math.min(1,prev/max))+' '+x+','+(49-45*Math.min(1,s.waiting/max));prev=s.waiting;}points+=' 600,'+(49-45*Math.min(1,prev/max));
 $('details').insertAdjacentHTML('beforeend','<div class="chartbox"><div class="trendlabel"><b>'+escape(b.name)+' · waiting units</b><span>Peak '+b.peak+'</span></div><svg class="trend" viewBox="0 0 600 52" preserveAspectRatio="none" role="img" aria-label="Queue history at '+escape(b.name)+'"><polyline points="'+points+'" fill="none" stroke="#3b765c" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="trendlabel"><span>'+timeLabel(from)+'</span><span>'+timeLabel(end)+'</span></div></div>');}}
function runModel(auto=false){
 if(worker){cancelRun();notify('Run cancelled.');return;}
 const issues=validateModel(m);if(issues.length){if(!auto)modal('Check model','<ul>'+issues.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ul>');return;}
 try{const config=normalizeConfig(project.config);const job=new Worker(workerURL,{type:'module'});worker=job;$('run').textContent='Cancel run';stopPlaying();
 job.onmessage=e=>{if(worker!==job)return;if(e.data.progress){$('run').textContent='Cancel · '+e.data.progress+'/'+config.reps;return;}
 cancelRun();if(e.data.error){notify(e.data.error);return;}result=e.data.result;cursor=auto?Math.min(180,config.horizon):0;render();if(!auto)notify('Run complete. Press play or scrub the timeline.');};
 job.onerror=e=>{cancelRun();notify(e.message||'Simulation worker could not start.');};
 job.postMessage({model:clone(m),config});}catch(e){notify(e.message);}
}
$('run').onclick=()=>runModel();
$('checks').onclick=()=>{const issues=validateModel(m);modal(issues.length?'Check model':'Model is connected',issues.length?'<ul>'+issues.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ul>':'<p>All stations have valid operating rules and a continuous route from source to sink.</p>');};
$('add').onclick=()=>{modal('Add a station',Object.entries(kinds).map(([k,v])=>'<button class="choice" data-add="'+k+'">'+escape(v)+'</button>').join(''));document.querySelectorAll('[data-add]').forEach(el=>el.onclick=()=>{if(m.nodes.length>=100){notify('The model supports up to 100 stations.');return;}commit(()=>{const type=el.dataset.add;selected=uuid();m.nodes.push({id:selected,name:kinds[type],type,seconds:['sink','queue'].includes(type)?0:30,x:35,y:Math.max(225,...m.nodes.filter(n=>n.x<230).map(n=>n.y+105))});});$('dialog').close();});};
$('settings').onclick=()=>{const c=project.config;modal('Run setup','<form id="cfg"><div class="grid2">'+[['Duration (seconds)','horizon',c.horizon,1,604800],['Warm-up (seconds)','warmup',c.warmup,0,604799],['Random seed','seed',c.seed,0,4294967295],['Replications','reps',c.reps,1,30]].map(([t,id,v,min,max])=>'<label>'+t+'<input required type="number" id="'+id+'" value="'+v+'" min="'+min+'" max="'+max+'"></label>').join('')+'</div><p class="note">The first run drives playback. Additional replications use consecutive seeds to estimate mean throughput and a 95% confidence interval.</p><button class="primary">Save setup</button></form>');
 $('cfg').onsubmit=e=>{e.preventDefault();try{const config=normalizeConfig(Object.fromEntries(['horizon','warmup','seed','reps'].map(k=>[k,+$(k).value])));commit(()=>project.config=config);$('dialog').close();}catch(err){notify(err.message);}};};

function download(filename,content,type){
 const link=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function slug(name){return name.replace(/[^a-z0-9_-]+/gi,'-').slice(0,60)||'flowstate';}
function validImport(m){
 if(!m||typeof m.title!=='string'||m.title.length>120||typeof m.category!=='string'||m.category.length>120||!Array.isArray(m.nodes)||m.nodes.length>100||!Array.isArray(m.edges)||m.edges.length>200)throw Error('Invalid project format.');
 if(!m.nodes.every(n=>n&&Object.hasOwn(kinds,n.type)&&typeof n.id==='string'&&/^[\w-]{1,80}$/.test(n.id)&&!['__proto__','constructor','prototype'].includes(n.id)&&typeof n.name==='string'&&n.name.length<=80&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<100001&&Math.abs(n.y)<100001&&Number.isFinite(n.seconds))||!m.edges.every(e=>Array.isArray(e)&&e.length===2&&e.every(v=>m.nodes.some(n=>n.id===v))))throw Error('Invalid station or connection.');
 const issues=validateModel(m);if(issues.some(s=>/invalid ID|unknown distribution|1–64|invalid waiting|invalid hourly|valid positive|invalid rework/.test(s)))throw Error(issues.join(' '));
 return clone(m);
}
function activate(p){clearRun();project=p;db.active=p.id;m=p.model;selected=m.nodes.find(n=>n.type==='processor')?.id??m.nodes[0]?.id;past=[];future=[];save();$('dialog').close();render();factory.reset();runModel(true);}
function addProject(model,config){const p=record(model,config);db.projects.push(p);activate(p);return p;}
function stationOrder(){const route=mainRouteIds(m),seen=new Set(route);return [...route,...m.nodes.filter(n=>n.type!=='source'&&!seen.has(n.id)).map(n=>n.id)];}
function productRouteLabel(route){return route?.length?route.map(id=>m.nodes.find(n=>n.id===id)?.name??id).join(' → '):'Main connections';}
function productEditor(product,creating=false){
 const draft=clone(product),base=mainRouteIds(m);let followMain=!draft.route?.length,routeIds=(draft.route?.length?draft.route:base).slice();
 const choices=()=>stationOrder().filter(id=>!routeIds.includes(id)).map(id=>'<option value="'+escape(id)+'">'+escape(m.nodes.find(n=>n.id===id)?.name??id)+'</option>').join('');
 modal(creating?'Add product flow':'Edit product flow','<form id="productForm"><div class="grid2"><label>Product name<input id="productName" maxlength="80" required value="'+escape(draft.name)+'"></label><label>Arrival interval (s)<input id="productInterval" type="number" min="0.001" max="604800" step="any" required value="'+escape(draft.interval)+'"></label></div><div class="grid2"><label>Arrival distribution<select id="productDistribution"><option value="fixed">Fixed</option><option value="uniform">Uniform · ±25%</option><option value="exponential">Exponential</option></select></label><label>Playback color<input id="productColor" type="color" value="'+escape(/^#[0-9a-f]{6}$/i.test(draft.color)?draft.color:'#d8fc81')+'"></label></div><label class="checkline"><input id="followMain" type="checkbox" '+(followMain?'checked':'')+'> Follow the main connections</label><p class="muted">Turn this off to send the product through a different station order. Routes can branch or skip stations, but must end at the sink.</p><div id="routeList" class="route-list"></div><label>Available stations<select id="routeAdd"><option value="">Add station to route…</option>'+choices()+'</select></label><div><button class="primary">Save product flow</button><button type="button" id="cancelProduct">Cancel</button></div></form>');
 $('productDistribution').value=draft.distribution||'fixed';
 function renderRoute(){const disabled=followMain;const list=routeIds.map((id,i)=>'<div class="listitem route-row"><span>'+ (i+1)+'. '+escape(m.nodes.find(n=>n.id===id)?.name??id)+'</span><div><button type="button" data-route-up="'+i+'" '+(i?'':'disabled')+'>↑</button><button type="button" data-route-down="'+i+'" '+(i<routeIds.length-1?'':'disabled')+'>↓</button><button type="button" data-route-remove="'+i+'" '+(disabled?'disabled':'')+'>Remove</button></div></div>').join('');$('routeList').innerHTML='<div class="subhead">Product route</div>'+(disabled?'<p class="note">Using the current main route: '+escape(productRouteLabel(base))+'</p>':list||'<p class="note">Add at least one processing station and the sink.</p>');$('routeAdd').disabled=disabled;document.querySelectorAll('[data-route-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.routeUp;if(i){[routeIds[i-1],routeIds[i]]=[routeIds[i],routeIds[i-1]];renderRoute();}});document.querySelectorAll('[data-route-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.routeDown;if(i<routeIds.length-1){[routeIds[i+1],routeIds[i]]=[routeIds[i],routeIds[i+1]];renderRoute();}});document.querySelectorAll('[data-route-remove]').forEach(b=>b.onclick=()=>{routeIds.splice(+b.dataset.routeRemove,1);renderRoute();});}
 $('followMain').onchange=()=>{followMain=$('followMain').checked;if(!followMain&&!routeIds.length)routeIds=base.slice();renderRoute();};$('routeAdd').onchange=()=>{const id=$('routeAdd').value;if(id){routeIds.push(id);$('routeAdd').value='';renderRoute();}};$('cancelProduct').onclick=()=>productsPane();$('productForm').onsubmit=e=>{e.preventDefault();const next=clone(m),name=$('productName').value.trim(),interval=+$('productInterval').value;if(!name||!Number.isFinite(interval)||interval<=0){notify('Give the product a name and a positive arrival interval.');return;}const value={id:draft.id,name,color:$('productColor').value,interval,distribution:$('productDistribution').value,route:followMain?[]:routeIds.slice()};next.products=ensureProducts().map(p=>p.id===draft.id?value:p);if(creating)next.products.push(value);const route=[next.nodes.find(n=>n.type==='source')?.id,...(value.route.length?value.route:mainRouteIds(next))].filter(Boolean);for(let i=1;i<route.length;i++)if(!next.edges.some(edge=>edge[0]===route[i-1]&&edge[1]===route[i]))next.edges.push([route[i-1],route[i]]);const issues=validateModel(next);if(issues.length){notify('Product flow not saved: '+issues[0]);return;}commit(()=>{m.products=next.products;m.edges=next.edges;});$('dialog').close();notify('Product flow saved.');};renderRoute();
}
function productsPane(){const products=ensureProducts();modal('Product flows','<p>Each product has its own arrival rule. Empty routes follow the main connections; custom routes let products branch or skip stations while keeping the simulation auditable.</p><div class="group"><button id="newProduct" class="primary">Add product flow</button></div>'+products.map(p=>'<div class="listitem"><div><strong>'+escape(p.name)+'</strong><small>'+fmt(p.interval)+' s · '+escape(p.distribution)+' · '+escape(productRouteLabel(p.route))+'</small></div><div class="pills"><button data-product-edit="'+escape(p.id)+'">Edit</button><button data-product-remove="'+escape(p.id)+'" '+(products.length<2?'disabled':'')+'>Remove</button></div></div>').join(''));
 $('newProduct').onclick=()=>productEditor({id:uuid().replaceAll('-','').slice(0,16),name:'New product',color:'#d8fc81',interval:m.nodes.find(n=>n.type==='source')?.seconds??30,distribution:'fixed',route:[]},true);document.querySelectorAll('[data-product-edit]').forEach(b=>b.onclick=()=>productEditor(ensureProducts().find(p=>p.id===b.dataset.productEdit)));document.querySelectorAll('[data-product-remove]').forEach(b=>b.onclick=()=>{const id=b.dataset.productRemove;if(products.length<2)return;commit(()=>{m.products=ensureProducts().filter(p=>p.id!==id);});productsPane();notify('Product flow removed.');});}
function projectManager(archived=false){
 const list=db.projects.filter(p=>!!p.archived===archived);
 modal('Projects','<div class="group"><button id="newProject" class="primary">New project</button><button id="duplicate">Duplicate current</button><button id="rename">Rename</button><button id="versions">Version history</button></div><div class="group"><button id="exportModel">Export project</button><button id="importModel">Import project</button><input id="file" hidden type="file" accept=".json"><button id="archivesToggle">'+(archived?'Active projects':'Archived projects')+'</button></div>'+
 list.map(p=>'<div class="listitem"><div><strong>'+escape(p.model.title)+'</strong><small>'+escape(p.model.category)+' · Rev '+p.revision+'</small></div><div class="pills">'+(p.archived?'<button data-restore="'+p.id+'">Restore</button>':'<button data-open="'+p.id+'">'+(p===project?'Current':'Open')+'</button>')+(p!==project&&!p.archived?'<button data-archive="'+p.id+'">Archive</button>':'')+'</div></div>').join('')+(!list.length?'<p>No archived projects.</p>':''));
 $('newProject').onclick=()=>{modal('Start a project',Object.entries(templates).map(([k,t])=>'<button class="choice" data-new="'+k+'">'+escape(t.title)+'<span>'+escape(t.category)+'</span></button>').join('')+'<button class="choice" data-new="blank">Blank process</button>');document.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>addProject(b.dataset.new==='blank'?{version:1,title:'Untitled process',category:'Custom process',nodes:[],edges:[]}:template(b.dataset.new)));};
 $('duplicate').onclick=()=>addProject({...clone(m),title:(m.title+' copy').slice(0,100)},project.config);
 $('rename').onclick=()=>{modal('Rename project','<form id="renameForm"><label>Project name<input id="projectName" required maxlength="80" value="'+escape(m.title)+'"></label><button class="primary">Save name</button></form>');$('renameForm').onsubmit=e=>{e.preventDefault();const name=$('projectName').value.trim();if(name){commit(()=>m.title=name);projectManager();}};};
 $('archivesToggle').onclick=()=>projectManager(!archived);$('exportModel').onclick=()=>download(slug(m.title)+'.flowstate.json',JSON.stringify({format:'flowstate-project-2',project},null,2),'application/json');
 $('importModel').onclick=()=>$('file').click();$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('Choose a project file under 5 MB.');const data=JSON.parse(await file.text()),p=data.project;if(data.format!=='flowstate-project-2')throw Error('Choose a Flowstate project export.');
 const fresh=record(validImport(p.model),normalizeConfig(p.config));fresh.revision=Math.max(1,Number.isSafeInteger(p.revision)?p.revision:1);
 fresh.archives=(p.archives??[]).slice(0,12).map(v=>({model:validImport(v.model),config:normalizeConfig(v.config),revision:Number(v.revision)||1,at:String(v.at)}));
 fresh.experiments=(p.experiments??[]).slice(0,30).map(v=>{if(!Array.isArray(v.units)||!v.units.length||v.units.length>30||!v.units.every(x=>Number.isInteger(x)&&x>=0)||!Number.isFinite(v.rate)||!Number.isFinite(v.cost))throw Error('Invalid experiment.');return {...v,id:uuid(),name:String(v.name).slice(0,80),model:validImport(v.model),config:normalizeConfig(v.config)};});db.projects.push(fresh);activate(fresh);notify('Imported as a separate project.');}catch(err){notify(err.message);}};
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>activate(db.projects.find(p=>p.id===b.dataset.open)));
 for(const action of ['archive','restore'])document.querySelectorAll('[data-'+action+']').forEach(b=>b.onclick=()=>{db.projects.find(p=>p.id===b.dataset[action]).archived=action==='archive';save();projectManager(archived);});
 $('versions').onclick=()=>{modal('Version history','<p>Restore an earlier revision as a new edit. The twelve most recent revisions are kept on this device.</p>'+project.archives.map((v,i)=>'<div class="listitem"><span>Revision '+v.revision+' · '+escape(v.model.title)+'</span><button data-version="'+i+'">Restore</button></div>').join(''));document.querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>{const v=clone(project.archives[+b.dataset.version]);commit(()=>{m=v.model;project.config=v.config;});$('dialog').close();});};
}
 $('projects').onclick=()=>projectManager();$('products').onclick=productsPane;$('workspaceNav').onclick=()=>{if($('dialog').open)$('dialog').close();window.scrollTo(0,0);};
 function capture(name){const r=result.primary;return {id:uuid(),name,model:clone(m),config:{...project.config},revision:project.revision,at:new Date().toISOString(),engine:VERSION,units:result.units.slice(),rate:result.throughput.mean,flow:r.averageFlow,cost:r.cost,events:r.events,productMetrics:clone(r.productMetrics??[])};}
function differences(a,b){
 const changes=[];for(const k of ['horizon','warmup','seed','reps'])if(a.config[k]!==b.config[k])changes.push(k+' changed from '+a.config[k]+' to '+b.config[k]);
 for(const n of b.model.nodes){const old=a.model.nodes.find(s=>s.id===n.id);if(!old){changes.push('Added '+n.name);continue;}
 const fields={name:'name',seconds:'time (s)',servers:'servers',limit:'waiting places',distribution:'distribution',rework:'rework (%)',reworkTo:'return station',hourly:'hourly cost',pauseStart:'stop starts (s)',pauseLength:'stop duration (s)'},fallback={servers:1,limit:'unlimited',distribution:'fixed',rework:0,hourly:0,pauseStart:0,pauseLength:0,reworkTo:'none'};
 for(const [k,label] of Object.entries(fields)){const x=old[k]??fallback[k],y=n[k]??fallback[k];if(x!==y)changes.push(n.name+' · '+label+' changed from '+x+' to '+y);}}
  for(const n of a.model.nodes)if(!b.model.nodes.some(s=>s.id===n.id))changes.push('Removed '+n.name);if(JSON.stringify(a.model.edges)!==JSON.stringify(b.model.edges))changes.push('Main routing changed.');if(JSON.stringify(a.model.products??[])!==JSON.stringify(b.model.products??[]))changes.push('Product flow definitions changed.');return changes;
}
function comparison(a,b){const changes=differences(a,b);
 return '<div class="datagrid"><table><thead><tr><th>Measure</th><th>'+escape(a.name)+'</th><th>'+escape(b.name)+'</th><th>Change</th></tr></thead><tbody>'+[['Mean throughput / h',a.rate,b.rate],['First-run flow time (s)',a.flow,b.flow],['Operating cost (₱)',a.cost,b.cost]].map(([t,x,y])=>'<tr><td>'+t+'</td><td>'+fmt(x)+'</td><td>'+fmt(y)+'</td><td>'+(x==null||y==null?'—':(y>x?'+':'')+fmt(y-x))+'</td></tr>').join('')+'</tbody></table></div><p class="note">'+(['horizon','warmup','seed','reps'].every(k=>a.config[k]===b.config[k])?'Matched run settings.':'Run settings differ. Review the settings before interpreting changes.')+'</p><ul>'+changes.map(t=>'<li>'+escape(t)+'</li>').join('')+'</ul>'+(!changes.length?'<p>Identical modeled inputs.</p>':'');}
function experimentsPane(){const records=project.experiments,live=result?capture('Current run'):null,opts=records.map((v,i)=>'<option value="'+i+'">'+escape(v.name)+'</option>').join('');
 modal('Experiments','<div class="group"><button id="trial">Test extra capacity</button></div><p>Save a baseline, edit a station, run it again, and compare both outcomes.</p><form id="capture" class="group"><input id="snapname" aria-label="Experiment name" maxlength="70" value="Revision '+project.revision+'"><button class="primary" '+(!live?'disabled':'')+'>Save current run</button></form>'+
 (records.length?'<div class="grid2"><label>Baseline<select id="basePick">'+opts+'</select></label><label>Compare with<select id="candidatePick">'+(live?'<option value="live">Current run</option>':'')+opts+'</select></label></div><div id="comparison"></div><div class="group"><button id="comparisonExport">Export comparison</button><button id="fork">Fork selected baseline</button></div>':'<p class="note">Save your first run to start a comparison.</p>'));
 $('trial').onclick=tournament; $('capture').onsubmit=e=>{e.preventDefault();if(!live)return;if(records.length>=30){notify('This project has reached 30 experiment snapshots.');return;}const name=$('snapname').value.trim();if(name){records.push({...live,name});save();experimentsPane();}};
 if(records.length){const pair=()=>[records[+$('basePick').value],$('candidatePick').value==='live'?live:records[+$('candidatePick').value]],display=()=>{$('comparison').innerHTML=comparison(...pair());};$('basePick').onchange=$('candidatePick').onchange=display;display();$('fork').onclick=()=>{const a=pair()[0],p=record({...clone(a.model),title:(a.model.title+' · scenario').slice(0,90)},a.config);p.experiments=[clone(a)];db.projects.push(p);activate(p);};
 $('comparisonExport').onclick=()=>download('Flowstate-comparison.html',reportPage('Scenario comparison',comparison(...pair())+'<h2>Inputs and runs</h2><pre>'+escape(JSON.stringify(pair(),null,2))+'</pre>'),'text/html');}}
function tournament(){
 if(worker){notify('Finish or cancel the current simulation first.');return;}
 const issues=validateModel(m);if(issues.length){notify(issues[0]);return;}
 const key=project.id, revision=project.revision, config=normalizeConfig(project.config);
 modal('Capacity experiment','<p>Try one additional parallel server at each eligible station. Every candidate uses the same model, duration, seeds and warm-up. Ranking uses mean throughput, then added operating cost.</p><div id="trialResult" class="note">Preparing scenarios…</div><button id="cancelTrial">Cancel experiment</button>');
 let trial;try{trial=new Worker(workerURL,{type:'module'});}catch(e){notify(e.message);return;}
 let ended=false;function finish(){if(ended)return;ended=true;trial.terminate();$('dialog').removeEventListener('close',finish);}
 $('dialog').addEventListener('close',finish);$('cancelTrial').onclick=()=>{$('dialog').close();finish();};
 trial.onmessage=e=>{if(ended)return;if(e.data.progress){$('trialResult').textContent=e.data.progress+' replication(s) finished';return;}
 finish();if(e.data.error){$('trialResult').textContent=e.data.error;$('cancelTrial').textContent='Close';return;}
 const rows=e.data.alternatives;$('cancelTrial').textContent='Close';$('trialResult').className='datagrid';$('trialResult').innerHTML='<p class="note">Baseline: '+fmt(e.data.base)+' units/h. Each row is a separate change.</p><table><thead><tr><th>Extra server at</th><th>Units/h</th><th>Gain/h</th><th>Extra cost</th><th>Scenario</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td>'+escape(r.name)+'</td><td>'+fmt(r.rate)+'</td><td>'+fmt(r.gain)+(r.margin!=null?' ±'+fmt(r.margin):'')+'</td><td>₱'+fmt(r.cost)+'</td><td><button data-trial="'+i+'">Fork</button></td></tr>').join('')+'</tbody></table>';
 document.querySelectorAll('[data-trial]').forEach(b=>b.onclick=()=>{if(project.id!==key||project.revision!==revision)return;const a=rows[+b.dataset.trial],copy=clone(m);copy.nodes.find(n=>n.id===a.id).servers=a.servers;copy.title=(m.title+' · extra '+a.name).slice(0,100);const p=record(copy,config);if(result)p.experiments=[capture('Original')];db.projects.push(p);activate(p);});
 };trial.onerror=e=>{finish();$('trialResult').textContent=e.message||'Experiment could not run.';};
 trial.postMessage({model:clone(m),config,mode:'tournament'});
}
$('experiments').onclick=experimentsPane;
function reportPage(title,body){return '<!doctype html><html lang="en"><meta charset="utf-8"><title>'+escape(title)+'</title><style>body{font:15px/1.5 system-ui;max-width:950px;margin:40px auto;padding:0 18px;color:#243d32}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #becbbb;text-align:left;padding:8px}pre{white-space:pre-wrap;word-break:break-word;font-size:11px}svg{width:100%;max-height:65px}</style><h1>'+escape(title)+'</h1>'+body+'</html>';}
$('report').onclick=()=>{if(!result)return;const r=result.primary;
 modal('Export report','<p>Download the reproducible run report or the station results for a spreadsheet.</p><div class="group"><button id="htmlReport" class="primary">HTML report</button><button id="csvReport">Station CSV</button></div>');
 $('htmlReport').onclick=()=>{const body='<p>'+escape(m.category)+' · Revision '+project.revision+' · '+VERSION+'</p><p>Observation window '+r.config.warmup+'–'+r.config.horizon+' seconds. Starts empty. Arrivals stop before the horizon. Completions at the horizon count. Buffers use FIFO and reject arrivals when full. Each station can have a planned stop. Work pauses and resumes. Utilization excludes the stop, and configured hourly cost accrues throughout the observation window. All starter times are illustrative.</p><p>'+r.completed+' completed · '+fmt(r.throughput)+' units/h · '+fmt(r.averageFlow)+' s average flow time · '+r.wip+' in progress · ₱'+fmt(r.unitCost,2)+' per completed unit.</p>'+$('details').innerHTML+'<h2>Replication completions</h2><p>'+result.units.join(', ')+'</p><h2>Model and settings</h2><pre>'+escape(JSON.stringify({engine:VERSION,model:m,settings:project.config},null,2))+'</pre>';download(slug(m.title)+'-run.html',reportPage(m.title+' · Run report',body),'text/html');};
 $('csvReport').onclick=()=>{const lines=[['Station','Servers','Utilization %','Mean queue','Peak queue','Mean waiting s','Rejected','Seed','Warm-up s','End s'],...r.rows.map(x=>[x.name,x.capacity,x.util*100,x.avgQueue,x.peak,x.avgWait,x.rejected,r.config.seed,r.config.warmup,r.config.horizon])];download(slug(m.title)+'-stations.csv','\ufeff'+lines.map(row=>row.map(v=>{let s=String(v);if(typeof v==='string'&&/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n'),'text/csv');};};
function floorStatus(){
 const mode=$('floorLayer').value;
 if(mode==='load')return result?.primary?'Run utilization · blue <65% / amber 65–89% / coral ≥90%':'Run the model to see utilization';
 if(mode==='Present'||mode==='Proposed')return m.workStudy?.[mode]?.layout?.rows?.length>1?mode+' route · study waypoints':'Save at least two '+mode.toLowerCase()+' flow diagram waypoints';
 return result?.primary?'Event playback':'Factory floor';
}
$('floorLayer').onchange=()=>{$('stageStatus').textContent=floorStatus();paint();};
function enterStudy(topic='overview'){
 stopPlaying();
 openStudy({model:m,run:result?.primary,selected,topic,draftKey:storageKey+'.study.'+project.id,getRevision:()=>project.revision,modal,commit,escape,notify,rerun:()=>runModel(true)});
}
$('workStudy').onclick=()=>enterStudy();
$('measure').onclick=()=>enterStudy('timing');
if(!warning)save();render();runModel(true);
