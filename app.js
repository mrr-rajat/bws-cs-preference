/* app.js — UI + storage. Depends on core.js and design.js. */
(function () {
  'use strict';
  const C = window.BWSCore;
  const DESIGN = window.BWS_DESIGN, BLOCKS = window.BWS_BLOCKS;
  const APP_VERSION = '2.6.1';
  const LS_RECORDS = 'bws.records.v1', LS_SETTINGS = 'bws.settings.v1', LS_DELETED = 'bws.deleted.v1';
  const DEFAULT_SETTINGS = { recordName: true, exportLimit: 5, interviewer: 'Anshul', theme: 'auto' };

  let records = {}, settings = Object.assign({}, DEFAULT_SETTINGS), deleted = [];
  let view = { name: 'home' };
  let pendingReload = false;
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowISO = () => new Date().toISOString();

  // ---------- theme: 'auto' follows the device; 'light'/'dark' force it ----------
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') { root.dataset.theme = theme; root.style.colorScheme = theme; }
    else { delete root.dataset.theme; root.style.colorScheme = ''; }
    const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#17130F' : '#F5F0E6'));
  }
  // Apply as early as possible (before the first render) to avoid a flash of the wrong theme.
  try { applyTheme((JSON.parse(localStorage.getItem('bws.settings.v1') || '{}')).theme || 'auto'); } catch (e) { /* ignore */ }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(settings.theme));

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
    const okLS = lsSet(LS_RECORDS, records) && lsSet(LS_SETTINGS, settings) && lsSet(LS_DELETED, deleted);
    const okDB = (await idbSet('records', records)) && (await idbSet('settings', settings)) && (await idbSet('deleted', deleted));
    storageWarning = (!okLS && !okDB) ? 'Nothing could be saved. Export a backup immediately.' : (!okLS || !okDB) ? 'One of the two storage copies failed; the other is fine.' : '';
    const el = $('#storage-warning'); if (el) { el.textContent = storageWarning; el.hidden = !storageWarning; }
  }
  async function loadAll() {
    db = await openDB();
    const a = lsGet(LS_RECORDS) || {}, b = (await idbGet('records')) || {};
    records = C.mergeRecords(a, b);
    settings = Object.assign({}, DEFAULT_SETTINGS, lsGet(LS_SETTINGS) || (await idbGet('settings')) || {});
    deleted = C.mergeDeleted(lsGet(LS_DELETED) || [], (await idbGet('deleted')) || []);
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
    const res = await deliverFiles([new File([C.buildBackup(records, settings, null, deleted)], name, { type: 'application/json' })]);
    if (res !== 'cancelled') { await markExported(); toast('Backup saved', name, 'ok'); } else toast('Backup cancelled');
    render();
  }
  async function exportCSVs() {
    const name = C.fileName('data', 'csv', Object.keys(records).length);
    const res = await deliverFiles([new File([C.buildCombined(records, settings)], name, { type: 'text/csv' })]);
    // A CSV cannot be restored with Import backup, so it does not count as a backup.
    if (res === 'cancelled') toast('Export cancelled'); else toast('CSV exported', name + ' · This is not a backup. Use Save backup for that.', 'ok');
    render();
  }
  function importBackup(file) {
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const { records: imp, deleted: impDel } = C.parseBackup(rd.result);
        const before = Object.keys(records).length;
        records = C.mergeRecords(records, imp); deleted = C.mergeDeleted(deleted, impDel);
        await persist();
        toast('Backup imported', Object.keys(imp).length + ' participants in file · ' + (Object.keys(records).length - before) + ' new on this device', 'ok');
        render();
      } catch (e) { dialog({ title: 'Import failed', message: esc(e.message), tone: 'danger' }); }
    };
    rd.readAsText(file);
  }

  // ---------- toast: title + optional detail line; tone picks the icon colour ----------
  function toast(title, detail, tone) {
    const t = $('#toast');
    t.className = tone || '';
    t.innerHTML = `${icon(tone === 'ok' ? 'ok' : tone === 'warn' || tone === 'danger' ? 'warn' : 'info')}<div><div class="t-title">${esc(title)}</div>${detail ? `<div class="t-detail">${esc(detail)}</div>` : ''}</div>`;
    t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, detail ? 5000 : 3200);
  }

  // ---------- in-app alert: resolves true (confirmed) or false (cancelled) ----------
  // opts: { title, message (HTML), tone: 'danger'|'warn'|'info', confirm, cancel, destructive, typed }  typed = word the user must type
  function dialog(opts) {
    return new Promise(resolve => {
      const back = document.createElement('div'); back.className = 'sheet-backdrop';
      const iconName = opts.tone === 'danger' ? 'warn' : opts.tone === 'warn' ? 'warn' : 'ok';
      back.innerHTML = `<div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <div class="sheet-icon ${opts.tone || 'info'}">${icon(iconName)}</div>
        <h2 id="dlg-t">${esc(opts.title)}</h2>
        ${opts.message ? `<p>${opts.message}</p>` : ''}
        ${opts.typed ? `<label class="field"><span>Type <b>${esc(opts.typed)}</b> to confirm</span><input id="dlg-in" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text"></label>` : ''}
        <div class="actions">
          ${opts.confirm ? `<button class="btn btn-block ${opts.destructive ? 'btn-destructive' : 'btn-primary'}" data-dlg="ok" ${opts.typed ? 'disabled' : ''}>${esc(opts.confirm)}</button>` : ''}
          <button class="btn btn-block btn-plain" data-dlg="cancel">${esc(opts.cancel || (opts.confirm ? 'Cancel' : 'OK'))}</button>
        </div></div>`;
      const close = val => { back.remove(); document.body.classList.remove('has-sheet'); resolve(val); };
      back.onclick = e => { const b = e.target.closest('[data-dlg]'); if (b) close(b.dataset.dlg === 'ok'); else if (e.target === back && !opts.typed) close(false); };
      document.body.appendChild(back); document.body.classList.add('has-sheet');
      const inp = back.querySelector('#dlg-in');
      if (inp) { inp.oninput = () => { back.querySelector('[data-dlg="ok"]').disabled = inp.value.trim().toUpperCase() !== opts.typed.toUpperCase(); }; setTimeout(() => inp.focus(), 50); }
      else setTimeout(() => { const f = back.querySelector('[data-dlg="cancel"]'); f && f.focus(); }, 50);
    });
  }

  // ---------- views ----------
  // Where "back" leads from each screen: the same place as the top-left button on that screen.
  const BACK = {
    demo: () => ({ name: 'home' }), apais: v => ({ name: 'demo', pid: v.pid }), intro: v => ({ name: 'apais', pid: v.pid }),
    task: () => ({ name: 'home' }), review: () => ({ name: 'home' }), settings: () => ({ name: 'home' })
  };
  let navFromHistory = false;
  // Scroll memory: forward navigation starts at the top; going back restores where you were (iOS convention).
  const scrollPos = {};
  const keyOf = v => v.name + (v.pid ? ':' + v.pid : '') + (v.i ? ':' + v.i : '');
  const isBackNav = (from, to) => { const f = BACK[from.name]; if (!f) return false; const b = f(from); return b.name === to.name && (b.pid || null) === (to.pid || null); };
  function navigate(v, opts) {
    scrollPos[keyOf(view)] = window.scrollY;
    const back = (opts && opts.back) || isBackNav(view, v);
    view = v; render({ keepScroll: false });
    const y = back && scrollPos[keyOf(v)] !== undefined ? scrollPos[keyOf(v)] : 0;
    window.scrollTo(0, y);
  }
  function go(v) {
    if (pendingReload && v.name === 'home') { location.reload(); return; }
    navigate(v);
    // Keep browser history in step so the hardware/browser back action (and Safari's own swipe) works in browser mode.
    if (!navFromHistory) { try { if (v.name === 'home') history.replaceState({ home: true }, ''); else history.pushState({ view: v.name }, ''); } catch (e) { /* ignore */ } }
  }
  function goBack() { const f = BACK[view.name]; if (!f) return false; if (document.querySelector('.sheet-backdrop')) return false; go(f(view)); return true; }
  window.addEventListener('popstate', () => { navFromHistory = true; try { if (view.name !== 'home' && !document.querySelector('.sheet-backdrop')) { const f = BACK[view.name]; navigate(f ? f(view) : { name: 'home' }, { back: true }); } } finally { navFromHistory = false; } });

  // ---------- edge-swipe back (home-screen mode; in Safari's browser mode the native gesture + popstate do this) ----------
  (function edgeSwipe() {
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (isIOS && !standalone) return;   // Safari browser mode: leave the gesture to Safari
    const EDGE = 24, START = 10; let sw = null;
    const app = () => $('#app');
    document.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || view.name === 'home' || document.querySelector('.sheet-backdrop')) { sw = null; return; }
      const t = e.touches[0]; if (t.clientX > EDGE) { sw = null; return; }
      sw = { x: t.clientX, y: t.clientY, t0: Date.now(), active: false };
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!sw) return; const t = e.touches[0]; const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      if (!sw.active) { if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > START) { sw = null; return; } if (dx > START) { sw.active = true; document.body.classList.add('swiping'); } else return; }
      const a = app(); a.style.transition = 'none'; a.style.transform = `translateX(${Math.max(0, dx)}px)`; a.style.opacity = String(1 - Math.min(0.35, dx / window.innerWidth));
    }, { passive: true });
    const end = e => {
      if (!sw) return; const a = app();
      if (!sw.active) { sw = null; return; }
      const t = (e.changedTouches && e.changedTouches[0]) || { clientX: sw.x }; const dx = t.clientX - sw.x, vel = dx / Math.max(1, Date.now() - sw.t0);
      document.body.classList.remove('swiping'); sw = null;
      a.style.transition = 'transform .18s ease-out, opacity .18s ease-out';
      if (dx > window.innerWidth * 0.33 || (dx > 60 && vel > 0.6)) {   // long drag, or a real flick of at least 60px
        a.style.transform = `translateX(${window.innerWidth}px)`; a.style.opacity = '0.5';
        setTimeout(() => { a.style.transition = ''; a.style.transform = ''; a.style.opacity = ''; goBack(); }, 150);
      } else { a.style.transform = ''; a.style.opacity = ''; setTimeout(() => { a.style.transition = ''; }, 200); }
    };
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  })();
  window.BWSGoBack = goBack;
  function render(opts) {
    const keep = !(opts && opts.keepScroll === false); const y = window.scrollY;
    document.body.classList.toggle('has-tasknav', view.name === 'task');
    const root = $('#app');
    const fn = VIEWS[view.name] || VIEWS.home;
    root.innerHTML = fn(view);
    if (fn.bind_) fn.bind_(view);
    if (keep) window.scrollTo(0, y);
    const sw = $('#storage-warning'); if (sw) { sw.textContent = storageWarning; sw.hidden = !storageWarning; }
  }
  const VIEWS = {};

  // ---------- icons (inline SVG, currentColor) ----------
  const ICONS = {
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    chevL: '<path d="m15 5-7 7 7 7"/>',
    chevR: '<path d="m9 5 7 7-7 7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="M12 4v11m0 0 5-5m-5 5-5-5M4 19h16"/>',
    table: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17M9 10v9"/>',
    up: '<path d="M12 20V9m0 0 5 5m-5-5-5 5M4 4h16"/>',
    warn: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    ok: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    clear: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M9 9l6 6M15 9l-6 6" stroke="var(--surface)" stroke-width="2.4"/>'
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  function statusPill(r) {
    const map = { in_progress: ['In progress', 'pill-amber'], complete: ['Complete', 'pill-green'], withdrawn: ['Withdrawn', 'pill-grey'] };
    const [t, c] = map[r.status] || [r.status, 'pill-grey'];
    return '<span class="pill ' + c + '">' + t + '</span>';
  }

  // "Name (ID 12)" when a name was recorded, otherwise "ID 12".
  function labelFor(r) {
    const name = (r.demo && r.demo.name || '').trim();
    return name ? `<b>${esc(name)}</b> <small>(ID ${r.pid})</small>` : `<b>ID ${r.pid}</b>`;
  }
  const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDateTime = iso => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Standard inner-screen navigation bar. `left` and `right` are {act, label} or null.
  function navBar(title, left, right) {
    const btn = (b, side) => b ? `<button class="nav-btn nav-${side}" data-act="${b.act}">${side === 'l' ? icon('chevL') : ''}${esc(b.label)}</button>`
      : `<span class="nav-${side}"></span>`;
    return `<header class="nav bar"><div class="nav-row">${btn(left, 'l')}<h1>${title}</h1>${right && right.meta ? `<span class="nav-r nav-meta">${esc(right.meta)}</span>` : btn(right, 'r')}</div></header>`;
  }

  // ---- HOME ----
  let searchQ = '';
  function highlight(text, q) {   // wrap query tokens (prefix/substring) in <mark>
    const raw = String(text || ''); if (!q) return esc(raw);
    const toks = C.norm(q).split(' ').filter(t => t.length >= 1 && !/^\d{1,2}\s\w+$/.test(t));
    let out = esc(raw);
    for (const t of toks) { if (!t) continue; const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&') + ')', 'ig'); out = out.replace(re, '<mark>$1</mark>'); }
    return out;
  }
  function participantList() {
    const results = C.searchRecords(records, searchQ, settings);
    if (!Object.keys(records).length) return '<p class="empty">No participants yet. Tap “New participant” to begin.</p>';
    if (!results.length) return `<p class="empty">No matches for “${esc(searchQ)}”.<br><span class="caption">Try a name, study ID, indication, age, income or a date like 03/09.</span></p>`;
    return (searchQ ? `<p class="caption search-count">${results.length} match${results.length === 1 ? '' : 'es'} · best first</p>` : '') + '<ul class="plist">' + results.map(({ rec: r, matches }) => {
      const name = (r.demo.name || '').trim();
      const title = name ? `<b>${highlight(name, searchQ)}</b> <small>(ID ${highlight(r.pid, searchQ)})</small>` : `<b>ID ${highlight(r.pid, searchQ)}</b>`;
      const why = matches.filter(m => m.label !== 'Name' && m.label !== 'ID').slice(0, 3).map(m => `<span class="why"><span class="why-l">${esc(m.label)}</span> ${highlight(m.label === 'Recorded' ? fmtDateTime(m.value) : m.value, searchQ)}</span>`).join('');
      return `<li data-act="summary" data-pid="${r.pid}">
          <div class="row-main"><div class="row-title">${title}</div><div class="row-sub">${C.tasksDone(r)}/12 tasks · ${fmtDateTime(r.updatedAt)}</div>${why ? `<div class="row-why">${why}</div>` : ''}</div>
          ${C.needsExport(r) ? '<span class="dot" title="not backed up"></span>' : ''}${statusPill(r)}${icon('chevR', 'chev')}</li>`;
    }).join('') + '</ul>';
  }
  VIEWS.home = () => {
    if (C.dropEmptyRecords(records)) persist();   // an ID opened but never filled in is released again
    const list = Object.values(records).sort((a, b) => b.pid - a.pid);
    const nextId = C.nextFreeId(records);
    const un = C.unexportedCount(records);
    const unP = list.filter(r => r.status === 'in_progress' && C.needsExport(r)).length, unC = un - unP;
    const blocked = settings.exportLimit > 0 && un >= settings.exportLimit;
    const inprog = list.filter(r => r.status === 'in_progress');
    const complete = list.filter(r => r.status === 'complete').length;
    return `
    <header class="nav nav-large"><div class="nav-row"><div class="brand"><img src="./logo-mark.svg" alt=""><h1 class="large-title">CS Preference BWS</h1></div><button class="icon-btn" data-act="settings" aria-label="Settings">${icon('gear')}</button></div></header>
    ${un ? `<div class="callout ${blocked ? 'callout-danger' : 'callout-warn'}" role="status">${icon(blocked ? 'lock' : 'warn')}
      <span class="msg"><b>${un}</b> not backed up <span class="caption">(${unC} complete · ${unP} partial)</span>${blocked ? ' · new participants blocked' : ''}</span>
      <button class="btn" data-act="backup">Save backup</button></div>` : ''}
    <section class="card stack">
      <button class="btn btn-primary btn-block btn-hero" data-act="new" ${nextId === null || blocked ? 'disabled' : ''}>${icon('plus')} New participant ${nextId ? `<span class="chip">ID ${nextId}</span>` : '<span class="chip">all 224 used</span>'}</button>
      ${inprog.map(r => `<button class="btn btn-tinted btn-block btn-hero resume secondary big" data-act="open" data-pid="${r.pid}">
        <span class="l">${icon('play')} Resume ${labelFor(r)}</span><span class="r">${C.tasksDone(r)}/12 tasks · ${fmtTime(r.updatedAt)}</span></button>`).join('')}
    </section>
    <div class="tiles">
      <button class="tile" data-act="backup">${icon('down')}<b>Save backup</b><small>Full copy · 1 file</small></button>
      <button class="tile" data-act="export">${icon('table')}<b>Export CSV</b><small>For R / Excel</small></button>
      <button class="tile" data-act="import">${icon('up')}<b>Import backup</b><small>Restore</small></button>
    </div>
    <input type="file" id="import-file" accept=".json,application/json" hidden>
    <div class="section-h"><h2>Participants</h2><span class="meta">${list.length} of 224 · ${complete} complete</span></div>
    <div class="search ${searchQ ? 'has-q' : ''}">${icon('search')}<input id="search" type="search" placeholder="Search name, ID, indication, age, date…" value="${esc(searchQ)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Search participants"><button class="clear" data-act="clear-search" aria-label="Clear search">${icon('clear')}</button></div>
    <section class="card" id="plist-card">${participantList()}</section>
    <footer>v${APP_VERSION} · Data stays on this device until you export · <span id="online">${navigator.onLine ? 'Online' : 'Offline'}</span></footer>`;
  };
  VIEWS.home.bind_ = () => {
    $('#app').onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'new') newParticipant();
      else if (act === 'open') openParticipant(Number(b.dataset.pid));
      else if (act === 'summary') go({ name: 'review', pid: Number(b.dataset.pid) });
      else if (act === 'backup') saveBackup();
      else if (act === 'export') exportCSVs();
      else if (act === 'import') $('#import-file').click();
      else if (act === 'settings') go({ name: 'settings' });
      else if (act === 'clear-search') { searchQ = ''; const i = $('#search'); i.value = ''; $('.search').classList.remove('has-q'); $('#plist-card').innerHTML = participantList(); i.focus(); }
    };
    const si = $('#search');
    si.oninput = () => { searchQ = si.value; $('.search').classList.toggle('has-q', !!searchQ); $('#plist-card').innerHTML = participantList(); };
    si.onkeydown = e => { if (e.key === 'Escape') { si.value = ''; si.oninput(); } };
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
  const WIDE_FIELDS = new Set(['name', 'indication_cs', 'comorbidities', 'previous_cs_event', 'other_surgery_detail', 'education', 'administration_mode']);
  VIEWS.demo = v => {
    const r = records[v.pid]; const errs = v.errors || {};
    const fields = C.DEMO_FIELDS.filter(f => C.fieldVisible(f, r.demo, settings));
    return `
    ${navBar(`ID ${r.pid} · Case proforma`, { act: 'home', label: 'Save & exit' }, null)}
    <form id="demo-form" class="card" autocomplete="off" novalidate>
      <div class="form-grid">
      ${fields.map(f => `<label class="field ${errs[f.key] ? 'err' : ''} ${WIDE_FIELDS.has(f.key) ? 'span2' : ''}"><span>${esc(f.label)}${f.optional ? ' <em>· optional</em>' : ''}</span>
        ${f.type === 'select'
          ? `<select name="${f.key}"><option value="">Select…</option>${f.options.map(o => `<option ${r.demo[f.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
          : `<input name="${f.key}" type="${f.type}" ${f.type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(r.demo[f.key])}" placeholder="${esc(f.placeholder || '')}">`}
        ${errs[f.key] ? `<small class="errmsg">${esc(errs[f.key])}</small>` : ''}</label>`).join('')}
      </div>
      <button class="btn btn-primary btn-block btn-hero" type="submit">Continue to anxiety scale ${icon('chevR')}</button>
    </form>`;
  };
  VIEWS.demo.bind_ = v => {
    const r = records[v.pid]; const form = $('#demo-form');
    $('[data-act="home"]').onclick = () => go({ name: 'home' });
    form.oninput = e => { r.demo[e.target.name] = e.target.value; touch(r); if (e.target.tagName === 'SELECT') render(); };
    form.onsubmit = e => {
      e.preventDefault();
      const errors = C.validateDemo(r.demo, settings);
      if (Object.keys(errors).length) { v.errors = errors; render(); toast('Some fields need attention', 'Complete the highlighted fields to continue.', 'warn'); const first = $('.field.err'); first && first.scrollIntoView({ block: 'center' }); return; }
      go({ name: 'apais', pid: v.pid });
    };
  };

  // ---- APAIS ----
  VIEWS.apais = v => {
    const r = records[v.pid]; const s = C.apaisScores(r.apais);
    return `
    ${navBar(`ID ${r.pid} · Anxiety scale`, { act: 'back', label: 'Proforma' }, { act: 'home', label: 'Save & exit' })}
    <section class="card">
      <p class="hi instr">कृपया बताइए कि हर वाक्य आप पर कितना लागू होता है।</p>
      <p class="small muted">Amsterdam Preoperative Anxiety and Information Scale. 1 = not at all, 5 = extremely.</p>
      ${C.APAIS.map(q => `<div class="q">
        <p class="q-hi hi">${q.n}. ${esc(q.hi)}</p><p class="q-en">${esc(q.en)}</p>
        <div class="scale">${C.APAIS_SCALE.map(o => `<button type="button" class="opt ${Number(r.apais[q.n]) === o.v ? 'sel' : ''}" data-q="${q.n}" data-v="${o.v}"><b>${o.v}</b><span class="o-hi hi">${esc(o.hi)}</span><span class="o-en">${esc(o.en)}</span></button>`).join('')}</div>
      </div>`).join('')}
      <div class="score-line"><span>Anxiety score <b>${s.anxiety === null ? '—' : s.anxiety + '/20'}</b>${s.highAnxiety ? ' (high, ≥11)' : ''}</span><span>Information score <b>${s.information === null ? '—' : s.information + '/10'}</b></span></div>
      <button class="btn btn-primary btn-block btn-hero" data-act="next" ${s.complete ? '' : 'disabled'}>Continue to choice tasks ${icon('chevR')}</button>
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
    ${navBar(`ID ${v.pid} · Instructions`, { act: 'back', label: 'Back' }, null)}
    <section class="card">
      <p class="hi instr">अब आपको 12 सवाल दिखाए जाएँगे। हर सवाल में चार ऐसी बातें होंगी जो एनेस्थीसिया और ऑपरेशन के बाद ठीक होने के दौरान आपके लिए ज़रूरी हो सकती हैं।</p>
      <p class="hi instr">हर सवाल में पहले वह <b>एक</b> बात चुनें जो आपके लिए <b>सबसे ज़्यादा ज़रूरी</b> है, फिर वह <b>एक</b> बात चुनें जो आपके लिए <b>सबसे कम ज़रूरी</b> है।</p>
      <p class="hi instr">इसका कोई सही या गलत जवाब नहीं है। अपनी पसंद के आधार पर चुनें, न कि इस आधार पर कि डॉक्टर या परिवार क्या पसंद करेंगे।</p>
      <p class="small muted">You will see 12 sets of four outcomes. In each set choose the ONE most important to you (BEST) and the ONE least important (WORST). There are no right or wrong answers. The interviewer reads options verbatim and does not suggest or influence the choice.</p>
      <button class="btn btn-primary btn-block btn-hero" data-act="start">शुरू करें · Start ${icon('chevR')}</button>
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
    ${navBar(`ID ${r.pid} · सवाल ${v.i} / ${n}`, { act: 'home', label: 'Save & exit' }, { meta: `Set ${t.taskId}` })}
    <div class="stepper" aria-hidden="true">${Array.from({ length: n }, (_, k) => `<i class="${k + 1 < v.i || (k + 1 === v.i && done) ? 'done' : k + 1 === v.i ? 'cur' : ''}"></i>`).join('')}</div>
    <section class="card">
      <div class="thead"><span></span><span class="col col-best hi">सबसे ज़्यादा ज़रूरी<small>Most important</small></span><span class="col col-worst hi">सबसे कम ज़रूरी<small>Least important</small></span></div>
      ${t.options.map(oid => { const o = C.OUTCOME_BY_ID[oid]; return `
      <div class="trow ${t.best === oid ? 'is-best' : ''} ${t.worst === oid ? 'is-worst' : ''}">
        <div class="otext"><span class="o-hi hi">${esc(o.hi)}</span><span class="o-desc hi">${esc(o.hi_desc)}</span><span class="o-en">${esc(o.en)}</span></div>
        <button type="button" class="choice best ${t.best === oid ? 'sel' : ''}" data-kind="best" data-oid="${oid}" ${t.worst === oid ? 'disabled' : ''} aria-label="Most important: ${esc(o.en)}">${icon('check')}</button>
        <button type="button" class="choice worst ${t.worst === oid ? 'sel' : ''}" data-kind="worst" data-oid="${oid}" ${t.best === oid ? 'disabled' : ''} aria-label="Least important: ${esc(o.en)}">${icon('x')}</button>
      </div>`; }).join('')}
    </section>
    <div class="task-spacer"></div>
    <div class="task-nav"><div class="task-nav-in">
      <p class="hint">${done ? 'Both chosen. Tap Next.' : (!t.best ? 'Tap ✓ on the most important outcome.' : 'Now tap ✗ on the least important outcome.')}</p>
      <div class="row">
        <button class="btn btn-plain" data-act="prev" ${v.i === 1 ? 'disabled' : ''}>${icon('chevL')} पिछला</button>
        <button class="btn btn-primary" data-act="next" ${done ? '' : 'disabled'}>${v.i === n ? 'समाप्त · Finish' : 'अगला'} ${icon(v.i === n ? 'check' : 'chevR')}</button>
      </div>
    </div></div>`;
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
          if (missing) { toast('Task ' + missing + ' is incomplete', 'Choose a most and a least important outcome.', 'warn'); go({ name: 'task', pid: v.pid, i: missing }); return; }
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
    ${navBar(labelFor(r), { act: 'home', label: 'Home' }, null)}
    <section class="card">
      <div class="section-h"><h2>${r.status === 'complete' ? 'Interview complete' : r.status === 'withdrawn' ? 'Withdrawn' : 'In progress'}</h2>${statusPill(r)}</div>
      <div class="stat-grid">
        <div class="stat"><b>${C.tasksDone(r)}<span style="font-size:var(--fs-sub);font-weight:500;color:var(--text-2)">/${n}</span></b><span>tasks</span></div>
        <div class="stat"><b>${s.anxiety ?? '—'}</b><span>APAIS anxiety</span></div>
        <div class="stat"><b>${s.information ?? '—'}</b><span>APAIS information</span></div>
      </div>
      ${C.needsExport(r)
        ? `<div class="callout callout-warn">${icon('warn')}<span class="msg">Not backed up${un > 1 ? ` · ${un} pending` : ''}</span><button class="btn" data-act="backup">Save backup</button></div>`
        : `<div class="callout callout-ok">${icon('ok')}<span class="msg">Backed up ${fmtDateTime(r.exportedAt)}</span></div>`}
      ${r.status === 'in_progress'
        ? `<button class="btn btn-primary btn-block btn-hero" data-act="continue">${icon('play')} Continue interview</button><button class="btn btn-plain btn-block" data-act="home">Back to Home</button>`
        : `<div class="btn-row"><button class="btn btn-plain" data-act="export">${icon('table')} Export CSV</button><button class="btn btn-primary" data-act="home">Done</button></div>`}
    </section>
    <div class="section-h"><h2>Choices</h2><span class="meta">best · worst</span></div>
    <section class="card">
      <table class="mini"><tr><th>#</th><th>Set</th><th>Most important</th><th>Least important</th></tr>
      ${Array.from({ length: n }, (_, i) => r.tasks[i + 1]).map((t, i) => `<tr><td class="n">${i + 1}</td><td class="n">${t.taskId}</td><td class="best">${t.best ? esc(C.OUTCOME_BY_ID[t.best].en) : '—'}</td><td class="worst">${t.worst ? esc(C.OUTCOME_BY_ID[t.worst].en) : '—'}</td></tr>`).join('')}</table>
    </section>
    <div class="section-h"><h2>Edit</h2></div>
    <section class="card">
      <div class="btn-row">
        <button class="btn btn-plain" data-act="demo">Proforma</button>
        <button class="btn btn-plain" data-act="apais">Anxiety scale</button>
        ${r.status === 'in_progress' ? `<button class="btn btn-plain" data-act="tasks">Choice tasks</button>` : ''}
      </div>
      ${r.status !== 'withdrawn' ? `<button class="btn btn-danger-text btn-block" data-act="withdraw">Mark as withdrawn / incomplete</button>` : `<button class="btn btn-text btn-block" data-act="reopen">Re-open as in progress</button>`}
    </section>
    <div class="section-h"><h2>Danger zone</h2></div>
    <section class="card">
      <p class="small muted">Deleting removes this participant from the device. ID ${r.pid} is released and will be given to the next new participant, with the same randomisation sequence. A note of the deletion is kept in backups.</p>
      <button class="btn btn-danger-text btn-block" data-act="delete">Delete participant…</button>
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
      else if (act === 'continue') openParticipant(v.pid);
      else if (act === 'delete') {
        const ok = await dialog({
          title: 'Delete this participant?',
          message: `${labelFor(r)} · ${C.tasksDone(r)}/12 tasks · ${r.status.replace('_', ' ')}.<br><br>` +
            (C.needsExport(r) ? '<b>This record is not in any backup.</b> Its data will be gone for good.<br><br>' : 'The record stays in backups you have already saved.<br><br>') +
            `ID ${r.pid} will be reused for the next new participant.`,
          tone: 'danger', confirm: 'Delete participant', destructive: true, typed: String(r.pid)
        });
        if (!ok) { toast('Deletion cancelled'); return; }
        deleted.push({ pid: r.pid, deletedAt: nowISO(), statusAtDeletion: r.status, tasksDone: C.tasksDone(r), createdAt: r.createdAt, wasBackedUp: !C.needsExport(r) });
        delete records[r.pid]; await persist();
        toast('Participant deleted', `ID ${r.pid} is free again and will be used next.`, 'ok'); go({ name: 'home' });
      }
      else if (act === 'withdraw') {
        if (await dialog({ title: 'Mark as withdrawn?', message: `${labelFor(r)} will be flagged as withdrawn or incomplete. Everything already entered is kept and included in exports.`, tone: 'warn', confirm: 'Mark as withdrawn', destructive: true }))
          { r.status = 'withdrawn'; await touch(r); render(); }
      }
      else if (act === 'reopen') { r.status = 'in_progress'; await touch(r); render(); }
    };
  };

  // ---- SETTINGS ----
  VIEWS.settings = () => `
    ${navBar('Settings', { act: 'home', label: 'Home' }, null)}
    <div class="section-h"><h2>Appearance</h2></div>
    <section class="card">
      <div class="seg" role="radiogroup" aria-label="Appearance">
        ${[['auto', 'System', 'gear'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, l, i]) => `<button type="button" role="radio" aria-checked="${(settings.theme || 'auto') === v}" class="${(settings.theme || 'auto') === v ? 'sel' : ''}" data-theme="${v}">${icon(i)} ${l}</button>`).join('')}
      </div>
      <p class="help">System follows the device's light or dark setting.</p>
    </section>
    <div class="section-h"><h2>Data collection</h2></div>
    <form id="settings-form" class="card">
      <label class="field"><span>Default interviewer</span><input name="interviewer" value="${esc(settings.interviewer)}" autocapitalize="words"></label>
      <label class="field"><span>Block new participants when this many are not backed up <em>· 0 never blocks</em></span><input name="exportLimit" type="number" inputmode="numeric" min="0" max="50" value="${settings.exportLimit}"></label>
      <label class="check"><input type="checkbox" name="recordName" ${settings.recordName ? 'checked' : ''}><span>Record patient name in the app<small>Uncheck for study-ID-only operation, with the name kept on the paper consent form.</small></span></label>
      <button class="btn btn-primary btn-block" type="submit">Save settings</button>
    </form>
    <div class="section-h"><h2>About</h2></div>
    <section class="card">
      <p class="small">Patient priorities for outcomes related to anaesthesia and perioperative care during elective caesarean delivery: a best-worst scaling study. MAMC / Lok Nayak Hospital.</p>
      <div>
        <div class="srow"><span>App version</span><span>${APP_VERSION}</span></div>
        <div class="srow"><span>Design</span><span>224 participants × 12 tasks × 4 outcomes</span></div>
        <div class="srow"><span>Randomisation</span><span>1–200 approved file · 201–224 extended</span></div>
        <div class="srow"><span>Storage</span><span>localStorage ${lsGet(LS_RECORDS) ? 'OK' : 'empty'} · IndexedDB ${db ? 'OK' : 'unavailable'}</span></div>
        <div class="srow"><span>On this device</span><span>${Object.keys(records).length} participants${deleted.length ? ` · ${deleted.length} deleted` : ''}</span></div>
      </div>
    </section>
    <div class="section-h"><h2>Factory reset</h2></div>
    <section class="card">
      <p class="small muted">Erases every participant record and restores default settings on this device. The hosted app and any backup files you have saved are not affected. Save a backup first.</p>
      <button class="btn btn-danger-text btn-block" data-act="wipe">Factory reset this device…</button>
    </section>`;
  VIEWS.settings.bind_ = () => {
    $('[data-act="home"]').onclick = () => go({ name: 'home' });
    $('.seg').onclick = async e => {
      const b = e.target.closest('[data-theme]'); if (!b) return;
      settings.theme = b.dataset.theme; applyTheme(settings.theme); await persist(); render();
    };
    $('#settings-form').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      settings.interviewer = f.interviewer.value.trim();
      settings.exportLimit = Math.max(0, Number(f.exportLimit.value) || 0);
      settings.recordName = f.recordName.checked;
      await persist(); toast('Settings saved', null, 'ok'); go({ name: 'home' });
    };
    $('[data-act="wipe"]').onclick = async () => {
      const n = Object.keys(records).length, un = C.unexportedCount(records);
      const ok = await dialog({
        title: 'Factory reset this device?',
        message: `This permanently erases <b>${n} participant${n === 1 ? '' : 's'}</b> and restores default settings.` +
          (un ? `<br><br><b>${un} participant${un === 1 ? ' is' : 's are'} not backed up.</b> Save a backup first if you need this data.` : '') +
          '<br><br>Backup files already saved and the hosted app are not affected.',
        tone: 'danger', confirm: 'Erase everything', destructive: true, typed: 'RESET'
      });
      if (!ok) { toast('Reset cancelled'); return; }
      records = {}; deleted = []; settings = Object.assign({}, DEFAULT_SETTINGS); applyTheme(settings.theme);
      await persist(); toast('Device reset', 'All data erased and settings restored.', 'ok'); go({ name: 'home' });
    };
  };

  // ---------- boot ----------
  async function boot() {
    const problems = C.validateDesign(DESIGN, BLOCKS);
    if (problems.length) { dialog({ title: 'Design file problem', message: esc(problems.slice(0, 3).join('; ')), tone: 'danger' }); }
    await loadAll();
    applyTheme(settings.theme);
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; history.replaceState({ home: true }, ''); } catch (e) { /* ignore */ }
    render();
    window.addEventListener('online', () => { const o = $('#online'); if (o) o.textContent = 'Online'; });
    window.addEventListener('offline', () => { const o = $('#online'); if (o) o.textContent = 'Offline'; });
    if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/nosw/.test(location.search)) {
      // When a new version has taken over: reload immediately if idle on Home, otherwise wait for a safe moment.
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) { hadController = true; return; }   // first install, nothing to swap
        if (view.name === 'home' || view.name === 'settings') { location.reload(); return; }
        pendingReload = true; toast('Update ready', 'The app will refresh when you return to Home.');
      });
      navigator.serviceWorker.register('./sw.js').then(reg => { reg.update().catch(() => {}); }).catch(() => {});
    }
  }
  window.BWSApp = { boot, get records() { return records; }, get settings() { return settings; } };
  document.addEventListener('DOMContentLoaded', boot);
})();
