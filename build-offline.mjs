import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const folder=path.resolve('dist');
const read=name=>readFileSync(path.join(folder,name),'utf8');
const files=Object.fromEntries(['work-study.mjs','study-lab.mjs','model.mjs','factory.mjs','engine.mjs','worker.mjs','app.mjs'].map(name=>[name,read(name)]));
// A file-origin worker cannot fetch a second blob module in some browsers.
files['worker.mjs']=files['engine.mjs'].replace(/^export \{[^\n]+$/m,'')+'\n'+files['worker.mjs'].replace(/^import [^\n]+$/m,'');
files['app.mjs']=files['app.mjs'].replaceAll("new Worker(workerURL,{type:'module'})","new Worker(workerURL)");
const inline=JSON.stringify(files).replace(/</g,'\\u003c');
const boot=`const sources=${inline};
const urls={};
for(const name of ['work-study.mjs','study-lab.mjs','model.mjs','factory.mjs','engine.mjs','worker.mjs','app.mjs']){
 let source=sources[name];
 for(const [dependency,url] of Object.entries(urls))source=source.replaceAll("'./"+dependency+"'",JSON.stringify(url));
 urls[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
}
import(urls['app.mjs']).catch(error=>{document.getElementById('notice').textContent='Studio failed to open: '+error.message;});`;
const html=read('index.html').replace('<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="studio.css">',()=>'<style>'+read('style.css')+'\n'+read('studio.css')+'</style>').replace('<script type="module" src="app.mjs"></script>',()=>'<script type="module">'+boot+'</script>');
writeFileSync(process.argv[2],html);
