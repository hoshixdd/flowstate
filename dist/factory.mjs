// Orthographic software renderer. World coordinates are [east, south, height].
export function createFactory(canvas, onSelect = () => {}) {
  const ctx = canvas.getContext('2d');
  const palette = { steel:'#a7b5b1', dark:'#314846', teal:'#447b70', tealLight:'#6da492',
    cream:'#e4e8d9', white:'#f7f5e9', rubber:'#465856', amber:'#dda94c', orange:'#d98247', ink:'#223c35' };
  const camera = { angle:.53, elevation:.50, zoom:1 };
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
    faces.push({screen,color,group,station,outline,depth});
  }
  function slab(x,z,b,w,l,h,color,group=3,station=null,rot=0,outline=true) {
    const c=Math.cos(rot),s=Math.sin(rot);
    const corners=[[-w/2,-l/2],[w/2,-l/2],[w/2,l/2],[-w/2,l/2]].map(([a,d])=>[x+a*c-d*s,z+a*s+d*c]);
    const top=corners.map(([a,d])=>[a,d,b+h]), bottom=corners.map(([a,d])=>[a,d,b]);
    face(top,shade(color,1.035),group,station,outline);
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
    slab((loX+hiX)/2,(loZ+hiZ)/2,-.26,hiX-loX,hiZ-loZ,.25,'#415751',0,null,0,false);
    for(let x=Math.ceil(loX/2)*2;x<hiX;x+=2)plane(x,(loZ+hiZ)/2,.016,hiZ-loZ,.002,'#526760',1);
    for(let z=Math.ceil(loZ/2)*2;z<hiZ;z+=2)plane((loX+hiX)/2,z,hiX-loX,.016,.002,'#526760',1);
    for(const z of [loZ+.28,hiZ-.28])plane((loX+hiX)/2,z,hiX-loX-.56,.06,.008,'#73887a',1);
    for(const x of [loX+.28,hiX-.28])plane(x,(loZ+hiZ)/2,.06,hiZ-loZ-.56,.008,'#73887a',1);
  }
  function station(n,state,index,campus) {
    const {x,z,id,type}=n;
    const s=(dx,dz,b,w,l,h,c,rot=0)=>slab(x+dx,z+dz,b,w,l,h,c,3,id,rot);
    const cyl=(dx,dz,b,r,h,c)=>cylinder(x+dx,z+dz,b,r,h,c,id);
    const line=(a,b,r,c)=>rod([x+a[0],z+a[1],a[2]],[x+b[0],z+b[1],b[2]],r,c,id);
    const {steel,dark,teal,tealLight,cream,white,amber,orange}=palette;
    const busy=Math.max(0,Number(state.busy)||0),waiting=Math.max(0,Number(state.waiting)||0),progress=Math.max(0,Math.min(1,Number(state.progress)||0));
    plane(x+.17,z+.23,3.22,2.68,.012,'#30463f',1);
    slab(x,z,.015,3.25,2.62,.10,'#6c8377',2,id);
    if(id===selected){
      for(const a of [-1,1])for(const d of [-1,1]){
        plane(x+a*1.51,z+d*1.27,.50,.105,.123,'#d8d970',2,id);
        plane(x+a*1.71,z+d*1.07,.105,.5,.123,'#d8d970',2,id);
      }
    }
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
    }else if(type==='source'){
      for(const d of [-.62,.62])s(0,d,.13,2.78,.20,.18,dark);
      s(0,0,.31,2.80,1.54,.17,steel);
      // Material bins form part of the loading equipment.
      for(const a of [-.78,0,.78]){s(a,0,.48,.65,1.25,.51,tealLight);s(a,0,.97,.70,1.31,.09,teal);s(a,0,1.065,.52,1.08,.02,dark);}
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
      cyl(-.42,0,.57,.43,.20,dark);cyl(-.42,0,.77,.31,.30,amber);
      const shoulder=[-.42,0,1.08],elbow=[-.79,-.12,1.96],wrist=[.32+progress*.19,-.10,2.12-progress*.30],tip=[.68+progress*.19,.12,1.43-progress*.30];
      line(shoulder,elbow,.20,orange);line(elbow,wrist,.14,amber);line(wrist,tip,.115,orange);
      for(const pt of [shoulder,elbow,wrist])cyl(pt[0],pt[1],pt[2]-.10,.19,.20,dark);
      line(tip,[tip[0],tip[1],tip[2]-.23],.085,dark);s(.80,.02,.58,.72,.60,.14,steel);
    }else{
      s(0,0,.14,2.51,1.57,.67,teal);s(0,0,.81,2.64,1.68,.12,steel);
      s(-.65,-.04,.94,.70,1.26,.81,cream);s(.72,-.04,.94,.37,1.26,.62,tealLight);
      line([-.38,-.22,1.34],[.63,-.22,1.34],.19,steel);line([-.38,.22,1.34],[.63,.22,1.34],.19,dark);
      s(-.64,.61,1.16,.43,.05,.31,dark);s(-.64,.65,1.22,.30,.025,.16,'#a8c6a3');
      for(const a of [-.52,-.31,-.10,.11])s(a,.80,.38,.09,.035,.22,dark);
    }
    if(!['source','sink','queue'].includes(type)){
      const light=busy?'#88c858':'#bac6bc';
      cyl(1.13,-.47,.55,.045,1.02,steel);cyl(1.13,-.47,1.57,.088,.23,light);
      if(busy){if(campus)person(x-.32,z+.90,teal,id);else crate(x+.62,z+.47,.93,.43,id);}
      for(let i=1;i<Math.min(busy,5);i++){const bx=x-1.55+(i-1)*.53;if(campus)person(bx,z+1.05,teal,id);else crate(bx,z+1.07,.13,.38,id);}
    }
    for(let i=0;i<Math.min(waiting,8);i++){
      const a=x-1.19+(i%4)*.60,d=z+(type==='queue'&&!campus?-.29:1.52)+Math.floor(i/4)*.49;
      if(campus)person(a,d,i%2?teal:'#7998aa',id);else crate(a,d,type==='queue'?.39:.02,.43,id);
    }
    labels.push({n,p:project(vector(x,z,0)),state,active:id===selected});
  }
  function polygon(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}
  function draw(){
    if(disposed||!model)return;
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    if(width<2||height<2)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,width*.45,height);bg.addColorStop(0,'#1a2b29');bg.addColorStop(1,'#101e1e');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    faces=[];labels=[];hitFaces=[];hitLabels=[];
    const nodes=model.nodes.map((n,i)=>({...n,x:Number.isFinite(n.x)?n.x/36:(i%4)*7,z:Number.isFinite(n.y)?n.y/30:Math.floor(i/4)*5}));
    if(!nodes.length)return;
    const loX=Math.min(...nodes.map(n=>n.x))-2.45,hiX=Math.max(...nodes.map(n=>n.x))+2.45,loZ=Math.min(...nodes.map(n=>n.z))-2.18,hiZ=Math.max(...nodes.map(n=>n.z))+2.50;
    centerX=(loX+hiX)/2;centerZ=(loZ+hiZ)/2;ca=Math.cos(camera.angle);sa=Math.sin(camera.angle);ce=Math.cos(camera.elevation);se=Math.sin(camera.elevation);
    const spanX=hiX-loX,spanZ=hiZ-loZ;
    scale=Math.min((width-34)/(Math.abs(ca)*spanX+Math.abs(sa)*spanZ),(height-44)/((Math.abs(sa)*spanX+Math.abs(ca)*spanZ)*se+3.3*ce))*camera.zoom;
    scale=Math.max(.1,scale);screenY=height/2+scale*ce*.72;
    floor(loX,hiX,loZ,hiZ);
    const lookup=new Map(nodes.map(n=>[n.id,n]));
    for(const [src,dst] of model.edges){const a=lookup.get(src),b=lookup.get(dst);if(a&&b)belt(a,b);}
    const campus=/campus|service queue/i.test(model.category+' '+model.title);
    nodes.forEach((n,i)=>station(n,frame[n.id]||{},i,campus));
    faces.sort((a,b)=>a.group-b.group||a.depth-b.depth);ctx.lineJoin='round';
    for(const f of faces){polygon(f.screen);ctx.fillStyle=f.color;ctx.fill();if(f.outline&&scale>=10){ctx.lineWidth=.55;ctx.strokeStyle='rgba(42,61,51,.25)';ctx.stroke();}if(f.station)hitFaces.push(f);}
    // Labels stay readable when the floor turns and clear the front edge of each machine.
    const occupied=[];
    labels.sort((a,b)=>Number(b.active)-Number(a.active)||b.p[2]-a.p[2]);
    for(const item of labels){
      const name=item.n.name.length>19?item.n.name.slice(0,17)+'…':item.n.name;
      const queued=Number(item.state.waiting)||0, text=name+(queued?' · '+queued+' waiting':'');
      ctx.font=(item.active?'600 ':'500 ')+'11px "Segoe UI",sans-serif';
      const bw=ctx.measureText(text).width+19,bh=21,left=Math.max(3,Math.min(width-bw-3,item.p[0]-bw/2)),top=item.p[1]+Math.max(9,scale*.74);
      if(top>height-3||occupied.some(r=>left<r.x+r.w+3&&left+bw>r.x-3&&top<r.y+r.h+2&&top+bh>r.y-2))continue;
      const r={x:left,y:top,w:bw,h:bh,id:item.n.id};occupied.push(r);hitLabels.push(r);
      ctx.beginPath();ctx.roundRect(left,top,bw,bh,5);ctx.fillStyle=item.active?'#d4df8c':'rgba(27,43,40,.96)';ctx.fill();ctx.strokeStyle=item.active?'#dce6a0':'#75877b';ctx.lineWidth=.8;ctx.stroke();
      ctx.fillStyle=item.active?'#273529':'#e0e6da';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,left+bw/2,top+bh/2);
    }
  }
  function pick(x,y){
    const badge=hitLabels.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);if(badge)return badge.id;
    function inside(pts){let value=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){
      const [ax,ay]=pts[i],[bx,by]=pts[j];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)value=!value;
    }return value;}
    for(let i=hitFaces.length-1;i>=0;i--)if(inside(hitFaces[i].screen))return hitFaces[i].station;
  }
  function down(e){if(pointer||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,angle:camera.angle,elevation:camera.elevation,moved:false};canvas.setPointerCapture?.(e.pointerId);}
  function move(e){if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>4)pointer.moved=true;if(pointer.moved){
    camera.angle=pointer.angle+dx*.008;camera.elevation=Math.max(.18,Math.min(1.28,pointer.elevation+dy*.006));draw();}}
  function up(e){if(!pointer||pointer.id!==e.pointerId)return;const click=!pointer.moved;pointer=null;if(click){const rect=canvas.getBoundingClientRect(),id=pick(e.clientX-rect.left,e.clientY-rect.top);if(id)onSelect(id);}}
  function cancel(){pointer=null;}
  function wheel(e){e.preventDefault();camera.zoom=Math.max(.55,Math.min(3,camera.zoom*Math.exp(-e.deltaY*.0014)));draw();}
  function reset(){Object.assign(camera,{angle:.53,elevation:.50,zoom:1});draw();}
  function keydown(e){const actions={ArrowLeft:()=>camera.angle-=.13,ArrowRight:()=>camera.angle+=.13,ArrowUp:()=>camera.elevation=Math.min(1.28,camera.elevation+.08),ArrowDown:()=>camera.elevation=Math.max(.18,camera.elevation-.08),'+':()=>camera.zoom=Math.min(3,camera.zoom*1.12),'=':()=>camera.zoom=Math.min(3,camera.zoom*1.12),'-':()=>camera.zoom=Math.max(.55,camera.zoom/1.12),Home:reset};
    if(!actions[e.key])return;e.preventDefault();actions[e.key]();draw();}
  if(!canvas.hasAttribute('tabindex'))canvas.tabIndex=0;
  canvas.style.touchAction='none';
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel,wheel,keydown};
  for(const [name,handler] of Object.entries(listeners))canvas.addEventListener(name,handler,name==='wheel'?{passive:false}:false);
  const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;resize?.observe(canvas);
  return {update(nextModel,nextFrame,nextSelected){model=nextModel;frame=nextFrame||{};selected=nextSelected;draw();},reset,
    dispose(){disposed=true;resize?.disconnect();for(const [name,handler] of Object.entries(listeners))canvas.removeEventListener(name,handler);pointer=null;faces=[];hitFaces=[];}};
}

