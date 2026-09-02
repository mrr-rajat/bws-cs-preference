// Screenshots of every screen at iPad and iPhone widths (+ dark mode samples). Usage: node test/shots.js [baseUrl]
const { spawn } = require('child_process'); const fs = require('fs');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; const port=9336;
const base=process.argv[2]||'http://127.0.0.1:8765/';
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--user-data-dir=/tmp/bws-chrome-profile-s',`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{ for(let i=0;i<50;i++){try{await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();break;}catch(e){await sleep(200);}}
 const t=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 const ws=new WebSocket(t.webSocketDebuggerUrl); let id=0; const pend=new Map();
 const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
 ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result);}};
 await new Promise(r=>ws.onopen=r); await send('Page.enable'); await send('Runtime.enable');
 const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.value;
 fs.mkdirSync('test/shots',{recursive:true});
 const shot=async(name,w,h,maxH)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true});await sleep(250);
   const r=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:w,height:maxH||h,scale:1}});fs.writeFileSync(`test/shots/${name}.png`,Buffer.from(r.data,'base64'));};
 await send('Page.navigate',{url:base+'index.html?nosw=1'}); await sleep(800);
 await ev(`(async()=>{const C=BWSCore; const recs={}; const demo={age:'28',admission_date:'2026-09-01',surgery_date:'2026-09-03',height_cm:'156',weight_kg:'68',indication_cs:'Previous CS',asa_grade:'II',education:'Graduate',occupation:'Homemaker',monthly_income_inr:'25000',parity:'1',live_issues:'1',previous_cs:'Yes',previous_cs_count:'1',other_surgery:'No',administration_mode:'Interviewer-administered (Hindi)',interviewer:'Anshul'};
   for(const [pid,name,st,n] of [[1,'Sunita Devi','complete',12],[2,'','complete',12],[3,'Pooja Sharma','in_progress',4]]){const r=C.newRecord(pid,BWS_DESIGN); r.demo=Object.assign({name},demo); r.apais={1:3,2:3,3:4,4:3,5:2,6:5}; r.status=st; for(let i=1;i<=n;i++){const t=r.tasks[i];t.best=t.options[0];t.worst=t.options[1];t.startedAt=t.completedAt=new Date().toISOString();} if(pid===1) r.exportedAt=new Date(Date.now()+1000).toISOString(); recs[pid]=r;}
   localStorage.setItem('bws.records.v1',JSON.stringify(recs)); localStorage.setItem('bws.settings.v1',JSON.stringify({recordName:true,exportLimit:5,interviewer:'Anshul'})); location.reload();})()`);
 await sleep(1200);
 const sizes=[['ipad',820,1180],['iphone',390,844]];
 for(const [tag,w,h] of sizes){
   await shot(`v2-home-${tag}`,w,h,Math.min(h,1000));
   await ev(`document.querySelector('[data-act="settings"]').click();'ok'`); await sleep(150); await shot(`v2-settings-${tag}`,w,h,Math.min(h,900));
   await ev(`(document.querySelector('[data-act="back"]')||document.querySelector('[data-act="home"]')).click();'ok'`); await sleep(150);
   await ev(`document.querySelector('.plist li[data-pid="1"]').click();'ok'`); await sleep(150); await shot(`v2-review-${tag}`,w,h,Math.min(h,1000));
   await ev(`(document.querySelector('[data-act="back"]')||document.querySelector('[data-act="home"]')).click();'ok'`); await sleep(150);
   await ev(`document.querySelector('[data-act="new"]').click();'ok'`); await sleep(150); await shot(`v2-proforma-${tag}`,w,h,Math.min(h,1000));
   await ev(`(async()=>{const vals={age:'28',admission_date:'2026-09-01',surgery_date:'2026-09-03',height_cm:'156',weight_kg:'68',indication_cs:'Previous CS',asa_grade:'II',education:'Graduate',occupation:'Homemaker',monthly_income_inr:'25000',parity:'1',live_issues:'1',previous_cs:'No',other_surgery:'No',administration_mode:'Interviewer-administered (Hindi)',interviewer:'Anshul',name:'Meena Kumari'};
     for(const [k,v] of Object.entries(vals)){const el=document.querySelector('[name="'+k+'"]'); if(!el) continue; el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,15));}
     document.querySelector('#demo-form button[type=submit]').click(); await new Promise(r=>setTimeout(r,100));
     for(const [q,v] of [[1,3],[2,3],[3,4]]){document.querySelector('.opt[data-q="'+q+'"][data-v="'+v+'"]').click(); await new Promise(r=>setTimeout(r,20));} return 'ok';})()`);
   await shot(`v2-apais-${tag}`,w,h,Math.min(h,1000));
   await ev(`(async()=>{for(const [q,v] of [[4,3],[5,2],[6,5]]){document.querySelector('.opt[data-q="'+q+'"][data-v="'+v+'"]').click(); await new Promise(r=>setTimeout(r,20));}
     document.querySelector('[data-act="next"]').click(); await new Promise(r=>setTimeout(r,80)); return 'ok';})()`);
   await shot(`v2-intro-${tag}`,w,h,Math.min(h,800));
   await ev(`(async()=>{document.querySelector('[data-act="start"]').click(); await new Promise(r=>setTimeout(r,80)); document.querySelectorAll('.choice.best')[0].click(); await new Promise(r=>setTimeout(r,60)); return 'ok';})()`);
   await shot(`v2-task-${tag}`,w,h,Math.min(h,1000));
   if(tag==='ipad'){ await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]}); await sleep(150); await shot('v2-task-dark-ipad',w,h,Math.min(h,1000));
     await ev(`(document.querySelector('[data-act="back"]')||document.querySelector('[data-act="home"]')).click();'ok'`); await sleep(150); await shot('v2-home-dark-ipad',w,h,Math.min(h,1000));
     await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]}); }
   else { await ev(`(document.querySelector('[data-act="back"]')||document.querySelector('[data-act="home"]')).click();'ok'`); await sleep(150); }
   // discard the demo participant for the next size
   await ev(`(async()=>{const recs=JSON.parse(localStorage.getItem('bws.records.v1')); delete recs[4]; localStorage.setItem('bws.records.v1',JSON.stringify(recs)); location.reload();})()`); await sleep(1000);
 }
 console.log('shots:', fs.readdirSync('test/shots').filter(f=>f.startsWith('v2-')).join(', '));
 ws.close(); chrome.kill(); process.exit(0);})().catch(e=>{console.log('FAIL '+e.message);chrome.kill();process.exit(1);});
