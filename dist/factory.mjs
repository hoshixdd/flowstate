import {workerPath,pathLength} from './engine.mjs';
import {createDaylightRenderer} from './daylight.mjs';
// Orthographic industrial cutaway. World coordinates are [east, south, height].
export function createFactory(canvas, onSelect = () => {}, onWorker = () => {}) {
  const ctx = canvas.getContext('2d');
  let gpu=null;
  try{gpu=createDaylightRenderer();}catch(error){console.warn('Using canvas factory renderer:',error.message);}
  let focused=false,clock=0,follow=0;
  const palette = { steel:'#aabbd0', dark:'#253246', teal:'#315662', tealLight:'#77adb4',
    cream:'#e8eaf0', white:'#fbfcff', rubber:'#465856', amber:'#ffad30', orange:'#f26e23', ink:'#223c35' };
  const camera = { angle:.43, elevation:.59, zoom:1 };
  let layer='live',run=null;
  let qualityTrace=null;
  const signalsByStation=new Map();
  const qualitySignals={
    fault:{color:'#ffa738',label:'Fault introduced'},
    detected:{color:'#ffad46',label:'Defect detected'},
    repair:{color:'#75d6bd',label:'Repair'},
    scrap:{color:'#d95047',label:'Scrapped carton'},
    escape:{color:'#f27067',label:'Escaped defect'}
  };
  function stationSignal(id){
    if(qualityTrace!==run?.qualityTrace){
      signalsByStation.clear();qualityTrace=run?.qualityTrace;
      for(const event of qualityTrace||[]){
        if(!Object.hasOwn(qualitySignals,event.kind))continue;
        if(!signalsByStation.has(event.stationId))signalsByStation.set(event.stationId,[]);
        signalsByStation.get(event.stationId).push(event);
      }
    }
    const events=signalsByStation.get(id);
    if(!events)return null;
    let lo=0,hi=events.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].time<=clock)lo=mid+1;else hi=mid;}
    const event=events[lo-1];
    return event&&clock-event.time<9?qualitySignals[event.kind]:null;
  }
  let model, frame={}, selected, width=1, height=1, scale=1, centerX=0, centerZ=0, screenY=0;
  let faces=[], labels=[], hitFaces=[], hitLabels=[], pointer=null, disposed=false;
  let ca,sa,ce,se;
  const vector=(x,z,h=0)=>[x,z,h];
  function project([x,z,h]) {
    const u=x-centerX,v=z-centerZ,depth=u*sa+v*ca;
    return [width/2+(u*ca-v*sa)*scale,screenY+(depth*se-h*ce)*scale,depth*ce+h*se];
  }
  function shade(hex, factor) {
    const n=parseInt(hex.slice(1),16);
    return 'rgb('+[n>>16,(n>>8)&255,n&255].map(c=>Math.round(Math.min(255,c*factor))).join(',')+')';
  }
  function face(points,color,group,station,outline=false) {
    const screen=points.map(project), depth=screen.reduce((d,p)=>d+p[2],0)/screen.length;
    faces.push({world:points,screen,color,group,station,outline,depth});
  }
  function slab(x,z,b,w,l,h,color,group=3,station=null,rot=0,outline=true) {
    const c=Math.cos(rot),s=Math.sin(rot);
    const corners=[[-w/2,-l/2],[w/2,-l/2],[w/2,l/2],[-w/2,l/2]].map(([a,d])=>[x+a*c-d*s,z+a*s+d*c]);
    const top=corners.map(([a,d])=>[a,d,b+h]), bottom=corners.map(([a,d])=>[a,d,b]);
    if(group===3&&h>.28&&scale>8){
      face(top.map(([a,d,y])=>[a+y*.28,d+y*.18,.124]),'rgba(11,25,41,.095)',2);
    }
    face(top,shade(color,1.08),group,station,outline);
    for(let i=0;i<4;i++){
      const j=(i+1)%4,dx=corners[j][0]-corners[i][0],dz=corners[j][1]-corners[i][1],len=Math.hypot(dx,dz);
      const nx=dz/len,nz=-dx/len;
      if(nx*sa+nz*ca>0.0001)face([bottom[i],bottom[j],top[j],top[i]],shade(color,.78-.09*nx-.06*nz),group,station,outline);
    }
  }
  function cylinder(x,z,b,r,h,color,station,segments=12) {
    const circle=Array.from({length:segments},(_,i)=>[x+r*Math.cos(i*2*Math.PI/segments),z+r*Math.sin(i*2*Math.PI/segments)]);
    const top=circle.map(([a,d])=>[a,d,b+h]); face(top,shade(color,1.06),3,station);
    for(let i=0;i<segments;i++){
      const j=(i+1)%segments,ang=(i+.5)*2*Math.PI/segments, nx=Math.cos(ang),nz=Math.sin(ang);
      if(nx*sa+nz*ca>0)face([[...circle[i],b],[...circle[j],b],top[j],top[i]],shade(color,.83-.12*nx-.09*nz),3,station);
    }
  }
  function rod(a,b,r,color,station) {
    const axis=b.map((v,i)=>v-a[i]),length=Math.hypot(...axis); if(!length)return;
    const unit=axis.map(v=>v/length),planar=Math.hypot(unit[0],unit[1]);
    const u=planar?[-unit[1]/planar,unit[0]/planar,0]:[1,0,0];
    const v=[unit[1]*u[2]-unit[2]*u[1],unit[2]*u[0]-unit[0]*u[2],unit[0]*u[1]-unit[1]*u[0]];
    const ring=at=>Array.from({length:8},(_,i)=>at.map((q,j)=>q+r*(u[j]*Math.cos(i*Math.PI/4)+v[j]*Math.sin(i*Math.PI/4))));
    const ra=ring(a),rb=ring(b);
    for(let i=0;i<8;i++){const j=(i+1)%8;face([ra[i],ra[j],rb[j],rb[i]],shade(color,.90+.09*Math.cos(i*Math.PI/4)),3,station);}
    face(rb,color,3,station);
  }
  function plane(x,z,w,l,h,color,group,station,angle=0) {
    const c=Math.cos(angle),s=Math.sin(angle);
    face([[-w/2,-l/2],[w/2,-l/2],[w/2,l/2],[-w/2,l/2]].map(([a,d])=>[x+a*c-d*s,z+a*s+d*c,h]),color,group,station);
  }
  function crate(x,z,h,size,station,color='#c9945c') {
    slab(x,z,h,size,size*.80,size*.72,color,3,station);
    slab(x,z,h+size*.72,size*.16,size*.80,.013,'#e9cba1',3,station,0,false);
  }
  function person(x,z,shirt,station) {
    cylinder(x,z,.04,.16,.36,palette.dark,station,8);
    cylinder(x,z,.38,.21,.42,shirt,station,8);
    cylinder(x,z,.80,.14,.23,'#bb9379',station,10);
  }
  function belt(a,b) {
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<4.1)return;
    const ang=Math.atan2(dz,dx),ux=dx/len,uz=dz/len,px=-uz,pz=ux;
    const from=1.51,to=len-1.51,span=to-from,m=(from+to)/2;
    const at=(d,side=0)=>[a.x+ux*d+px*side,a.z+uz*d+pz*side];
    const mid=at(m);
    plane(...mid,span,.95,.025,'#394c45',1,null,ang);
    slab(...mid,.53,span,.78,.22,palette.dark,2,null,ang);
    slab(...mid,.75,span,.67,.06,'#78928a',2,null,ang,false);
    for(const side of [-1,1]){const p=at(m,side*.43);slab(...p,.75,span,.065,.13,'#b0bdb3',2,null,ang);}
    for(let d=from+.2;d<to;d+=.33){const p=at(d);plane(...p,.035,.65,.816,'#adbbb0',2,null,ang);}
    for(let d=from+.48;d<to;d+=2.5){const p=at(d);slab(...p,.03,.15,.70,.50,palette.steel,2,null,ang);}
    // Small chevrons on the belt identify the actual routing direction.
    for(let d=from+.85;d<to-.25;d+=2.2){face([[...at(d-.16,-.19),.823],[...at(d+.13),.823],[...at(d-.16,.19),.823],[...at(d-.05),.823]],'#e6ede2',2,null);}
  }
  function floor(loX,hiX,loZ,hiZ) {
    const cx=(loX+hiX)/2,cz=(loZ+hiZ)/2;
    // A soft elliptical contact shadow grounds the entire cutaway.
    const footprint=[project([loX,loZ,-.66]),project([hiX,loZ,-.66]),project([hiX,hiZ,-.66]),project([loX,hiZ,-.66])];
    ctx.save();ctx.shadowColor='rgba(35,55,58,.36)';ctx.shadowBlur=Math.min(22,scale*.54);ctx.shadowOffsetY=5;polygon(footprint);ctx.fillStyle='#8da4a5';ctx.fill();ctx.restore();
    const glow=ctx.createRadialGradient(width*.52,height*.62,0,width*.52,height*.62,width*.53);
    glow.addColorStop(0,'rgba(91,167,225,.22)');glow.addColorStop(1,'rgba(91,167,225,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    slab(cx,cz,-.60,hiX-loX+.14,hiZ-loZ+.14,.23,'#223745',0);
    slab(cx,cz,-.38,hiX-loX+.08,hiZ-loZ+.08,.12,'#7b9194',0);
    slab((loX+hiX)/2,(loZ+hiZ)/2,-.26,hiX-loX,hiZ-loZ,.25,'#bbc5c3',0,null,0,false);
    for(let x=Math.ceil(loX/2)*2;x<hiX;x+=2)plane(x,(loZ+hiZ)/2,.016,hiZ-loZ,.002,'#8f9f9e',1);
    for(let z=Math.ceil(loZ/2)*2;z<hiZ;z+=2)plane((loX+hiX)/2,z,hiX-loX,.016,.002,'#8f9f9e',1);
    for(const z of [loZ+.28,hiZ-.28])plane((loX+hiX)/2,z,hiX-loX-.56,.06,.008,'#73887a',1);
    for(const x of [loX+.28,hiX-.28])plane(x,(loZ+hiZ)/2,.06,hiZ-loZ-.56,.008,'#73887a',1);
  }
  // The roof and near walls are cut away to keep the process and its queues visible.
  function hall(x0,x1,z0,z1,campus){
    const span=x1-x0,cx=(x0+x1)/2,wall='#c5d1d0',beam='#455c65';
    const bays=Math.max(2,Math.min(12,Math.round(span/3.6))),bay=span/bays;
    if(ca>-.1){
      slab(cx,z0,0,span,.20,1.32,wall,3);
      slab(cx,z0,3.25,span,.22,.24,'#91a2a4',3);
      for(let i=0;i<bays;i++){
        const x=x0+(i+.5)*bay;
        slab(x,z0,1.32,bay-.12,.075,1.93,'#b4d6dc',3);
        slab(x,z0+.055,2.36,bay,.055,.055,beam,3);
        for(const d of [-.25,0,.25])slab(x+d*bay,z0+.07,1.34,.045,.06,1.88,'#8ba6ae',3);
        // Directional bands of daylight cross the concrete under each clerestory.
        face([[x-bay*.36,z0+.22,.009],[x+bay*.36,z0+.22,.009],[x+bay*.36+1.1,z0+2.9,.009],[x-bay*.36+1.1,z0+2.9,.009]],'rgba(255,248,214,.32)',1);
        slab(x-bay/2,z0+.06,0,.17,.29,3.58,beam,3);
        slab(x,z0+.28,3.37,bay,.09,.075,'#f7f2d4',3);
      }
      slab(cx,z0+.23,1.05,span,.065,.07,campus?'#467e89':'#e2a74f',3);
    }
    if(sa>-.12){
      const mid=(z0+z1)/2,depth=z1-z0;
      slab(x0,mid,0,.19,depth,1.47,wall,3);
      if(!campus){
        const dock=z0+depth*.40;
        slab(x0+.06,dock,0,.28,2.65,2.96,beam,3);
        for(let j=0;j<10;j++)slab(x0+.22,dock,.12+j*.265,.07,2.40,.245,'#9badaf',3);
        for(const side of [-1,1]){cylinder(x0+.53,dock+side*1.45,0,.085,.78,'#f9b13e',null);cylinder(x0+.53,dock+side*1.45,.55,.088,.09,'#39474a',null);}
      }
    }
    if(!campus){
      // Receiving bay staging: empty return pallets and a parked manual pallet truck.
      const sx=x0+1.85,sz=z1-2.85;
      for(let level=0;level<3;level++){
        const base=level*.24;
        for(const side of [-.54,0,.54])slab(sx+side,sz,base,.14,1.12,.13,'#9c7959',3);
        for(let k=0;k<6;k++)slab(sx,sz-.51+k*.20,base+.13,1.45,.17,.085,k%2?'#c39b6c':'#cda878',3);
      }
      const jx=sx+1.32,jz=sz+.62;
      for(const side of [-.21,.21]){
        slab(jx+side,jz+.31,.105,.13,1.12,.075,'#e8a138',3);
        rod([jx+side-.09,jz+.74,.10],[jx+side+.09,jz+.74,.10],.095,'#344247',null);
      }
      slab(jx,jz-.32,.16,.58,.37,.30,'#efac3c',3);
      rod([jx,jz-.30,.39],[jx,jz-.58,1.04],.065,'#566367',null);
      rod([jx-.20,jz-.62,1.05],[jx+.20,jz-.62,1.05],.065,'#26373d',null);
      if(ca>0){
        // An overhead service conduit and louvered utilities cabinet sit behind the line.
        for(const h of [2.88,3.05])rod([x0+.35,z0+.22,h],[x1-.35,z0+.22,h],.052,'#98a6a5',null);
        const ux=x1-1.1,uz=z0+.58;
        slab(ux,uz,0,1.48,.66,1.58,'#697d80',3);
        for(const side of [-.36,.36]){
          slab(ux+side,uz+.34,.09,.66,.046,1.37,'#aebcb9',3);
          for(let j=0;j<5;j++)slab(ux+side,uz+.37,.21+j*.088,.47,.026,.029,'#586c6e',3);
          slab(ux+side+.16,uz+.39,.88,.044,.052,.17,'#394b4e',3);
        }
      }
    }
    const aisle=z1-.85;
    plane(cx,aisle,span-.65,1.15,.014,campus?'#81aeb0':'#94aaa2',1);
    for(const side of [-1,1])plane(cx,aisle+side*.59,span-.6,.055,.018,'#f3ce73',1);
    const crossing=x0+Math.min(2.8,span*.19);
    for(let j=0;j<6;j++)plane(crossing+j*.20,aisle,.102,1.02,.021,'#f5f2e2',1);
  }
  function qualityFixture(n,state,s,cyl,line,signal){
    const {x,z,id,fixture}=n;
    const metal='#a6b4b6',frameColor='#425965',navy='#355d70',linen='#e5e5d8';
    const saffron='#ecae47',black='#344449',cardboard='#bd8f63';
    const blue='#438b9c',coral='#b6654d',green='#6ad9b8';
    const busy=state.busy>0,p=busy?state.progress||0:0;
    function conveyor(){
      s(0,0,.13,2.52,1.04,.58,navy);
      s(0,0,.71,2.68,1.13,.10,metal);s(0,0,.81,2.55,.88,.055,black);
      for(const side of [-1,1])s(0,side*.51,.83,2.62,.075,.10,linen);
    }
    function consoleAt(a,d,base){
      s(a,d,base,.10,.10,.24,frameColor);
      s(a,d,base+.24,.44,.14,.30,black);
      s(a,d+.075,base+.28,.32,.016,.18,signal?signal.color:'#8ad3d7');
    }
    function tote(a,d,base,w,l,color){
      s(a,d,base,w,l,.17,color);
      for(const sign of [-1,1]){
        s(a+sign*(w-.06)/2,d,base+.17,.06,l,.13,color);
        s(a,d+sign*(l-.06)/2,base+.17,w-.12,.06,.13,color);
      }
    }
    switch(fixture){
      case 'receiving': {
        // Fork-entry pallet, incoming cases and a short gravity roller table.
        for(const a of [-1.20,-.72,-.24])s(a,.02,.13,.14,1.56,.16,cardboard);
        for(let i=0;i<5;i++)s(-.72,-.65+i*.34,.29,1.26,.23,.09,'#cdab81');
        for(const a of [-1.03,-.40])for(const d of [-.36,.28])crate(x+a,z+d,.38,.57,id);
        crate(x-.75,z-.08,.80,.54,id);
        for(const d of [-.58,.58])s(.70,d,.13,1.28,.13,.59,navy);
        for(let i=0;i<6;i++)line([.16+i*.21,-.55,.72],[.16+i*.21,.55,.72],.066,metal);
        consoleAt(1.12,-.72,.78);
        break;
      }
      case 'forming': {
        conveyor();
        // Magazine of folded blanks feeds a pair of upright forming paddles.
        for(let i=0;i<6;i++)s(-.75,-.09,.87+i*.048,.81,.83,.034,i%2?cardboard:'#d1ad7d');
        const spread=.44-(busy?.14*Math.sin(Math.PI*p):0);
        for(const side of [-1,1])s(.38+side*spread,0,.87,.09,.71,.60,blue);
        if(busy)tote(.38,0,.87,.55,.59,cardboard);
        consoleAt(-1.02,-.68,.93);break;
      }
      case 'filler': {
        conveyor();
        for(const a of [-.73,.73])s(a,-.44,.87,.105,.12,1.36,frameColor);
        s(0,-.44,2.20,1.62,.15,.12,frameColor);
        cyl(0,-.04,1.83,.53,.69,metal);
        cyl(0,-.04,2.50,.56,.07,linen);cyl(0,-.04,2.57,.12,.07,frameColor);
        // Tapered hopper and dispensing nozzle remain visible above the carton.
        const slices=10;
        for(let i=0;i<slices;i++){
          const a=i*2*Math.PI/slices,b=(i+1)*2*Math.PI/slices;
          const ring=(ang,r,h)=>[x+r*Math.cos(ang),z-.04+r*Math.sin(ang),h];
          face([ring(a,.15,1.49),ring(b,.15,1.49),ring(b,.53,1.83),ring(a,.53,1.83)],shade(metal,.86+.15*Math.sin(a)),3,id);
        }
        cyl(0,-.04,1.39,.105,.13,frameColor);
        if(busy){tote(0,0,.87,.69,.59,cardboard);if(p>.20&&p<.80)cyl(0,-.04,1.08,.047,.31,saffron);}
        consoleAt(-1.04,.25,.88);break;
      }
      case 'sealer': {
        conveyor();
        for(const d of [-.49,.49])s(.09,d,.92,.16,.13,.86,navy);
        s(.09,0,1.78,.32,1.21,.15,linen);
        line([.09,-.10,1.96],[.09,.11,1.96],.34,cardboard);
        line([.09,.12,1.96],[.09,.15,1.96],.12,black);
        const head=busy?1.42-.14*Math.sin(Math.PI*p):1.44;
        s(.09,0,head,.44,.41,1.80-head,metal);
        if(busy)crate(x-.75+1.5*p,z,.87,.56,id);
        consoleAt(-1.03,-.67,.87);break;
      }
      case 'vision': {
        conveyor();
        for(const d of [-.50,.50])s(.18,d,.92,.12,.12,1.26,frameColor);
        s(.18,0,2.13,.26,1.15,.14,metal);
        s(.18,0,1.86,.36,.38,.29,navy);cyl(.18,0,1.77,.117,.10,black);
        if(busy){
          const bx=-.72+p*1.44;
          crate(x+bx,z,.87,.51,id);
          if(Math.abs(bx-.18)<.25)s(.18,0,1.244,.027,.39,.014,signal?signal.color:'#5bdac4');
        }
        consoleAt(-.93,.15,.91);
        tote(.87,-.60,.14,.70,.52,coral);break;
      }
      case 'repair': {
        for(const a of [-1.04,1.04])for(const d of [-.47,.47])s(a,d,.13,.11,.11,.75,navy);
        s(0,0,.88,2.39,1.28,.12,linen);
        s(-.62,-.60,1,.99,.12,.90,blue);
        for(const a of [-.91,-.63,-.35]){
          s(a,-.52,1.33,.055,.055,.36,metal);s(a,-.50,1.28,.085,.065,.16,saffron);
        }
        s(.36,.02,1,.77,.59,.027,'#527b73');
        if(busy)tote(.36,.03,1.03,.59,.47,cardboard);
        tote(.94,-.37,1,.40,.38,coral);
        for(let i=0;i<3;i++){
          s(-.67,.02,.22+i*.18,.72,.76,.155,navy);
          s(-.67,.41,.31+i*.18,.26,.04,.044,metal);
        }
        break;
      }
      case 'shipping': {
        for(const a of [-1.20,1.20])for(const d of [-.56,.56])s(a,d,.13,.105,.13,1.82,navy);
        for(const h of [.24,1.07,1.91]){
          s(0,0,h,2.55,1.25,.11,metal);s(0,.63,h,2.55,.07,.13,saffron);
        }
        for(let i=0;i<Math.min(8,state.completed||0);i++){
          const a=(i%4-1.5)*.55,base=i<4?.36:1.19;
          crate(x+a,z,base,.48,id);s(a,.196,base+.11,.17,.025,.10,linen);
        }
        break;
      }
      default:return false;
    }
    // Each station has a stack light. An event remains visible for nine replay seconds.
    const a=1.31,d=-.71;
    cyl(a,d,.13,.096,.10,frameColor);cyl(a,d,.23,.043,1.46,metal);
    const color=signal?.color||(state.paused?saffron:busy?green:'#7e95a1');
    cyl(a,d,1.69,.098,.21,color);cyl(a,d,1.90,.103,.045,black);
    return true;
  }
  function station(n,state,index,campus) {
    const {x,z,id,type}=n;
    const s=(dx,dz,b,w,l,h,c,rot=0)=>slab(x+dx,z+dz,b,w,l,h,c,3,id,rot);
    const cyl=(dx,dz,b,r,h,c)=>cylinder(x+dx,z+dz,b,r,h,c,id);
    const line=(a,b,r,c)=>rod([x+a[0],z+a[1],a[2]],[x+b[0],z+b[1],b[2]],r,c,id);
    const {steel,dark,teal,tealLight,cream,white,amber,orange}=palette;
    const busy=Math.max(0,Number(state.busy)||0),waiting=Math.max(0,Number(state.waiting)||0),progress=Math.max(0,Math.min(1,Number(state.progress)||0));
    
    face(Array.from({length:32},(_,i)=>[x+.15+1.95*Math.cos(i*Math.PI/16),z+.21+1.55*Math.sin(i*Math.PI/16),.012]),'rgba(6,16,32,.16)',1);
    if(layer==='load'&&run){
      const stats=run.rows.find(r=>r.id===id);
      if(stats)slab(x,z,.007,3.55,2.95,.025,stats.util>=.9?'#ff805b':stats.util>=.65?'#ffcc71':'#69c9d0',2,id);
    }
    slab(x,z,.015,3.25,2.62,.10,'#6c8377',2,id);
    // Recessed station perimeter light and front-panel service vents.
    const signal=stationSignal(id);
    const edgeColor=signal?.color||(state.paused?'#ffae53':busy?'#6fe8dd':'#95b0c8');
    s(0,1.27,.115,2.72,.038,.045,edgeColor);
    for(const side of [-1,1])s(side*1.45,1.16,.125,.15,.16,.04,steel);
    if(id===selected){
      for(const a of [-1,1])for(const d of [-1,1]){
        plane(x+a*1.51,z+d*1.27,.50,.105,.123,'#d8d970',2,id);
        plane(x+a*1.71,z+d*1.07,.105,.5,.123,'#d8d970',2,id);
      }
    }
    function standardEquipment(){
    if(campus){
      if(type==='queue'){
        for(const d of [-.65,.05,.75])for(const a of [-.8,.25]){
          s(a,d,.20,.49,.41,.16,teal);s(a,d-.20,.30,.49,.07,.40,tealLight);s(a,d,.12,.10,.21,.17,steel);
        }
      }else if(type==='source'||type==='sink'){
        for(const a of [-.85,.77]){s(a,0,.12,.27,.72,1.00,teal);s(a,.04,1.13,.32,.78,.11,cream);}
        s(-.05,-.50,.12,2.05,.12,1.05,steel);s(0,-.50,1.18,2.14,.22,.20,type==='source'?tealLight:amber);
      }else{
        s(0,0,.13,2.18,1.13,.82,teal);s(0,.05,.95,2.40,1.23,.14,cream);
        s(.30,-.22,1.09,.15,.15,.38,dark);s(.30,-.22,1.40,.81,.09,.50,dark);s(.30,-.16,1.48,.66,.035,.30,'#a7c8ab');
        s(-.72,.12,1.09,.39,.32,.04,white);s(.82,-.82,.20,.55,.50,.18,tealLight);
      }
    }else if(model.crew&&['processor','inspection'].includes(type)){
      // Manual packing bench, stock bins and a carton at the operator's reach.
      for(const a of [-.98,.98])for(const d of [-.49,.49])s(a,d,.13,.12,.12,.78,steel);
      s(0,0,.91,2.36,1.35,.13,cream);s(-.74,-.24,1.04,.60,.54,.28,tealLight);
      s(.85,-.40,1.04,.12,.12,.48,dark);s(.85,-.40,1.48,.46,.08,.31,dark);s(.85,-.35,1.53,.35,.02,.19,'#81bcca');
      if(busy)crate(x,z,1.05,.60,id);
    }else if(type==='source'){
      for(const d of [-.62,.62])s(0,d,.13,2.78,.20,.18,dark);
      s(0,0,.31,2.80,1.54,.17,steel);
      // Material bins form part of the loading equipment.
      for(const a of [-.78,0,.78]){s(a,0,.48,.65,1.25,.51,tealLight);for(let j=0;j<4;j++)s(a-.25+j*.16,.635,.50,.045,.035,.43,teal);s(a,0,.97,.70,1.31,.09,teal);s(a,0,1.065,.52,1.08,.02,dark);}
      s(-1.12,-.73,.48,.12,.12,.94,amber);s(-.74,-.73,1.36,.86,.12,.09,amber);
    }else if(type==='sink'){
      for(const a of [-1.12,1.12])for(const d of [-.55,.55])s(a,d,.13,.12,.12,1.74,teal);
      for(const h of [.25,.96,1.78]){s(0,0,h,2.44,1.31,.12,steel);s(0,.655,h,2.44,.07,.14,amber);}
      for(let i=0;i<Math.min(6,state.completed||0);i++)crate(x+(i%3-1)*.64,z,i<3?.38:1.09,.52,id);
    }else if(type==='queue'){
      s(0,0,.13,2.65,1.52,.17,steel);
      for(const d of [-.7,.7]){s(0,d,.30,2.62,.09,.37,teal);s(0,d,.66,2.68,.10,.06,amber);}
      for(let a=-1.1;a<=1.1;a+=.28)s(a,0,.30,.06,1.18,.08,dark);
    }else if(type==='inspection'||/pack|release|seal/i.test(n.name)||index%3===0){
      s(0,0,.14,2.44,1.51,.64,teal);s(0,0,.78,2.59,1.61,.14,cream);
      for(const a of [-.66,.66])s(a,-.30,.92,.15,.15,1.28,steel);
      s(0,-.30,2.15,1.77,.53,.33,cream);s(.04,-.18,1.66,.49,.40,.48,dark);
      s(.07,.04,1.59,.60,.19,.10,amber);s(-.87,.40,.91,.42,.32,.31,dark);
      s(-.87,.40,1.22,.31,.21,.02,'#93bda4');for(const a of [-.68,-.42,-.16])s(a,.765,.33,.075,.02,.31,steel);
    }else if(/assembl|shap|review/i.test(n.name)||index%3===2){
      s(0,0,.14,2.70,1.61,.28,teal);s(0,0,.42,2.78,1.69,.15,cream);
      // Open-front safety cell with mesh guard and a controller cabinet.
      for(const side of [-1,1]){
        s(side*1.34,-.82,.13,.09,.09,1.72,amber);
        s(side*1.34,.48,.13,.09,.09,1.72,amber);
        for(let j=0;j<8;j++)s(side*1.34,-.78+j*.17,.22,.023,.022,1.49,steel);
        for(let j=0;j<5;j++)s(side*1.34,-.17,.34+j*.29,.025,1.28,.024,dark);
        s(side*1.34,-.17,1.79,.08,1.38,.1,amber);
      }
      s(-1,-.35,.59,.46,.53,.91,cream);s(-1,-.07,1.11,.32,.034,.22,dark);
      s(-1,-.048,1.15,.23,.02,.12,'#56afbf');
      cyl(-.42,0,.57,.43,.20,dark);cyl(-.42,0,.77,.31,.30,amber);
      const shoulder=[-.42,0,1.08],elbow=[-.79,-.12,1.96],wrist=[.32+progress*.19,-.10,2.12-progress*.30],tip=[.68+progress*.19,.12,1.43-progress*.30];
      line(shoulder,elbow,.25,orange);line(elbow,wrist,.19,orange);
      line([-.56,-.28,1.15],[-.77,-.28,1.93],.067,steel);line([-.77,-.28,1.93],[wrist[0],-.27,wrist[2]],.045,dark);line(wrist,tip,.115,orange);
      for(const pt of [shoulder,elbow,wrist])cyl(pt[0],pt[1],pt[2]-.10,.19,.20,dark);
      // Joint housings sit across the arm axis. An external dress pack follows the elbow.
      for(const pt of [shoulder,elbow,wrist]){
        line([pt[0],pt[1]-.22,pt[2]],[pt[0],pt[1]+.22,pt[2]],.185,orange);
        line([pt[0],pt[1]+.221,pt[2]],[pt[0],pt[1]+.253,pt[2]],.133,steel);
        line([pt[0],pt[1]+.254,pt[2]],[pt[0],pt[1]+.267,pt[2]],.068,dark);
      }
      const pack=[[-.56,.20,.89],[-.88,.19,1.23],[-.94,.12,1.90],[-.78,.10,2.20],[-.47,.08,2.24],[wrist[0],.10,wrist[2]+.09]];
      for(let j=1;j<pack.length;j++)line(pack[j-1],pack[j],.036,'#384348');
      line(tip,[tip[0],tip[1],tip[2]-.16],.105,steel);
      s(tip[0],tip[1],tip[2]-.23,.32,.18,.09,dark);
      for(const side of [-1,1])s(tip[0]+side*.12,tip[1],tip[2]-.38,.055,.12,.19,steel);s(.80,.02,.58,.72,.60,.14,steel);
    }else{
      s(0,0,.14,2.51,1.57,.67,teal);s(0,0,.81,2.64,1.68,.12,steel);
      s(-.65,-.04,.94,.70,1.26,.81,cream);s(.72,-.04,.94,.37,1.26,.62,tealLight);
      line([-.38,-.22,1.34],[.63,-.22,1.34],.19,steel);line([-.38,.22,1.34],[.63,.22,1.34],.19,dark);
      s(-.52,-.1,1.73,.95,1.28,.10,cream);
      for(const post of [-.92,.08])s(post,.58,.94,.065,.05,.83,cream);
      s(-.42,.58,1.27,.89,.04,.43,'#5f9ca5');
      s(-.42,.62,1.10,.29,.045,.06,dark);
      s(-.64,.61,1.16,.43,.05,.31,dark);s(-.64,.65,1.22,.30,.025,.16,'#a8c6a3');
      for(const a of [-.52,-.31,-.10,.11])s(a,.80,.38,.09,.035,.22,dark);
    }
    if(!['source','sink','queue'].includes(type)){
      const light=state.paused?'#ff9f47':busy?'#5ce9cd':'#bbcbe0';
      cyl(1.13,-.47,.55,.045,1.02,steel);cyl(1.13,-.47,1.57,.088,.23,light);
      if(busy){if(campus)person(x-.32,z+.90,teal,id);else if(!model.crew)crate(x+.62,z+.47,.93,.43,id);}
      for(let i=1;i<Math.min(busy,5);i++){const bx=x-1.55+(i-1)*.53;if(campus)person(bx,z+1.05,teal,id);else crate(bx,z+1.07,.13,.38,id);}
    }
    }
    if(!n.fixture||!qualityFixture(n,state,s,cyl,line,signal))standardEquipment();
    for(let i=0;i<Math.min(waiting,8);i++){
      const a=x-1.19+(i%4)*.60,d=z+(type==='queue'&&!campus?-.29:1.52)+Math.floor(i/4)*.49;
      if(campus)person(a,d,i%2?teal:'#7998aa',id);else crate(a,d,type==='queue'?.39:.02,.43,id);
    }
    labels.push({n,p:project(vector(x,z,0)),state,signal,active:id===selected});
  }
  function workerPose(w){
      if(!w)return null;
      let lo=0,hi=w.intervals.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(w.intervals[mid].start<=clock)lo=mid+1;else hi=mid;}
      const seg=w.intervals[lo-1];if(!seg)return null;
      const a=model.nodes.find(n=>n.id===seg.from),b=model.nodes.find(n=>n.id===seg.to);
      if(!a||!b)return null;
      const path=workerPath(model,a,b),moving=seg.kind==='Walking',working=seg.kind==='Working';
      let x=path[0][0],z=path[0][1],dx=0,dz=-1;
      let remaining=moving?Math.max(0,Math.min(1,(clock-seg.start)/(seg.end-seg.start)))*pathLength(path):0;
      if(moving)for(let i=1;i<path.length;i++){
        const stepX=path[i][0]-x,stepZ=path[i][1]-z,len=Math.hypot(stepX,stepZ);if(!len)continue;
        dx=stepX/len;dz=stepZ/len;
        const step=Math.min(len,remaining);x+=dx*step;z+=dz*step;remaining-=step;if(remaining<=0)break;
      }
      x+=((w.id-1)%4)*.29;z+=Math.floor((w.id-1)/4)*.28;
      return {x,z,dx,dz,working,moving,seg,id:'worker-label-'+w.id};
  }
  function drawWorkers(){
    for(const w of run?.workers||[]){
      const pose=workerPose(w);if(!pose)continue;
      const {x,z,dx,dz,working,moving,seg}=pose;
      if(w.id===follow&&moving){
        const source=model.nodes.find(n=>n.id===seg.from),dest=model.nodes.find(n=>n.id===seg.to);
        const path=workerPath(model,source,dest);
        for(let i=1;i<path.length;i++){
          const [ax,az]=path[i-1],[bx,bz]=path[i],len=Math.hypot(bx-ax,bz-az);
          if(len)plane((ax+bx)/2,(az+bz)/2,len,.105,.033,'#379ea6',1,null,Math.atan2(bz-az,bx-ax));
        }
      }
      const stride=moving?Math.sin(clock*5+w.id)*.18:0,shirt=['#257d88','#4569a3','#8875a6','#52816a'][(w.id-1)%4];
      const at=(side,forward,h)=>[x-dz*side+dx*forward,z+dx*side+dz*forward,h];
      const fixture=working?model.nodes.find(n=>n.id===seg.to)?.fixture:null;
      const cycle=Math.sin(clock*3+w.id);
      for(const side of [-1,1]){
        const foot=side*stride;
        const knee=at(side*.095,.055+foot*.6,.43);
        rod(at(side*.095,0,.78),knee,.089,'#34495a',null);
        rod(knee,at(side*.095,foot,.12),.073,'#34495a',null);
        rod(at(side*.095,foot-.04,.095),at(side*.095,foot+.14,.095),.083,'#26323d',null);
        // The operator scans a label, steadies a carton or reaches for the bench tools.
        const reach=working?.36+.13*cycle*(fixture==='repair'?side:1):-.5*foot;
        const elbow=at(side*.23,reach*.5,1.02);
        const hand=at(side*.17,reach,working?1.08:.86);
        rod(at(side*.18,0,1.30),elbow,.067,shirt,null);rod(elbow,hand,.056,'#bd9478',null);
        if(side===1&&fixture==='vision'){
          rod(hand,at(.17,reach+.02,1.22),.045,'#374e59',null);
          rod(at(.17,reach+.01,1.22),at(.17,reach+.16,1.24),.067,'#49859a',null);
        }else if(side===1&&fixture==='repair'){
          rod(hand,at(.17,reach+.10,1.10),.039,'#e3a34c',null);
          rod(at(.17,reach+.10,1.10),at(.17,reach+.22,1.10),.016,'#bac7ca',null);
        }
      }
      // PPE and side-specific hands keep the selected operator readable in close-up.
      const face=at(0,.113,1.43);cylinder(face[0],face[1],face[2],.074,.08,'#bc9479',null);
      cylinder(x,z,1.53,.19,.045,'#e7bb45',null);
      cylinder(x,z,.76,.20,.58,shirt,null);cylinder(x,z,1.06,.203,.065,'#d7e697',null);
      cylinder(x,z,1.35,.135,.25,'#bc9479',null);cylinder(x,z,1.54,.165,.14,'#f3cd50',null);
      labels.push({n:{id:'worker-label-'+w.id,name:'W'+w.id+' · '+(w.role||seg.kind)},p:project([x,z,2.60]),state:{},active:false,person:true});
    }
  }
  function polygon(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}
  function draw(){
    if(disposed||!model)return;
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    if(width<2||height<2)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,width*.25,height);bg.addColorStop(0,'#e2e9e9');bg.addColorStop(.50,'#d0dcdf');bg.addColorStop(1,'#aebfc5');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    faces=[];labels=[];hitFaces=[];hitLabels=[];
    const nodes=model.nodes.map((n,i)=>({...n,x:Number.isFinite(n.x)?n.x/36:(i%4)*7,z:Number.isFinite(n.y)?n.y/30:Math.floor(i/4)*5}));
    if(!nodes.length)return;
    const loX=Math.min(...nodes.map(n=>n.x))-3.45,hiX=Math.max(...nodes.map(n=>n.x))+2.7,loZ=Math.min(...nodes.map(n=>n.z))-3.35,hiZ=Math.max(...nodes.map(n=>n.z))+3.75;
    centerX=(loX+hiX)/2;centerZ=(loZ+hiZ)/2;ca=Math.cos(camera.angle);sa=Math.sin(camera.angle);ce=Math.cos(camera.elevation);se=Math.sin(camera.elevation);
    const spanX=hiX-loX,spanZ=hiZ-loZ;
    scale=Math.min((width-34)/(Math.abs(ca)*spanX+Math.abs(sa)*spanZ),(height-58)/((Math.abs(sa)*spanX+Math.abs(ca)*spanZ)*se+3.3*ce))*camera.zoom;
    scale=Math.max(.1,scale);
    const target=(follow&&workerPose(run?.workers?.find(w=>w.id===follow)))||(focused&&nodes.find(n=>n.id===selected));
    if(target){centerX=target.x;centerZ=target.z;scale=Math.min(width/8,height/6)*camera.zoom;}
    screenY=height/2+scale*ce*(target?.id?1.04:1.58);
    floor(loX,hiX,loZ,hiZ);
    const isCampus=/campus|service queue/i.test(model.category+' '+model.title);
    hall(loX,hiX,loZ,hiZ,isCampus);
    const route=model.workStudy?.[layer]?.layout?.rows;
    if(Array.isArray(route)){
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i];
        if([a.x,a.y,b.x,b.y].some(v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))))continue;
        const dx=(b.x-a.x)/36,dz=(b.y-a.y)/30;
        if(dx||dz)slab((Number(a.x)+Number(b.x))/72,(Number(a.y)+Number(b.y))/60,.04,Math.hypot(dx,dz),.16,.04,layer==='Present'?'#67dcff':'#ffb35d',2,null,Math.atan2(dz,dx));
      }
    }
    const lookup=new Map(nodes.map(n=>[n.id,n]));
    for(const [src,dst] of model.edges){const a=lookup.get(src),b=lookup.get(dst);if(a&&b)belt(a,b);}
    const campus=/campus|service queue/i.test(model.category+' '+model.title);
    nodes.forEach((n,i)=>station(n,frame[n.id]||{},i,campus));
    if(model.crew)drawWorkers();
    faces.sort((a,b)=>a.group-b.group||a.depth-b.depth);ctx.lineJoin='round';
    const accelerated=gpu?.(ctx,faces,{width,height,dpr,loX,hiX,loZ,hiZ,eye:[sa*ce,ca*ce,se]});
    canvas.dataset.renderer=accelerated?'webgl2':'canvas';
    for(const f of faces){if(f.station)hitFaces.push(f);if(accelerated)continue;polygon(f.screen);ctx.fillStyle=f.color;ctx.fill();if(f.outline&&scale>=10){ctx.lineWidth=.55;ctx.strokeStyle='rgba(42,61,51,.25)';ctx.stroke();}}
    // Labels stay readable when the floor turns and clear the front edge of each machine.
    const occupied=[];
    labels.sort((a,b)=>Number(b.active)-Number(a.active)||b.p[2]-a.p[2]);
    for(const item of labels){
      const name=item.n.name.length>19?item.n.name.slice(0,17)+'…':item.n.name;
      const queued=Number(item.state.waiting)||0, text=layer==='load'&&run?.rows.some(r=>r.id===item.n.id)?name+' · '+Math.round(100*run.rows.find(r=>r.id===item.n.id).util)+'%':name+(queued?' · '+queued+' waiting':'');
      ctx.font=(item.active?'600 ':'500 ')+'11px "Segoe UI",sans-serif';
      const badgeText=item.signal?name+' · '+item.signal.label:text;
      const bw=ctx.measureText(badgeText).width+19,bh=21,left=Math.max(3,Math.min(width-bw-3,item.p[0]-bw/2)),top=item.p[1]+Math.max(9,scale*.74);
      if((target&&!item.person&&item.n.id!==target.id)||item.p[0]<0||item.p[0]>width||top<0||top>height-3||occupied.some(r=>left<r.x+r.w+3&&left+bw>r.x-3&&top<r.y+r.h+2&&top+bh>r.y-2))continue;
      const r={x:left,y:top,w:bw,h:bh,id:item.n.id};occupied.push(r);hitLabels.push({...r,worker:item.person?Number(item.n.id.slice(13)):0});
      ctx.beginPath();ctx.roundRect(left,top,bw,bh,5);ctx.fillStyle=item.active?'#c9f4ff':'rgba(16,32,52,.94)';ctx.fill();ctx.strokeStyle=item.active?'#dce6a0':'#75877b';ctx.lineWidth=.8;ctx.stroke();
      ctx.fillStyle=item.signal?(item.active?'#654411':item.signal.color):item.active?'#273529':'#e0e6da';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(badgeText,left+bw/2,top+bh/2);
    }
  }
  function pick(x,y){
    const badge=hitLabels.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);if(badge)return badge.worker?{worker:badge.worker}:badge.id;
    function inside(pts){let value=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const [ax,ay]=pts[i],[bx,by]=pts[j];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)value=!value;
    }return value;}
    for(let i=hitFaces.length-1;i>=0;i--)if(inside(hitFaces[i].screen))return hitFaces[i].station;
  }
  function down(e){if(pointer||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,angle:camera.angle,elevation:camera.elevation,moved:false};canvas.setPointerCapture?.(e.pointerId);}
  function move(e){if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>4)pointer.moved=true;if(pointer.moved){
    camera.angle=pointer.angle+dx*.008;camera.elevation=Math.max(.18,Math.min(1.28,pointer.elevation+dy*.006));draw();}}
  function up(e){if(!pointer||pointer.id!==e.pointerId)return;const click=!pointer.moved;pointer=null;if(click){const rect=canvas.getBoundingClientRect(),id=pick(e.clientX-rect.left,e.clientY-rect.top);if(id?.worker)onWorker(id.worker);else if(id)onSelect(id);}}
  function cancel(){pointer=null;}
  function wheel(e){e.preventDefault();camera.zoom=Math.max(.55,Math.min(3,camera.zoom*Math.exp(-e.deltaY*.0014)));draw();}
  function reset(){focused=false;Object.assign(camera,{angle:.43,elevation:.59,zoom:1});draw();}
  function keydown(e){const actions={ArrowLeft:()=>camera.angle-=.13,ArrowRight:()=>camera.angle+=.13,ArrowUp:()=>camera.elevation=Math.min(1.28,camera.elevation+.08),ArrowDown:()=>camera.elevation=Math.max(.18,camera.elevation-.08),'+':()=>camera.zoom=Math.min(3,camera.zoom*1.12),'=':()=>camera.zoom=Math.min(3,camera.zoom*1.12),'-':()=>camera.zoom=Math.max(.55,camera.zoom/1.12),Home:reset};
    if(!actions[e.key])return;e.preventDefault();actions[e.key]();draw();}
  if(!canvas.hasAttribute('tabindex'))canvas.tabIndex=0;
  canvas.style.touchAction='none';
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,wheel,keydown};
  for(const [name,handler] of Object.entries(listeners))canvas.addEventListener(name,handler,name==='wheel'?{passive:false}:false);
  const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;resize?.observe(canvas);
  return {update(nextModel,nextFrame,nextSelected,nextLayer='live',nextRun=null,nextClock=0,nextFollow=0){follow=nextFollow;clock=nextClock;layer=nextLayer;run=nextRun;model=nextModel;frame=nextFrame||{};selected=nextSelected;draw();},reset,focus(){focused=true;camera.zoom=1;draw();},
    dispose(){disposed=true;resize?.disconnect();for(const [name,handler] of Object.entries(listeners))canvas.removeEventListener(name,handler);pointer=null;faces=[];hitFaces=[];}};
}
