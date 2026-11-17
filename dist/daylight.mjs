// Render the same triangulated scene used by the offline canvas fallback.
export function createDaylightRenderer(){
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:true});
  if(!gl)return null;
  function program(vertex,fragment){
    const p=gl.createProgram();
    for(const [type,src] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,'#version 300 es\n'+src);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  const vertex=`precision highp float;
    layout(location=0) in vec3 position; layout(location=1) in vec3 screen;
    layout(location=2) in vec4 tint;
    uniform vec2 viewport;uniform vec4 bounds;uniform float depthRange;uniform bool shadowPass;
    out vec4 pigment;out vec3 world;out vec3 lightCoord;
    void main(){
      world=position; pigment=tint;
      lightCoord=vec3((position.xy+position.z*vec2(.62,.39)-bounds.xy)/bounds.zw, .80-position.z*.09);
      gl_Position=shadowPass?vec4(lightCoord*2.-1.,1.):vec4(screen.x/viewport.x*2.-1.,1.-screen.y/viewport.y*2.,-screen.z/depthRange,1.);
    }`;
  const fragment=`precision highp float;
    in vec3 world;in vec4 pigment;in vec3 lightCoord;
    uniform sampler2D shadows; uniform bool shadowPass; uniform vec3 eye;
    out vec4 pixel;
    void main(){
      if(shadowPass){if(pigment.a<.99)discard;pixel=vec4(1.);return;}
      vec3 N=normalize(cross(dFdx(world),dFdy(world)));if(dot(N,eye)<0.)N=-N;
      vec3 L=normalize(vec3(-.62,-.39,1.)),H=normalize(L+eye);
      float visibility=0.;
      for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
        float stored=texture(shadows,lightCoord.xy+vec2(x,y)/1024.).r;
        visibility+=step(lightCoord.z-.004,stored)/9.;
      }
      vec3 c=pigment.rgb;
      float grain=fract(sin(dot(floor(world.xy*32.),vec2(41.7,17.9)))*4375.2)-.5;
      float gloss=1.-smoothstep(.05,.32,max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b)));
      float spec=pow(max(dot(N,H),0.),mix(8.,45.,gloss))*gloss*.21*visibility;
      vec3 ambient=mix(vec3(.57,.65,.72),vec3(.86,.90,.93),clamp(N.z,0.,1.));
      vec3 lit=c*(ambient+vec3(.34,.32,.26)*max(dot(N,L),0.)*visibility)+spec;
      pixel=vec4(lit+grain*.021*(.3+.7*abs(N.z)),pigment.a);
    }`;
  const p=program(vertex,fragment),buffer=gl.createBuffer(),fb=gl.createFramebuffer(),shadow=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,shadow);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,1024,1024,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  for(const [key,value] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadow,0);
  gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)return null;
  const u=Object.fromEntries(['viewport','bounds','depthRange','eye','shadowPass','shadows'].map(k=>[k,gl.getUniformLocation(p,k)]));
  const colors=new Map();
  function color(s){
    if(colors.has(s))return colors.get(s);
    let c=s.startsWith('#')?s.slice(1).match(/../g).map(x=>parseInt(x,16)):s.match(/[\d.]+/g).map(Number);
    const rgba=[c[0]/255,c[1]/255,c[2]/255,c[3]??1];colors.set(s,rgba);return rgba;
  }
  let vertices=new Float32Array(65536);
  return function render(ctx,faces,{width,height,dpr,loX,hiX,loZ,hiZ,eye}){
    if(gl.isContextLost())return false;
    const w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
    let offset=0;
    for(const f of faces){
      const rgba=color(f.color),needed=offset+30*(f.world.length-2);
      if(needed>vertices.length){const next=new Float32Array(Math.max(needed,vertices.length*2));next.set(vertices);vertices=next;}
      for(let i=1;i<f.world.length-1;i++)for(const j of [0,i,i+1]){
        vertices.set(f.world[j],offset);vertices.set(f.screen[j],offset+3);vertices.set(rgba,offset+6);offset+=10;
      }
    }
    gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices.subarray(0,offset),gl.DYNAMIC_DRAW);
    for(const [idx,n,start] of [[0,3,0],[1,3,12],[2,4,24]]){gl.enableVertexAttribArray(idx);gl.vertexAttribPointer(idx,n,gl.FLOAT,false,40,start);}
    gl.uniform2f(u.viewport,width,height);gl.uniform4f(u.bounds,loX-6,loZ-6,hiX-loX+12,hiZ-loZ+12);gl.uniform1f(u.depthRange,hiX-loX+hiZ-loZ+30);gl.uniform3fv(u.eye,eye);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,1024,1024);gl.clear(gl.DEPTH_BUFFER_BIT);gl.uniform1i(u.shadowPass,1);gl.drawArrays(gl.TRIANGLES,0,offset/10);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(u.shadowPass,0);gl.bindTexture(gl.TEXTURE_2D,shadow);gl.uniform1i(u.shadows,0);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,offset/10);gl.disable(gl.BLEND);
    ctx.drawImage(surface,0,0,width,height);return true;
  };
}
