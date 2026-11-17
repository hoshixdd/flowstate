const $=id=>document.getElementById(id);
const fmt=n=>n.toLocaleString(undefined,{maximumFractionDigits:2});
const lotTime=t=>fmt(t)+' s';

export function openMaterials({model,run,config,baseline,modal,escape,download,example,replay,apply}){
  const inventory=run?.inventory;
  const summary=r=>({completed:r.completed,shortage:r.inventory.shortageSeconds,waiting:r.inventory.waiting});
  function panel(view,content){
    modal('Materials and lots','<nav class="quality-tabs" aria-label="Material study"><button id="matReview" aria-pressed="'+(view==='review')+'">Lot review</button><button id="matSchedule" aria-pressed="'+(view==='schedule')+'">Delivery schedule</button></nav>'+content+'<div class="group"><button id="matExample">Open carton supply example</button></div>');
    $('matReview').onclick=review;$('matSchedule').onclick=schedule;$('matExample').onclick=example;
  }
  function review(){
    if(!inventory){
      panel('review','<p>'+ (model.supply?'Run this revision to review material use.':'Set a delivery schedule to track material on this line, or open the carton supply example.')+'</p>');return;
    }
    const inv=inventory,r=run,clock=r.config;
    const rows=inv.lots.map((l,i)=>'<tr><th>'+escape(l.id)+'</th><td>'+lotTime(l.at)+'</td><td>'+l.received+'</td><td>'+l.used+'</td><td>'+(l.received-l.used)+'</td><td>'+l.good+'</td><td>'+l.escaped+'</td><td>'+l.scrapped+'</td><td>'+l.rejected+'</td><td>'+(l.used-l.good-l.escaped-l.scrapped-l.rejected)+'</td></tr>').join('');
    let comparison='';
    if(baseline){
      const now=summary(r);
      comparison='<h3>Same shift, two delivery schedules</h3><div class="datagrid"><table><tr><th>Measure</th><th>Before</th><th>After</th></tr>'+[['Completed units','completed'],['Shortage (s)','shortage'],['Orders still waiting','waiting']].map(([l,k])=>'<tr><th>'+l+'</th><td>'+fmt(baseline[k])+'</td><td>'+fmt(now[k])+'</td></tr>').join('')+'</table></div>';
    }
    const startState=inv.trace.findLast(s=>s.time<=clock.warmup);
    const firstWait=startState?.waiting>0?{time:clock.warmup}:inv.trace.find(s=>s.waiting>0&&s.time>=clock.warmup);
    panel('review','<h3>'+escape(inv.name)+' at receiving</h3><div class="q-facts">'+[['In stock at end',inv.onHand],['Orders awaiting material',inv.waiting],['Peak orders waiting',inv.peakWaiting],['Shortage minutes',fmt(inv.shortageSeconds/60)]].map(([l,v])=>'<div><b>'+v+'</b><small>'+l+'</small></div>').join('')+'</div><p>Shortage time counts periods with at least one unfilled material request during seconds '+fmt(clock.warmup)+'–'+fmt(clock.horizon)+'. Total waiting across orders: '+fmt(inv.orderWaitSeconds/60)+' order-minutes.</p>'+
      (firstWait?'<button id="matJump">Replay shortage at '+lotTime(firstWait.time)+'</button>':'')+comparison+
      '<h3>Lot balance</h3><p>Counts cover the full run. Stock is issued in delivery order, one material unit per order.</p><div class="datagrid"><table><tr><th>Lot</th><th>Due</th><th>Received</th><th>Issued</th><th>Stock</th><th>Good shipped</th><th>Faulty shipped</th><th>Scrap</th><th>Rejected</th><th>In line</th></tr>'+rows+'</table></div>'+
      '<h3>Traceability</h3><label>Supplier lot<select id="matPick"><option value="">All orders</option>'+inv.lots.map((l,i)=>'<option value="'+i+'">'+escape(l.id)+'</option>').join('')+'</select></label><p id="matMatches"></p><label>Order number<input type="number" id="matOrder" min="1" step="1"></label><div id="matGenealogy" aria-live="polite"></div><button id="matExport">Export order and lot CSV</button>');
    if(firstWait)$('matJump').onclick=()=>replay({time:firstWait.time,stationId:model.nodes.find(n=>n.type==='source').id,kind:'material shortage'});
    function lookup(){
      const job=inv.orders[$('matOrder').valueAsNumber-1],lot=$('matPick').value;
      if(!job||(lot!==''&&job.lot!==inv.lots[Number(lot)].id)){$('matGenealogy').textContent='No matching order for this selection.';return;}
      const events=(r.qualityTrace||[]).filter(e=>e.jobId===job.id);
      $('matGenealogy').innerHTML='<p><strong>Order '+job.id+' · '+escape(job.status)+'</strong><br>Lot '+escape(job.lot??'unassigned')+' · ordered '+lotTime(job.ordered)+(job.issued!=null?' · issued '+lotTime(job.issued):'')+(job.ended!=null?' · final disposition '+lotTime(job.ended):'')+'</p>'+events.map((e,i)=>'<button data-material-event="'+i+'">'+escape(e.kind)+' · '+escape(model.nodes.find(n=>n.id===e.stationId)?.name??e.stationId)+' · '+lotTime(e.time)+'</button>').join(' ');
      document.querySelectorAll('[data-material-event]').forEach(b=>b.onclick=()=>replay(events[Number(b.dataset.materialEvent)]));
    }
    function choose(){
      const lot=$('matPick').value,orders=lot===''?inv.orders:inv.orders.filter(j=>j.lot===inv.lots[Number(lot)].id);
      $('matMatches').textContent=orders.length+' matching orders'+(orders.length?' · '+orders.slice(0,10).map(j=>'#'+j.id).join(', ')+(orders.length>10?' …':''):'');
      $('matOrder').value=orders[0]?.id??'';lookup();
    }
    $('matPick').onchange=choose;$('matOrder').oninput=lookup;choose();
    $('matExport').onclick=()=>{
      const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
      const arr=[['Order','Product','Lot','Ordered s','Issued s','Ended s','Status'],...inv.orders.map(j=>[j.id,j.product,j.lot,j.ordered,j.issued,j.ended,j.status])];
      download('flowstate-lot-trace.csv','\ufeff'+arr.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv');
    };
  }
  function schedule(){
    const s=model.supply??{name:'Carton blank',lots:[{id:'LOT-A',at:0,quantity:30}]};
    panel('schedule','<form id="matForm"><label>Material used at receiving<input id="matName" value="'+escape(s.name)+'" maxlength="80" required></label><p>One order consumes one unit of this material. Enter 0 seconds for opening stock. Orders wait at receiving when stock is empty. The current run ends at '+fmt(config.horizon)+' s.</p><div class="datagrid"><table id="matTable"><thead><tr><th>Supplier lot ID</th><th>Delivery at (s)</th><th>Quantity</th><th></th></tr></thead><tbody id="matLines"></tbody></table></div><div class="group"><button type="button" id="matAdd">Add delivery</button><button class="primary">Save schedule and run</button></div><p id="matError" role="alert"></p></form>'+(model.supply?'<button id="matUnlimited">Use unlimited material</button>':''));
    function add(l){
      if($('matLines').children.length>=200){$('matError').textContent='Use at most 200 lots.';return;}
      const row=document.createElement('tr');
      row.innerHTML='<td><input aria-label="Lot ID" maxlength="64" required value="'+escape(l.id)+'"></td><td><input aria-label="Delivery second" type="number" min="0" max="604800" step="any" required value="'+l.at+'"></td><td><input aria-label="Lot quantity" type="number" min="1" max="1000000" step="1" required value="'+l.quantity+'"></td><td><button type="button">Remove</button></td>';
      row.querySelector('button').onclick=()=>row.remove();$('matLines').append(row);
    }
    s.lots.forEach(add);$('matAdd').onclick=()=>add({id:'',at:0,quantity:1});
    $('matForm').onsubmit=e=>{
      e.preventDefault();const name=$('matName').value.trim(),ids=new Set(),lots=[];
      for(const row of $('matLines').children){
        const [code,time,qty]=row.querySelectorAll('input'),id=code.value.trim();
        if(!id||ids.has(id)){$('matError').textContent='Give every delivery a distinct lot ID.';return;}
        ids.add(id);lots.push({id,at:time.valueAsNumber,quantity:qty.valueAsNumber});
      }
      if(!name){$('matError').textContent='Enter a material name.';return;}
      apply({name,lots},inventory?summary(run):null);
    };
    if($('matUnlimited'))$('matUnlimited').onclick=()=>apply(null,null);
  }
  if(model.supply)review();else schedule();
}
