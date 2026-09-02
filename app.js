/* app.js — UI + storage. Depends on core.js and design.js. */
(function () {
  'use strict';
  const C = window.BWSCore;
  const DESIGN = window.BWS_DESIGN, BLOCKS = window.BWS_BLOCKS;
  const APP_VERSION = '1.2.0';
  const LS_RECORDS = 'bws.records.v1', LS_SETTINGS = 'bws.settings.v1';
  const DEFAULT_SETTINGS = { recordName: false, exportLimit: 1, interviewer: 'Anshul' };

  let records = {}, settings = Object.assign({}, DEFAULT_SETTINGS);
  let view = { name: 'home' };
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowISO = () => new Date().toISOString();

  // ---------- storage: localStorage + IndexedDB, both written on every change ----------
  let db = null;
  function openDB() {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const req = indexedDB.open('bws-db', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function idbGet(key) {
    return new Promise(resolve => {
      if (!db) return resolve(null);
      try {
        const tx = db.transaction('kv', 'readonly'); const rq = tx.objectStore('kv').get(key);
        rq.onsuccess = () => resolve(rq.result === undefined ? null : rq.result); rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function idbSet(key, val) {
    return new Promise(resolve => {
      if (!db) return resolve(false);
      try {
        const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key);
        tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }
  function lsGet(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }

  let storageWarning = '';
  async function persist() {
    const okLS = lsSet(LS_RECORDS, records) && lsSet(LS_SETTINGS, settings);
    const okDB = (await idbSet('records', records)) && (await idbSet('settings', settings));
    storageWarning = (!okLS && !okDB) ? 'Nothing could be saved. Export a backup immediately.' : (!okLS || !okDB) ? 'One of the two storage copies failed; the other is fine.' : '';
    const el = $('#storage-warning'); if (el) { el.textContent = storageWarning; el.hidden = !storageWarning; }
  }
  async function loadAll() {
    db = await openDB();
    const a = lsGet(LS_RECORDS) || {}, b = (await idbGet('records')) || {};
    records = C.mergeRecords(a, b);
    settings = Object.assign({}, DEFAULT_SETTINGS, lsGet(LS_SETTINGS) || (await idbGet('settings')) || {});
    if (Object.keys(a).length !== Object.keys(records).length || Object.keys(b).length !== Object.keys(records).length) await persist();
  }
  function touch(rec) { rec.updatedAt = nowISO(); return persist(); }

  // ---------- export: share sheet first (works in home-screen mode), download link as fallback ----------
  async function deliverFiles(files) {
    if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: 'BWS study data' }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; /* fall through */ }
    }
    for (const f of files) {
      const url = URL.createObjectURL(f); const a = document.createElement('a');
      a.href = url; a.download = f.name; a.rel = 'noopener'; document.body.appendChild(a); a.click();
      await new Promise(r => setTimeout(r, 400)); a.remove(); URL.revokeObjectURL(url);
    }
    return 'downloaded';
  }
  function markExported() {
    const t = nowISO();
    for (const r of Object.values(records)) r.exportedAt = t;   // partial records are in the backup too
    return persist();
  }
  async function saveBackup() {
    const name = C.fileName('backup', 'json', Object.keys(records).length);
    const res = await deliverFiles([new File([C.buildBackup(records, settings)], name, { type: 'application/json' })]);
    if (res !== 'cancelled') { await markExported(); toast('Backup ' + res + ': ' + name); } else toast('Backup cancelled');
    render();
  }
  async function exportCSVs() {
    const d = new Date(), n = Object.keys(records).length;
    const files = [
      new File([C.buildParticipantsWide(records, settings)], C.fileName('participants', 'csv', n, d), { type: 'text/csv' }),
      new File([C.buildBwsLong(records)], C.fileName('bws-long', 'csv', n, d), { type: 'text/csv' }),
      new File([C.buildBwsChoices(records)], C.fileName('bws-choices', 'csv', n, d), { type: 'text/csv' })
    ];
    const res = await deliverFiles(files);
    if (res !== 'cancelled') { await markExported(); toast('CSV export ' + res + ' (3 files)'); } else toast('Export cancelled');
    render();
  }
  function importBackup(file) {
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const { records: imp } = C.parseBackup(rd.result);
        const before = Object.keys(records).length;
        records = C.mergeRecords(records, imp);
        await persist();
        toast('Imported ' + Object.keys(imp).length + ' participants (' + (Object.keys(records).length - before) + ' new)');
        render();
      } catch (e) { alert('Import failed: ' + e.message); }
    };
    rd.readAsText(file);
  }

  // ---------- tiny toast ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3500);
  }

  // ---------- views ----------
  function go(v) { view = v; render(); window.scrollTo(0, 0); }
  function render() {
    const root = $('#app');
    const fn = VIEWS[view.name] || VIEWS.home;
    root.innerHTML = fn(view);
    if (fn.bind_) fn.bind_(view);
    const sw = $('#storage-warning'); if (sw) { sw.textContent = storageWarning; sw.hidden = !storageWarning; }
  }
  const VIEWS = {};

  function statusPill(r) {
    const map = { in_progress: ['In progress', 'pill-amber'], complete: ['Complete', 'pill-green'], withdrawn: ['Withdrawn', 'pill-grey'] };
    const [t, c] = map[r.status] || [r.status, 'pill-grey'];
    return '<span class="pill ' + c + '">' + t + '</span>';
  }

  // ---- HOME ----
  VIEWS.home = () => {
    if (C.dropEmptyRecords(records)) persist();   // an ID opened but never filled in is released again
    const list = Object.values(records).sort((a, b) => b.pid - a.pid);
    const nextId = C.nextFreeId(records);
    const un = C.unexportedCount(records);
    const blocked = settings.exportLimit > 0 && un >= settings.exportLimit;
    const inprog = list.filter(r => r.status === 'in_progress');
    return `
    <header class="bar"><h1>CS Preference BWS</h1><button class="link" data-act="settings">Settings</button></header>
    ${un ? `<div class="banner ${blocked ? 'banner-red' : 'banner-amber'}">
      <b>${un}</b> participant${un > 1 ? 's' : ''} (complete or partial) not yet backed up.${blocked ? ' New participants are blocked until you save a backup.' : ''}
      <button data-act="backup">Save backup</button></div>` : ''}
    <section class="card">
      <button class="primary big" data-act="new" ${nextId === null || blocked ? 'disabled' : ''}>New participant${nextId ? ' — ID ' + nextId : ' (all 224 used)'}</button>
      ${inprog.map(r => `<button class="secondary big" data-act="open" data-pid="${r.pid}">Resume ID ${r.pid} <small>(partial · ${C.tasksDone(r)}/12 tasks · saved ${new Date(r.updatedAt).toLocaleTimeString()})</small></button>`).join('')}
      <div class="row3">
        <button data-act="backup">Save backup<br><small>1 file, full copy</small></button>
        <button data-act="export">Export CSVs<br><small>3 files, for R</small></button>
        <button data-act="import">Import backup<br><small>restore</small></button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
    </section>
    <section class="card">
      <h2>Participants <small>${list.length} of 224 · ${list.filter(r => r.status === 'complete').length} complete</small></h2>
      ${list.length ? '<ul class="plist">' + list.map(r => `<li data-act="open" data-pid="${r.pid}">
          <b>ID ${r.pid}</b> ${statusPill(r)} <span class="muted">${C.tasksDone(r)}/12 tasks · ${new Date(r.updatedAt).toLocaleString()}</span>
          ${C.needsExport(r) ? '<span class="dot" title="not backed up"></span>' : ''}</li>`).join('') + '</ul>' : '<p class="muted">No participants yet.</p>'}
    </section>
    <footer class="muted small">v${APP_VERSION} · data stays on this device until you export · <span id="online">${navigator.onLine ? 'online' : 'offline'}</span></footer>`;
  };
  VIEWS.home.bind_ = () => {
    $('#app').onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'new') newParticipant();
      else if (act === 'open') openParticipant(Number(b.dataset.pid));
      else if (act === 'backup') saveBackup();
      else if (act === 'export') exportCSVs();
      else if (act === 'import') $('#import-file').click();
      else if (act === 'settings') go({ name: 'settings' });
    };
    $('#import-file').onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); };
  };
  async function newParticipant() {
    const pid = C.nextFreeId(records); if (!pid) return;
    const rec = C.newRecord(pid, DESIGN);
    if (settings.interviewer) rec.demo.interviewer = settings.interviewer;
    rec.demo.administration_mode = 'Interviewer-administered (Hindi)';
    records[pid] = rec; await persist();
    go({ name: 'demo', pid });
  }
  function openParticipant(pid) {
    const r = records[pid]; if (!r) return;
    if (r.status !== 'in_progress') return go({ name: 'review', pid });
    const demoOK = Object.keys(C.validateDemo(r.demo, settings)).length === 0;
    if (!demoOK) return go({ name: 'demo', pid });
    if (!C.apaisScores(r.apais).complete) return go({ name: 'apais', pid });
    const t = C.firstIncompleteTask(r);
    return t ? go({ name: 'task', pid, i: t }) : go({ name: 'review', pid });
  }

  // ---- DEMOGRAPHICS ----
  VIEWS.demo = v => {
    const r = records[v.pid]; const errs = v.errors || {};
    const fields = C.DEMO_FIELDS.filter(f => C.fieldVisible(f, r.demo, settings));
    return `
    <header class="bar"><button class="link" data-act="home">‹ Save & exit</button><h1>ID ${r.pid} · Case proforma</h1><span></span></header>
    <form id="demo-form" class="card" autocomplete="off">
      ${fields.map(f => `<label class="field ${errs[f.key] ? 'err' : ''}"><span>${esc(f.label)}${f.optional ? ' <em>(optional)</em>' : ''}</span>
        ${f.type === 'select'
          ? `<select name="${f.key}"><option value="">— select —</option>${f.options.map(o => `<option ${r.demo[f.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
          : `<input name="${f.key}" type="${f.type}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(r.demo[f.key])}" placeholder="${esc(f.placeholder || '')}">`}
        ${errs[f.key] ? `<small class="errmsg">${esc(errs[f.key])}</small>` : ''}</label>`).join('')}
      <button class="primary big" type="submit">Save & continue to anxiety scale ›</button>
    </form>`;
  };
  VIEWS.demo.bind_ = v => {
    const r = records[v.pid]; const form = $('#demo-form');
    $('[data-act="home"]').onclick = () => go({ name: 'home' });
    form.oninput = e => { r.demo[e.target.name] = e.target.value; touch(r); if (e.target.tagName === 'SELECT') render(); };
    form.onsubmit = e => {
      e.preventDefault();
      const errors = C.validateDemo(r.demo, settings);
      if (Object.keys(errors).length) { v.errors = errors; render(); toast('Please complete the highlighted fields'); return; }
      go({ name: 'apais', pid: v.pid });
    };
  };

  // ---- APAIS ----
  VIEWS.apais = v => {
    const r = records[v.pid]; const s = C.apaisScores(r.apais);
    return `
    <header class="bar"><button class="link" data-act="back">‹ Proforma</button><h1>ID ${r.pid} · Preoperative anxiety (APAIS)</h1><button class="link" data-act="home">Save & exit</button></header>
    <section class="card">
      <p class="hi">कृपया बताइए कि हर वाक्य आप पर कितना लागू होता है।</p>
      <p class="muted small">Please indicate how strongly each statement applies to you (1 = not at all, 5 = extremely).</p>
      ${C.APAIS.map(q => `<div class="q">
        <p class="hi">${q.n}. ${esc(q.hi)}</p><p class="en">${esc(q.en)}</p>
        <div class="scale">${C.APAIS_SCALE.map(o => `<button type="button" class="opt ${Number(r.apais[q.n]) === o.v ? 'sel' : ''}" data-q="${q.n}" data-v="${o.v}"><b>${o.v}</b><span class="hi">${esc(o.hi)}</span><span class="en">${esc(o.en)}</span></button>`).join('')}</div>
      </div>`).join('')}
      <p class="muted small">Anxiety score ${s.anxiety === null ? '—' : s.anxiety + '/20' + (s.highAnxiety ? ' (high, ≥11)' : '')} · Information score ${s.information === null ? '—' : s.information + '/10'}</p>
      <button class="primary big" data-act="next" ${s.complete ? '' : 'disabled'}>Continue to choice tasks ›</button>
    </section>`;
  };
  VIEWS.apais.bind_ = v => {
    const r = records[v.pid];
    $('#app').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.q) { r.apais[b.dataset.q] = Number(b.dataset.v); touch(r); render(); }
      else if (b.dataset.act === 'back') go({ name: 'demo', pid: v.pid });
      else if (b.dataset.act === 'home') go({ name: 'home' });
      else if (b.dataset.act === 'next') go({ name: 'intro', pid: v.pid });
    };
  };

  // ---- BWS INTRO (patient information wording, Hindi) ----
  VIEWS.intro = v => `
    <header class="bar"><button class="link" data-act="back">‹ Anxiety scale</button><h1>ID ${v.pid} · Instructions</h1><span></span></header>
    <section class="card">
      <p class="hi big-text">अब आपको 12 सवाल दिखाए जाएँगे। हर सवाल में चार ऐसी बातें होंगी जो एनेस्थीसिया और ऑपरेशन के बाद ठीक होने के दौरान आपके लिए ज़रूरी हो सकती हैं।</p>
      <p class="hi big-text">हर सवाल में पहले वह <b>एक</b> बात चुनें जो आपके लिए <b>सबसे ज़्यादा ज़रूरी</b> है, फिर वह <b>एक</b> बात चुनें जो आपके लिए <b>सबसे कम ज़रूरी</b> है।</p>
      <p class="hi big-text">इसका कोई सही या गलत जवाब नहीं है। अपनी पसंद के आधार पर चुनें, न कि इस आधार पर कि डॉक्टर या परिवार क्या पसंद करेंगे।</p>
      <p class="en">You will see 12 sets of four outcomes. In each set choose the ONE most important to you (BEST) and the ONE least important (WORST). There are no right or wrong answers. The interviewer reads options verbatim and does not suggest or influence the choice.</p>
      <button class="primary big" data-act="start">शुरू करें · Start</button>
    </section>`;
  VIEWS.intro.bind_ = v => {
    $('[data-act="back"]').onclick = () => go({ name: 'apais', pid: v.pid });
    $('[data-act="start"]').onclick = () => go({ name: 'task', pid: v.pid, i: C.firstIncompleteTask(records[v.pid]) || 1 });
  };

  // ---- BWS TASK ----
  VIEWS.task = v => {
    const r = records[v.pid]; const t = r.tasks[v.i]; const n = Object.keys(r.tasks).length;
    if (!t.startedAt) { t.startedAt = nowISO(); touch(r); }
    const done = C.taskComplete(t);
    return `
    <header class="bar"><button class="link" data-act="home">‹ Save & exit</button><h1>ID ${r.pid} · सवाल ${v.i} / ${n}</h1><span class="muted small">set ${t.taskId}</span></header>
    <div class="progress"><div style="width:${((v.i - 1) / n) * 100}%"></div></div>
    <section class="card">
      <div class="thead"><span></span><span class="hi">सबसे ज़्यादा ज़रूरी<br><small class="en">Most important</small></span><span class="hi">सबसे कम ज़रूरी<br><small class="en">Least important</small></span></div>
      ${t.options.map((oid, p) => { const o = C.OUTCOME_BY_ID[oid]; return `
      <div class="trow ${t.best === oid ? 'is-best' : ''} ${t.worst === oid ? 'is-worst' : ''}">
        <div class="otext"><span class="hi big-text">${esc(o.hi)}</span><span class="hi small muted">${esc(o.hi_desc)}</span><span class="en">${esc(o.en)}</span></div>
        <button type="button" class="choice best ${t.best === oid ? 'sel' : ''}" data-kind="best" data-oid="${oid}" ${t.worst === oid ? 'disabled' : ''} aria-label="Best: ${esc(o.en)}">✓</button>
        <button type="button" class="choice worst ${t.worst === oid ? 'sel' : ''}" data-kind="worst" data-oid="${oid}" ${t.best === oid ? 'disabled' : ''} aria-label="Worst: ${esc(o.en)}">✗</button>
      </div>`; }).join('')}
      <div class="nav">
        <button data-act="prev" ${v.i === 1 ? 'disabled' : ''}>‹ पिछला</button>
        <button class="primary" data-act="next" ${done ? '' : 'disabled'}>${v.i === n ? 'समाप्त · Finish' : 'अगला ›'}</button>
      </div>
      <p class="muted small">${done ? 'Both chosen.' : (!t.best ? 'Choose the most important (✓)…' : 'Now choose the least important (✗)…')}</p>
    </section>`;
  };
  VIEWS.task.bind_ = v => {
    const r = records[v.pid]; const t = r.tasks[v.i]; const n = Object.keys(r.tasks).length;
    $('#app').onclick = async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.kind) {
        const oid = b.dataset.oid;
        if (b.dataset.kind === 'best') { t.best = t.best === oid ? null : oid; if (t.worst === oid) t.worst = null; }
        else { t.worst = t.worst === oid ? null : oid; if (t.best === oid) t.best = null; }
        if (C.taskComplete(t)) t.completedAt = nowISO();
        await touch(r); render(); return;
      }
      const act = b.dataset.act;
      if (act === 'home') go({ name: 'home' });
      else if (act === 'prev') go({ name: 'task', pid: v.pid, i: v.i - 1 });
      else if (act === 'next') {
        if (!C.taskComplete(t)) return;
        t.completedAt = t.completedAt || nowISO();
        if (v.i < n) { await touch(r); go({ name: 'task', pid: v.pid, i: v.i + 1 }); }
        else {
          const missing = C.firstIncompleteTask(r);
          if (missing) { toast('Task ' + missing + ' is incomplete'); go({ name: 'task', pid: v.pid, i: missing }); return; }
          r.status = 'complete'; await touch(r); go({ name: 'review', pid: v.pid });
        }
      }
    };
  };

  // ---- REVIEW ----
  VIEWS.review = v => {
    const r = records[v.pid]; const s = C.apaisScores(r.apais); const un = C.unexportedCount(records);
    const n = Object.keys(r.tasks).length;
    return `
    <header class="bar"><button class="link" data-act="home">‹ Home</button><h1>ID ${r.pid} · ${statusPill(r)}</h1><span></span></header>
    <section class="card">
      <h2>${r.status === 'complete' ? 'Interview complete' : 'Summary'}</h2>
      <p>${C.tasksDone(r)}/${n} tasks · APAIS anxiety ${s.anxiety ?? '—'} · information ${s.information ?? '—'}</p>
      ${C.needsExport(r) ? `<div class="banner banner-amber">Not backed up yet (${un} pending). <button data-act="backup">Save backup now</button></div>` : '<p class="muted small">Backed up ' + new Date(r.exportedAt).toLocaleString() + '</p>'}
      <div class="row3">
        <button data-act="backup">Save backup</button>
        <button data-act="export">Export CSVs</button>
        <button class="primary" data-act="home">Done · Home</button>
      </div>
    </section>
    <section class="card">
      <h2>Choices</h2>
      <table class="mini"><tr><th>#</th><th>Set</th><th>Best</th><th>Worst</th></tr>
      ${Array.from({ length: n }, (_, i) => r.tasks[i + 1]).map((t, i) => `<tr><td>${i + 1}</td><td>${t.taskId}</td><td>${t.best ? esc(C.OUTCOME_BY_ID[t.best].en) : '—'}</td><td>${t.worst ? esc(C.OUTCOME_BY_ID[t.worst].en) : '—'}</td></tr>`).join('')}</table>
    </section>
    <section class="card">
      <h2>Edit</h2>
      <div class="row3">
        <button data-act="demo">Proforma</button>
        <button data-act="apais">Anxiety scale</button>
        ${r.status === 'in_progress' ? `<button data-act="tasks">Choice tasks</button>` : ''}
      </div>
      ${r.status !== 'withdrawn' ? `<button class="danger-link" data-act="withdraw">Mark as withdrawn / incomplete</button>` : `<button class="link" data-act="reopen">Re-open as in progress</button>`}
    </section>`;
  };
  VIEWS.review.bind_ = v => {
    const r = records[v.pid];
    $('#app').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'home') go({ name: 'home' });
      else if (act === 'backup') saveBackup();
      else if (act === 'export') exportCSVs();
      else if (act === 'demo') go({ name: 'demo', pid: v.pid });
      else if (act === 'apais') go({ name: 'apais', pid: v.pid });
      else if (act === 'tasks') go({ name: 'task', pid: v.pid, i: C.firstIncompleteTask(r) || 1 });
      else if (act === 'withdraw') { if (confirm('Mark participant ' + r.pid + ' as withdrawn/incomplete? Data already entered is kept.')) { r.status = 'withdrawn'; await touch(r); render(); } }
      else if (act === 'reopen') { r.status = 'in_progress'; await touch(r); render(); }
    };
  };

  // ---- SETTINGS ----
  VIEWS.settings = () => `
    <header class="bar"><button class="link" data-act="home">‹ Home</button><h1>Settings</h1><span></span></header>
    <form id="settings-form" class="card">
      <label class="field"><span>Default interviewer initials</span><input name="interviewer" value="${esc(settings.interviewer)}"></label>
      <label class="field"><span>Block new participants when this many are not backed up (0 = never block)</span><input name="exportLimit" type="number" inputmode="numeric" min="0" max="50" value="${settings.exportLimit}"></label>
      <label class="check"><input type="checkbox" name="recordName" ${settings.recordName ? 'checked' : ''}> Record patient name in the app <small class="muted">(off = study ID only; name stays on the paper consent form)</small></label>
      <button class="primary" type="submit">Save settings</button>
    </form>
    <section class="card">
      <h2>About</h2>
      <p class="small muted">Patient priorities for outcomes related to anaesthesia and perioperative care during elective caesarean delivery: a best-worst scaling study. MAMC / Lok Nayak Hospital.</p>
      <p class="small muted">App v${APP_VERSION} · design: 224 participants × 12 tasks × 4 outcomes (participants 1–200 from the approved randomisation file, 201–224 extended with the same method).</p>
      <p class="small muted">Storage: localStorage ${lsGet(LS_RECORDS) ? 'OK' : 'empty'} · IndexedDB ${db ? 'OK' : 'unavailable'} · ${Object.keys(records).length} participants on device.</p>
    </section>
    <section class="card">
      <h2>Factory reset</h2>
      <p class="small muted">Erases every participant record and restores default settings on this device. The hosted app and any backup files you have saved are not affected. Save a backup first.</p>
      <button class="danger-link" data-act="wipe">Factory reset this device…</button>
    </section>`;
  VIEWS.settings.bind_ = () => {
    $('[data-act="home"]').onclick = () => go({ name: 'home' });
    $('#settings-form').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      settings.interviewer = f.interviewer.value.trim();
      settings.exportLimit = Math.max(0, Number(f.exportLimit.value) || 0);
      settings.recordName = f.recordName.checked;
      await persist(); toast('Settings saved'); go({ name: 'home' });
    };
    $('[data-act="wipe"]').onclick = async () => {
      const n = Object.keys(records).length, un = C.unexportedCount(records);
      if (!confirm('Factory reset\n\nThis will permanently erase ' + n + ' participant' + (n === 1 ? '' : 's') + ' and reset all settings on this device.' +
        (un ? '\n\nWARNING: ' + un + ' participant' + (un === 1 ? ' is' : 's are') + ' NOT backed up yet.' : '') + '\n\nContinue?')) return;
      if (prompt('Final confirmation: type RESET in capital letters to erase everything.') !== 'RESET') { toast('Reset cancelled'); return; }
      records = {}; settings = Object.assign({}, DEFAULT_SETTINGS);
      await persist(); toast('Device reset: all data erased, settings restored'); go({ name: 'home' });
    };
  };

  // ---------- boot ----------
  async function boot() {
    const problems = C.validateDesign(DESIGN, BLOCKS);
    if (problems.length) { alert('Design file problem: ' + problems.slice(0, 3).join('; ')); }
    await loadAll();
    render();
    window.addEventListener('online', () => { const o = $('#online'); if (o) o.textContent = 'online'; });
    window.addEventListener('offline', () => { const o = $('#online'); if (o) o.textContent = 'offline'; });
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/nosw/.test(location.search)) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('App updated. Close and reopen to use the new version.'); });
        });
      }).catch(() => {});
    }
  }
  window.BWSApp = { boot, get records() { return records; }, get settings() { return settings; } };
  document.addEventListener('DOMContentLoaded', boot);
})();
