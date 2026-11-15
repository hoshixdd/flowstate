import {simulateRun,sampleSummary} from './engine.mjs';
function evaluate(model,config,trace,onProgress){
 const rates=[],units=[];let primary;
 for(let i=0;i<config.reps;i++){const r=simulateRun(model,{...config,seed:(config.seed+i)>>>0},trace&&i===0);if(i===0)primary=r;rates.push(r.throughput);units.push(r.completed);onProgress();}
 return {primary,units,throughput:sampleSummary(rates)};
}
self.onmessage=e=>{
 const {model,config,mode}=e.data;let progress=0;const tick=()=>self.postMessage({progress:++progress});
 try{
 if(mode==='tournament'){
   const stations=model.nodes.filter(n=>['processor','inspection'].includes(n.type)&&(n.servers??1)<64);
   if(stations.length>12||!stations.length||stations.length*config.reps>120)throw Error('Capacity experiments support 1–12 eligible stations and at most 120 candidate replications. Reduce replications or model size.');
   const base=evaluate(model,config,false,tick), alternatives=[];
   for(const n of stations){const copy=structuredClone(model),s=copy.nodes.find(x=>x.id===n.id);s.servers=(s.servers??1)+1;const candidate=evaluate(copy,config,false,tick);
    const window=(config.horizon-config.warmup)/3600,paired=sampleSummary(candidate.units.map((v,i)=>(v-base.units[i])/window));
    alternatives.push({id:n.id,name:n.name,servers:s.servers,rate:candidate.throughput.mean,gain:paired.mean,margin:paired.margin,cost:candidate.primary.cost-base.primary.cost});
   }
   alternatives.sort((a,b)=>b.rate-a.rate||a.cost-b.cost);self.postMessage({alternatives,base:base.throughput.mean});
 }else{self.postMessage({result:evaluate(model,config,true,tick)});}
 }catch(error){self.postMessage({error:error.message});}
};