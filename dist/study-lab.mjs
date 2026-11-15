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
export function openStudy({model,run,modal,commit,escape:e,notify}){
  const draft=structuredClone(model.workStudy||{Present:{},Proposed:{}});
  let topic='overview',method='Present';
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
    const stations=model.nodes.filter(n=>['processor','inspection'].includes(n.type));
    modal('Work study','<section id="ws-lab"><div class="ws-tools"><label>Worksheet '+select('topic',Object.entries(topics).map(([k,v])=>[k,v[0]]),topic)+'</label><label>Method '+select('method',methods.map(m=>[m,m]),method)+'</label></div><p>'+e(topics[topic][1])+'</p><div class="ws-fields">'+form.map(f=>'<label>'+e(f[1])+control(f,t[f[0]],'')+'</label>').join('')+'</div>'+
      (cols.length?'<div class="ws-scroll"><table><thead><tr><th>#</th>'+cols.map(c=>'<th>'+e(c[1])+'</th>').join('')+'<th></th></tr></thead><tbody>'+t.rows.map((r,i)=>'<tr><td>'+(i+1)+'</td>'+cols.map(c=>'<td>'+control(c,r[c[0]],'data-row="'+i+'"')+'</td>').join('')+'<td><button data-remove="'+i+'" aria-label="Remove row '+(i+1)+'">×</button></td></tr>').join('')+'</tbody></table></div><button id="ws-add">Add row</button>':'')+
      (topic==='layout'?select('station',model.nodes.map(n=>[n.id,n.name]),'')+' <button id="ws-point">Add station waypoint</button><p>Click the floor plan to trace aisle turns, or enter coordinates in the table.</p>':'')+
      (topic==='productivity'&&run?'<button id="ws-use">Use '+e(run.completed)+' completed units from run</button>':'')+
      (topic==='timing'?'<button id="ws-watch">'+(watchStart===null?'Start observation':'Record elapsed seconds')+'</button>':'')+
      '<div id="ws-output" aria-live="polite">'+safeOutput(topic,t,method)+'</div><label>'+e(guides[topic])+'<textarea data-key="discussion" rows="3">'+e(t.discussion||'')+'</textarea></label>'+
      (['timing','standards'].includes(topic)&&stations.length?'<label>Simulation station '+select('station',stations.map(n=>[n.id,n.name]),'')+'</label> <button id="ws-apply">Apply standard time and save</button>':'')+
      '<div class="ws-tools"><button id="ws-copy">Copy present worksheet to proposed</button><button id="ws-print">Print study report</button><button id="ws-save" class="primary">Save study</button></div><small id="ws-status" role="status"></small></section>');
    id('topic').onchange=ev=>{watchStart=null;topic=ev.target.value;refresh();};id('method').onchange=ev=>{watchStart=null;method=ev.target.value;refresh();};
    if(id('watch'))id('watch').onclick=()=>{
      if(watchStart===null)watchStart=performance.now();
      else{const seconds=((performance.now()-watchStart)/1000).toFixed(3);t.observations=[t.observations,seconds].filter(Boolean).join(', ');watchStart=null;}
      refresh();
    };
    id('lab').oninput=ev=>{const {row,key}=ev.target.dataset;if(!key)return;(row==null?t:t.rows[Number(row)])[key]=ev.target.value;id('output').innerHTML=safeOutput(topic,t,method);id('status').textContent='Unsaved changes';};
    id('lab').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{t.rows.splice(Number(b.dataset.remove),1);refresh();});
    if(id('add'))id('add').onclick=()=>{t.rows.push(Object.fromEntries(cols.map(([k,,type,v])=>[k,v??(Array.isArray(type)?type[0]:'')])));refresh();};
    if(id('point'))id('point').onclick=()=>{const n=model.nodes.find(n=>n.id===id('station').value);if(n)t.rows.push({x:n.x,y:n.y,label:n.name});refresh();};
    if(topic==='layout')id('output').onclick=ev=>{
      const plan=ev.target.closest('svg');if(!plan)return;
      const point=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(plan.getScreenCTM().inverse());
      t.rows.push({x:Math.round(point.x),y:Math.round(point.y),label:'Waypoint '+(t.rows.length+1)});refresh();
    };
    if(id('use'))id('use').onclick=()=>{t.output=run.completed;refresh();};
    id('copy').onclick=()=>{if(draft.Proposed[topic]&&!confirm('Replace the proposed worksheet with the present one?'))return;draft.Proposed[topic]=structuredClone(get(topic,'Present'));method='Proposed';refresh();};
    id('save').onclick=()=>{commit(()=>{model.workStudy=structuredClone(draft);});id('status').textContent='Study saved with this project.';};
    if(id('apply'))id('apply').onclick=()=>{try{const seconds=(topic==='timing'?duration(t):standardFromData(t)).standard;if(seconds<0.001||seconds>604800)throw Error('Station time must be between 0.001 and 604800 seconds.');const n=model.nodes.find(n=>n.id===id('station').value);commit(()=>{model.workStudy=structuredClone(draft);n.seconds=seconds;});document.getElementById('dialog').close();notify('Applied '+format(seconds)+' s to '+n.name+'. Run the simulation to compare.');}catch(err){id('status').textContent=err.message;}};
    id('print').onclick=()=>{
      const win=window.open('','_blank');if(!win){id('status').textContent='Allow a new window to print.';return;}
      const blocks=[];for(const m of methods)for(const [k,data] of Object.entries(draft[m])){
        if(!topics[k])continue;const fs=fields[k]||[],cs=columns[k]||[];
        blocks.push('<section><h2>'+e(m)+' · '+e(topics[k][0])+'</h2>'+fs.map(([id,label])=>'<p><b>'+e(label)+'</b> '+e(data[id])+'</p>').join('')+(data.rows?.length?'<table><tr><th>#</th>'+cs.map(c=>'<th>'+e(c[1])+'</th>').join('')+'</tr>'+data.rows.map((r,i)=>'<tr><td>'+(i+1)+'</td>'+cs.map(c=>'<td>'+e(r[c[0]])+'</td>').join('')+'</tr>').join('')+'</table>':'')+safeOutput(k,data,m)+'</section>');
      }
      const discussion=methods.flatMap(m=>Object.entries(draft[m]).filter(([k,t])=>topics[k]&&t.discussion).map(([k,t])=>'<h3>'+e(m)+' · '+e(topics[k][0])+'</h3><p>'+e(guides[k])+'</p><p>'+e(t.discussion)+'</p>')).join('');
      win.document.write('<!doctype html><meta charset="utf-8"><title>Work study report</title><style>body{font:14px system-ui;color:#163e33;margin:2em}table{border-collapse:collapse;width:100%}td,th{padding:5px;border:1px solid #aaa}h2{break-after:avoid}tr,svg{break-inside:avoid}</style><h1>'+e(model.title)+' · Work study</h1>'+blocks.join('')+(discussion?'<h2>Discussion</h2>'+discussion:''));win.document.close();win.focus();win.print();
    };
  }
  refresh();
}
