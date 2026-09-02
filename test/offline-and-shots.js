const { spawn } = require('child_process'); const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; const port = 9334;
const base = process.argv[2] || 'http://127.0.0.1:8765/';
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--user-data-dir=/tmp/bws-chrome-profile-b',`--remote-debugging-port=${port}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let ver; for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (e) { await sleep(200); } }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const shot = async (name, w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await sleep(300);
    const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('test/shots/' + name + '.png', Buffer.from(r.data, 'base64')); };
  fs.mkdirSync('test/shots', { recursive: true });

  // 1. online load with service worker
  await send('Page.navigate', { url: base + 'index.html' }); await sleep(1500);
  const swState = await ev("navigator.serviceWorker.getRegistration().then(r => r ? (r.active ? 'active' : r.installing ? 'installing' : 'waiting') : 'none')");
  console.log('service worker after first load:', swState);
  await sleep(1500);
  const cached = await ev("caches.keys().then(async ks => { const c = await caches.open(ks[0]); const reqs = await c.keys(); return ks[0] + ': ' + reqs.length + ' files'; })");
  console.log('cache:', cached);

  // 2. go offline and reload
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.reload', { ignoreCache: false }); await sleep(1500);
  const offlineOK = await ev("!!document.querySelector('[data-act=\"new\"]') && document.querySelector('#online') && document.querySelector('#online').textContent");
  console.log('offline reload renders home:', offlineOK);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 3. screenshots: seed a participant into the task screen via UI
  await ev(`(async()=>{document.querySelector('[data-act="new"]').click(); await new Promise(r=>setTimeout(r,100));
    const f=document.querySelector('#demo-form'); const vals={age:'28',admission_date:'2026-09-01',surgery_date:'2026-09-03',height_cm:'156',weight_kg:'68',indication_cs:'Previous CS',asa_grade:'II',education:'Graduate',occupation:'Homemaker',monthly_income_inr:'25000',parity:'1',live_issues:'1',previous_cs:'No',other_surgery:'No',administration_mode:'Interviewer-administered (Hindi)',interviewer:'AR'};
    for(const [k,v] of Object.entries(vals)){const el=document.querySelector('[name="'+k+'"]'); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,20));}
    document.querySelector('#demo-form button[type=submit]').click(); await new Promise(r=>setTimeout(r,100));
    for(const [q,v] of [[1,3],[2,3],[3,4],[4,3],[5,2],[6,5]]){document.querySelector('.opt[data-q="'+q+'"][data-v="'+v+'"]').click(); await new Promise(r=>setTimeout(r,30));}
    document.querySelector('[data-act="next"]').click(); await new Promise(r=>setTimeout(r,100));
    document.querySelector('[data-act="start"]').click(); await new Promise(r=>setTimeout(r,100));
    document.querySelectorAll('.choice.best')[0].click(); await new Promise(r=>setTimeout(r,50)); return document.querySelector('.bar h1').textContent;})()`);
  await shot('task-ipad', 820, 1180);
  await shot('task-iphone', 390, 844);
  await ev("document.querySelector('[data-act=\"home\"]').click(); 'ok'"); await sleep(200);
  await shot('home-ipad', 820, 1180);
  console.log('screenshots written:', fs.readdirSync('test/shots').join(', '));
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.log('FAIL ' + e.message); chrome.kill(); process.exit(1); });
