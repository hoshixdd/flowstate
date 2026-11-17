export const kinds = {source:'Source',processor:'Processor',queue:'Queue',inspection:'Inspection',sink:'Sink'};
export const fixtures={
  mixer:['Mix or knead',240,false],proofer:['Proofing rack',1800,true],oven:['Batch oven',900,true],cooling:['Cooling rack',360,true],
  press:['Printing press',38,true],binder:['Trim and crease',26,false],washer:['Washer',600,true],dryer:['Drying drum',420,true],fold:['Folding table',210,false],
  workbench:['Manual workbench',30,false],filler:['Dosing hopper',24,false],sealer:['Sealing machine',18,false],vision:['Inspection bench',15,false]
};
export const templates = {
  bakery:{title:'Bread roll bakery',category:'Bakery production study'},
  printshop:{title:'Print finishing shop',category:'Print production study'},
  laundry:{title:'Linen finishing room',category:'Laundry production study'},
  materials:{title:'Carton supply and lot study',category:'Material flow lab'},
  walking:{title:'Packing aisle layout study',category:'Measured walking lab'},
  roles:{title:'Packing crew assignment study',category:'Station assignment lab'},
  quality:{title:'Carton quality line',category:'Factory quality study'},
  lab:{title:'Assembly line',category:'IE classroom lab',names:['Arrivals','Preparation','Assembly','Packaging','Finished units'],times:[30,30,45,36,0]},
  staffed:{title:'Staffed packing factory',category:'Worker measurement lab',names:['Receiving','Prepare cartons','Fill cartons','Inspect and seal','Dispatch'],times:[30,25,40,22,0]},
  production:{title:'Choco Bomb production',category:'Small production',names:['Ingredients','Mixing','Shaping','Packing','Finished boxes'],times:[40,35,55,40,0]},
  campus:{title:'Campus service queue',category:'Campus services',names:['Student arrivals','Check-in','Document review','Release','Students served'],times:[120,60,180,90,0]}
};
export function template(key){
 if(['bakery','printshop','laundry'].includes(key)){
   const recipes={
     bakery:{unit:'Tray',interval:300,steps:['mixer','proofer','oven','cooling'],names:['Mix dough','Proof trays','Bake rolls','Cool trays'],target:'oven',defect:'Dark crust',type:'high',threshold:205,setting:215,rate:38,normal:4,end:'Packed trays',reject:'Reject assessment'},
     printshop:{unit:'Print job',interval:45,steps:['workbench','press','binder'],names:['Prepare job','Print sheets','Trim and crease'],target:'binder',defect:'Off-centre cut',type:'restart',threshold:180,rate:35,normal:3,end:'Finished jobs',reject:'Reprint bench'},
     laundry:{unit:'Linen load',interval:180,steps:['washer','dryer','fold'],names:['Wash loads','Dry linen','Fold and stack'],target:'fold',defect:'Creased linen',type:'wait',threshold:90,rate:32,normal:3,end:'Finished loads',reject:'Refinish linen'}
   },r=recipes[key],base=template('quality'),slots=[[216,48],[450,48],[690,48],[690,202]];
   const source={...base.nodes[0],name:'Receiving',x:12,y:48,seconds:r.interval};
   const steps=r.steps.map((id,i)=>({id,name:r.names[i],type:'processor',fixture:id,x:slots[i][0],y:slots[i][1],seconds:fixtures[id][1],unattended:fixtures[id][2],servers:({proofer:6,cooling:2,washer:4,dryer:3})[id]??1}));
   const target=steps.find(n=>n.id===r.target);
   target.setting=r.setting??0;
   if(key==='printshop')target.reliability={life:650,repair:90,pmAge:0,pmTime:0};
   const gate={...base.nodes.find(n=>n.id==='vision'),name:'Final inspection',x:445,y:222,seconds:20};
   const repair={...base.nodes.find(n=>n.id==='repair'),name:r.reject,x:450,y:368};
   const sink={...base.nodes.at(-1),name:r.end,x:160,y:222};
   const chain=[source,...steps,gate,sink];
   return {...base,...templates[key],crew:{count:2,speed:1.2,scale:.65},nodes:[...chain,repair],edges:[...chain.slice(1).map((n,i)=>[chain[i].id,n.id]),[gate.id,repair.id],[repair.id,sink.id]],
     products:[{...base.products[0],id:'unit',name:r.unit,interval:r.interval}],
     quality:{...base.quality,recovery:key==='bakery'?0:90,modes:[{id:'process-defect',name:r.defect,station:target.id,rate:r.normal,condition:{type:r.type,threshold:r.threshold,rate:r.rate}}]}};
 }
 if(key==='materials'){
   const model=template('quality');
   return {...model,...templates.materials,supply:{name:'Carton blank',lots:[
     {id:'BLANK-A',at:0,quantity:30},{id:'BLANK-B',at:1800,quantity:150}
   ]}};
 }
 if(key==='walking'){
   const model=template('roles');
   return {...model,...templates.walking,walkingRoutes:[{from:'n1',to:'n2',via:[[307/36,10.5],[578/36,10.5]],metres:22}]};
 }
 if(key==='roles'){
   const model=template('staffed');
   return {...model,...templates.roles,crew:{...model.crew,roster:[
     {role:'Packing operator',stations:['n1','n2']},
     {role:'Inspector',stations:['n3']}
   ]}};
 }
 if(key==='quality'){
   const layout=[
     ['receiving','Inbound pallets','source',36,42,20],
     ['forming','Carton former','processor',268,42,15],
     ['filler','Dosing hopper','processor',502,42,24],
     ['sealer','Case sealer','processor',692,170,18],
     ['vision','Inspection gate','inspection',475,232,12],
     ['repair','Rework bench','processor',472,355,36],
     ['shipping','Dispatch pallets','sink',160,232,0]
   ];
   return {version:1,title:templates.quality.title,category:templates.quality.category,crew:{count:5,speed:1.2,scale:.6},
     nodes:layout.map(([id,name,type,x,y,seconds])=>({id,fixture:id,name,type,x,y,seconds})),
     edges:[['receiving','forming'],['forming','filler'],['filler','sealer'],['sealer','vision'],['vision','shipping'],['vision','repair'],['repair','shipping']],
     products:[{id:'carton',name:'Carton',color:'#e7ad64',interval:20,distribution:'fixed',route:[]}],
     quality:{gate:'vision',repair:'repair',detection:85,recovery:90,modes:[
       {id:'fold',name:'Crushed fold',station:'forming',rate:5},
       {id:'dose',name:'Incorrect fill',station:'filler',rate:13},
       {id:'seal',name:'Open seam',station:'sealer',rate:8}
     ]}};
 }
 const t=templates[key], positions=[[36,64],[307,64],[578,64],[578,226],[307,226]];
 return {...(key==='staffed'?{crew:{count:2,speed:1.2,scale:1}}:{}),version:1,title:t.title,category:t.category,nodes:t.names.map((name,i)=>({id:'n'+i,name,type:i===0?'source':i===4?'sink':'processor',seconds:t.times[i],x:positions[i][0],y:positions[i][1]})),edges:[['n0','n1'],['n1','n2'],['n2','n3'],['n3','n4']],products:[{id:'unit',name:'Unit',color:'#d8fc81',interval:t.times[0],distribution:'fixed',route:[]}]};
}
export function inspect(m){
 const issues=[],nodes=m.nodes, ids=new Set(nodes.map(n=>n.id)), source=nodes.filter(n=>n.type==='source'), sink=nodes.filter(n=>n.type==='sink');
 if(source.length!==1)issues.push('Use exactly one source.');
 if(sink.length!==1)issues.push('Use exactly one sink.');
 for(const n of nodes){
  const incoming=m.edges.filter(e=>e[1]===n.id).length,outgoing=m.edges.filter(e=>e[0]===n.id).length;
  if(!n.name.trim())issues.push('Give each station a name.');
  if(n.type!=='queue'&&n.type!=='sink'&&!(Number.isFinite(n.seconds)&&n.seconds>0))issues.push(n.name+' needs a positive time.');
  if(incoming!==(n.type==='source'?0:1)||outgoing!==(n.type==='sink'?0:1))issues.push('Check the connections at '+n.name+'.');
 }
 if(m.edges.some(([a,b])=>!ids.has(a)||!ids.has(b)))issues.push('A connection has a missing endpoint.');
 const order=[],seen=new Set();let current=source[0];
 while(current&&!seen.has(current.id)){seen.add(current.id);order.push(current);const e=m.edges.find(e=>e[0]===current.id);current=e&&nodes.find(n=>n.id===e[1]);}
 if(current)issues.push('Remove the circular route.');
 if(seen.size!==nodes.length)issues.push('Connect every station to the source route.');
 return {issues,order};
}
export function simulate(m,horizon=3600){
 const {issues,order}=inspect(m);if(issues.length)throw Error(issues.join(' '));
 const interval=order[0].seconds,stations=order.filter(n=>['processor','inspection'].includes(n.type)),count=Math.ceil(horizon/interval);
 if(count*Math.max(stations.length,1)>1000000)throw Error('Increase the arrival interval or shorten the run.');
 let completed=0,flow=0;const available=stations.map(()=>0);
 for(let i=0;i<count;i++){const arrival=i*interval;let at=arrival;
  stations.forEach((n,j)=>{at=Math.max(at,available[j])+n.seconds;available[j]=at;});
  if(at<=horizon){completed++;flow+=at-arrival;}
 }
 return {completed,arrivals:count,averageFlow:completed?flow/completed:null,horizon};
}

