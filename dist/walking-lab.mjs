import {workerPath,routeBetween,pathLength} from './engine.mjs';

export function walkingSummary(run){
  let metres=0,seconds=0;
  for(const worker of run.workers)for(const leg of worker.intervals){
    if(leg.kind!=='Walking')continue;
    const overlap=Math.max(0,Math.min(run.config.horizon,leg.end)-Math.max(run.config.warmup,leg.start));
    seconds+=overlap;metres+=leg.distance*overlap/(leg.end-leg.start);
  }
  return {metres,seconds,completed:run.completed};
}

export function openWalkingLab({model,run,baseline,modal,escape,apply,example,staff}){
  const $=id=>document.getElementById(id),fmt=v=>v==null?'—':v.toLocaleString(undefined,{maximumFractionDigits:2});
  const stations=model.nodes.filter(n=>['source','processor','inspection'].includes(n.type));
  if(!model.crew||stations.length<2){
    modal('Walking routes','<p>Measured walking needs a staffed line and two stations.</p><button id="walkStaff">Set up workers</button> <button id="walkExample">Open packing aisle example</button>');
    $('walkStaff').onclick=staff;$('walkExample').onclick=example;return;
  }
  const options=stations.map(n=>'<option value="'+escape(n.id)+'">'+escape(n.name)+'</option>').join('');
  let comparison=run?'<p class="muted">Current shift: '+fmt(walkingSummary(run).metres)+' m walked by the crew · '+run.completed+' units completed.</p>':'<p class="muted">Run the current layout first to capture a before-and-after comparison.</p>';
  if(baseline&&run){
    const now=walkingSummary(run),rows=[['Completed units',baseline.completed,now.completed],['Crew walking (m)',baseline.metres,now.metres],['Crew walking (min)',baseline.seconds/60,now.seconds/60],['Walking per completed unit (m)',baseline.completed?baseline.metres/baseline.completed:null,now.completed?now.metres/now.completed:null]];
    comparison='<h3>Same shift, two layouts</h3><div class="datagrid"><table><tr><th>Measure</th><th>Before</th><th>After</th></tr>'+rows.map(([l,b,a])=>'<tr><th>'+l+'</th><td>'+fmt(b)+'</td><td>'+fmt(a)+'</td></tr>').join('')+'</table></div><p class="muted">First replication, seed '+run.config.seed+'. Walking totals cover the observation window.</p>';
  }
  modal('Walking routes','<form id="walkForm"><div class="grid2"><label>From station<select id="walkFrom">'+options+'</select></label><label>To station<select id="walkTo">'+options+'</select></label></div><p>Trace the aisle by placing bends in walking order. Workers use the same route in reverse on the return trip.</p><svg id="walkMap" viewBox="0 0 650 280" role="img" aria-label="Floor plan with station entrances and selected walking route"></svg><div class="group"><button type="button" id="walkStraight">Straight path</button><button type="button" id="walkUndo">Remove last bend</button><button type="button" id="walkDefault">Use shared aisle</button></div><details><summary>Enter a bend by coordinates</summary><div class="grid2"><label>East (m from floor origin)<input id="walkX" type="number" step="any"></label><label>South (m from floor origin)<input id="walkY" type="number" step="any"></label></div><button type="button" id="walkBend">Add bend</button></details><label>Measured trip distance (m, optional)<input id="walkMetres" type="number" min="0.001" max="100000" step="any" placeholder="Use the scaled path length"></label><p class="muted">An entered measurement sets the trip time. Clear it to calculate distance from the drawing.</p><p id="walkInfo" role="status"></p><p id="walkError" role="alert"></p><div class="group"><button class="primary" id="walkSave">Apply route and run</button><button id="walkCancel" type="button">Discard edits</button></div></form>'+comparison+'<div class="group"><button id="walkExample">Open packing aisle example</button></div>');
  const first=model.walkingRoutes?.[0];
  $('walkFrom').value=first?.from??stations[0].id;$('walkTo').value=first?.to??stations[1].id;
  let via=[],custom=false,dirty=false,projectPoint;
  const scale=model.crew.scale;
  const node=id=>stations.find(n=>n.id===id);
  const start=()=>node($('walkFrom').value),finish=()=>node($('walkTo').value);
  const door=n=>[n.x/36,n.y/30+1.16];
  const defaultPath=()=>workerPath({...model,walkingRoutes:[]},start(),finish());
  function points(){return custom?[door(start()),...via,door(finish())]:defaultPath();}
  function refresh(){
    const path=points(),svg=$('walkMap'),all=[...stations.map(door),...path,...defaultPath()];
    const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys);
    const rangeX=Math.max(4,Math.max(...xs)-minX),rangeY=Math.max(4,Math.max(...ys)-minY);
    const zoom=Math.min(484/rangeX,182/rangeY),left=(650-rangeX*zoom)/2,top=(280-rangeY*zoom)/2;
    const px=x=>left+(x-minX)*zoom,py=y=>top+(y-minY)*zoom;
    projectPoint=(x,y)=>[(x-left)/zoom+minX,(y-top)/zoom+minY];
    svg.innerHTML='<polyline fill="none" stroke="#20a695" stroke-width="4" stroke-linejoin="round" points="'+path.map(([x,y])=>px(x)+','+py(y)).join(' ')+'"/>'+path.slice(1,-1).map(([x,y])=>'<circle cx="'+px(x)+'" cy="'+py(y)+'" r="4" fill="#f5ba69"/>').join('')+stations.map(n=>{const [x,y]=door(n),selected=n===start()||n===finish();return '<circle cx="'+px(x)+'" cy="'+py(y)+'" r="'+(selected?6:4)+'" fill="'+(selected?'#07635d':'#74879a')+'"/><text x="'+px(x)+'" y="'+(py(y)-10)+'" text-anchor="middle">'+escape(n.name.slice(0,22))+'</text>';}).join('');
    const geometric=pathLength(path)*scale,measured=$('walkMetres').valueAsNumber,length=Number.isFinite(measured)?measured:geometric;
    $('walkInfo').textContent=(custom?'Custom route':'Shared aisle')+' · drawn '+fmt(geometric)+' m · simulated trip '+fmt(length)+' m in '+fmt(length/model.crew.speed)+' s.';
    $('walkSave').disabled=!dirty;$('walkCancel').disabled=!dirty;$('walkFrom').disabled=$('walkTo').disabled=dirty;
    $('walkUndo').disabled=!path.slice(1,-1).length;
  }
  function loadPair(){
    const rule=routeBetween(model,start().id,finish().id);
    custom=!!rule;via=rule?(rule.from===start().id?rule.via:rule.via.slice().reverse()).map(p=>p.slice()):[];
    $('walkMetres').value=rule?.metres??'';$('walkError').textContent='';dirty=false;refresh();
  }
  function change(){dirty=true;$('walkError').textContent='';refresh();}
  function trace(){if(!custom){via=defaultPath().slice(1,-1);custom=true;}}
  function bend(point){
    if(point.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||points().length>=34){$('walkError').textContent='Enter valid coordinates and use at most 32 bends.';return;}
    trace();via.push(point);change();
  }
  for(const [a,b] of [['walkFrom','walkTo'],['walkTo','walkFrom']])$(a).onchange=()=>{
    if($(a).value===$(b).value)$(b).value=stations.find(n=>n.id!==$(a).value).id;
    loadPair();
  };
  $('walkMap').onclick=e=>{const matrix=$('walkMap').getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());bend(projectPoint(p.x,p.y));};
  $('walkBend').onclick=()=>bend([$('walkX').valueAsNumber/scale,$('walkY').valueAsNumber/scale]);
  $('walkUndo').onclick=()=>{trace();via.pop();change();};
  $('walkStraight').onclick=()=>{custom=true;via=[];$('walkMetres').value='';change();};
  $('walkDefault').onclick=()=>{custom=false;via=[];$('walkMetres').value='';change();};
  $('walkMetres').oninput=()=>{trace();change();};
  $('walkCancel').onclick=loadPair;$('walkExample').onclick=example;
  $('walkForm').onsubmit=e=>{
    e.preventDefault();if(!dirty)return;
    const from=start().id,to=finish().id,old=routeBetween(model,from,to),routes=(model.walkingRoutes||[]).filter(r=>r!==old);
    if(custom)routes.push({from,to,via,metres:$('walkMetres').value===''?null:$('walkMetres').valueAsNumber});
    if(routes.length>250){$('walkError').textContent='This model already has 250 measured routes.';return;}
    apply(routes,run?walkingSummary(run):null);
  };
  loadPair();
}
