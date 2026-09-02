// Drive headless Chrome over CDP: open the UI test page, wait for DONE, print results + any JS errors.
const { spawn } = require('child_process');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2];
const port = 9333;
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-sandbox','--user-data-dir=/tmp/bws-chrome-profile',`--remote-debugging-port=${port}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let ver; for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch (e) { await sleep(200); } }
  if (!ver) { console.log('FAIL chrome did not start'); chrome.kill(); process.exit(1); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE ' + m.params.args.map(a => a.value || a.description).join(' '));
  };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url });
  let text = '';
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: "document.getElementById('out') ? document.getElementById('out').textContent : ''", returnByValue: true });
    text = r.result.value || '';
    if (text.includes('DONE')) break;
  }
  console.log(text || '(no output)');
  if (errors.length) { console.log('--- page errors ---'); errors.forEach(e => console.log(e)); } else console.log('--- no JS errors ---');
  ws.close(); chrome.kill(); process.exit(text.includes('FAIL') || !text.includes('DONE') ? 1 : 0);
})().catch(e => { console.log('FAIL runner ' + e.message); chrome.kill(); process.exit(1); });
