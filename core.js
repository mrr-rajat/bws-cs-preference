/* core.js — pure logic (no DOM). Used by app.js in the browser and by test/test.js in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BWSCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APP_ID = 'bws-cs-preference';
  const DATA_VERSION = 1;
  const MAX_PID = 224;

  // Annexure III (English) + परिशिष्ट (Hindi). Hindi re-typed from the PDF images; proofread against the approved annexure.
  const OUTCOMES = [
    { id: 'O01', en: 'Avoiding pain during CS', hi: 'सिज़ेरियन सेक्शन के दौरान दर्द न महसूस होना',
      en_desc: 'Feeling pain during operation', hi_desc: 'ऑपरेशन के दौरान दर्द महसूस होना' },
    { id: 'O02', en: 'Avoiding pain after CS', hi: 'सिज़ेरियन सेक्शन होने के बाद दर्द ना होना',
      en_desc: 'Pain after operation is completed', hi_desc: 'ऑपरेशन पूरा होने के बाद दर्द होना' },
    { id: 'O03', en: 'Avoiding nausea and vomiting', hi: 'जी मचलना और उल्टी ना होना',
      en_desc: 'Feeling sick or vomiting during or after surgery', hi_desc: 'सर्जरी के दौरान या उसके बाद मतली या उल्टी होना' },
    { id: 'O04', en: 'Avoiding headache after CS', hi: 'सीज़ेरियन सेक्शन (CS) के बाद सिरदर्द ना होना',
      en_desc: 'Headache after spinal anaesthesia', hi_desc: 'स्पाइनल एनेस्थीसिया के बाद सिरदर्द होना' },
    { id: 'O05', en: 'Well-being of baby', hi: 'नवजात शिशु का ठीक होना',
      en_desc: 'Avoiding harm or complications affecting baby during or immediately after delivery',
      hi_desc: 'प्रसव के दौरान या उसके तुरंत बाद शिशु को होने वाली हानि या जटिलताओं से बचाव' },
    { id: 'O06', en: 'Treated with dignity and respect', hi: 'सम्मान और गरिमा के साथ इलाज',
      en_desc: 'Being treated politely, respectfully, and with consideration by all members of healthcare team',
      hi_desc: 'स्वास्थ्य सेवा दल के सभी सदस्यों द्वारा विनम्रता, सम्मान और संवेदनशीलता के साथ व्यवहार किया जाना' },
    { id: 'O07', en: 'Shared decision making', hi: 'इलाज से संबंधित निर्णयों में शामिल होना',
      en_desc: 'Being involved in decisions about anaesthesia wherever possible',
      hi_desc: 'जहाँ संभव हो, एनेस्थीसिया से संबंधित निर्णयों में स्वयं की भागीदारी होना' },
    { id: 'O08', en: 'Good communication', hi: 'अच्छे से सूचना मिलना और मेरी बातों को सुनना',
      en_desc: 'Receiving explanations in a way that you understand and feeling that your concerns are heard',
      hi_desc: 'ऐसे तरीके से जानकारी एवं स्पष्टीकरण प्राप्त होना जिसे आप समझ सकें तथा यह महसूस होना कि आपकी चिंताओं को सुना और समझा जा रहा है' },
    { id: 'O09', en: 'Physical safety of mother', hi: 'माता की शारीरिक सुरक्षा',
      en_desc: 'Avoiding serious complications related to anaesthesia or surgery',
      hi_desc: 'एनेस्थीसिया या सर्जरी से संबंधित गंभीर जटिलताओं से बचाव' },
    { id: 'O10', en: 'Getting early discharge from hospital', hi: 'अस्पताल से जल्दी छुट्टी',
      en_desc: 'Being able to leave hospital and return home as soon as you are well enough after your operation',
      hi_desc: 'ऑपरेशन के बाद पर्याप्त रूप से स्वस्थ होने पर यथाशीघ्र अस्पताल से छुट्टी लेकर घर वापस जा पाना' },
    { id: 'O11', en: 'Avoiding chronic back pain', hi: 'दीर्घकालिक पीठ दर्द से बचाव',
      en_desc: 'Not developing back pain that continues for a long time after your operation',
      hi_desc: 'ऑपरेशन के बाद लंबे समय तक बने रहने वाले पीठ दर्द का विकसित न होना' },
    { id: 'O12', en: 'Able to move as soon as possible after surgery', hi: 'ऑपरेशन के बाद जितनी जल्दी हो सके चल फिर सकना',
      en_desc: 'Able to sit up, stand, walk or move around as soon as it is safe after your operation',
      hi_desc: 'ऑपरेशन के बाद सुरक्षित होने पर जितनी जल्दी संभव हो, बैठ पाना, खड़े होना, चलना या इधर-उधर घूम पाना' }
  ];
  const OUTCOME_BY_ID = Object.fromEntries(OUTCOMES.map(o => [o.id, o]));

  // Annexure I — Amsterdam Preoperative Anxiety and Information Scale.
  // English is the approved text. Hindi is an unofficial working translation for the interviewer; replace with your validated version.
  const APAIS = [
    { n: 1, en: 'I am worried about the anaesthetic', hi: 'मुझे एनेस्थीसिया (बेहोशी की दवा) की चिंता है', sub: 'anxiety' },
    { n: 2, en: 'The anaesthetic is on my mind continually', hi: 'एनेस्थीसिया के बारे में मेरे मन में लगातार विचार आते रहते हैं', sub: 'anxiety' },
    { n: 3, en: 'I would like to know as much as possible about the anaesthetic', hi: 'मैं एनेस्थीसिया के बारे में जितना संभव हो उतना जानना चाहती हूँ', sub: 'information' },
    { n: 4, en: 'I am worried about the procedure', hi: 'मुझे ऑपरेशन की चिंता है', sub: 'anxiety' },
    { n: 5, en: 'The procedure is on my mind continually', hi: 'ऑपरेशन के बारे में मेरे मन में लगातार विचार आते रहते हैं', sub: 'anxiety' },
    { n: 6, en: 'I would like to know as much as possible about the procedure', hi: 'मैं ऑपरेशन के बारे में जितना संभव हो उतना जानना चाहती हूँ', sub: 'information' }
  ];
  const APAIS_SCALE = [
    { v: 1, en: 'Not at all', hi: 'बिल्कुल नहीं' },
    { v: 2, en: 'Slightly', hi: 'थोड़ा' },
    { v: 3, en: 'Moderately', hi: 'मध्यम' },
    { v: 4, en: 'Very', hi: 'बहुत' },
    { v: 5, en: 'Extremely', hi: 'अत्यधिक' }
  ];

  function apaisScores(ans) {
    ans = ans || {};
    const get = n => { const v = Number(ans[n]); return v >= 1 && v <= 5 ? v : null; };
    const anx = [1, 2, 4, 5].map(get), inf = [3, 6].map(get);
    const anxiety = anx.every(v => v !== null) ? anx.reduce((a, b) => a + b, 0) : null;
    const information = inf.every(v => v !== null) ? inf.reduce((a, b) => a + b, 0) : null;
    return { anxiety, information, highAnxiety: anxiety === null ? null : anxiety >= 11, complete: anxiety !== null && information !== null };
  }

  // Demographic field definitions (case proforma). `key` is the CSV column.
  const DEMO_FIELDS = [
    { key: 'name', label: 'Name', type: 'text', optional: true, onlyIfNameEnabled: true },
    { key: 'age', label: 'Age (years)', type: 'number', min: 18, max: 60 },
    { key: 'admission_date', label: 'Date of admission', type: 'date' },
    { key: 'surgery_date', label: 'Date of surgery', type: 'date' },
    { key: 'height_cm', label: 'Height (cm)', type: 'number', min: 120, max: 200 },
    { key: 'weight_kg', label: 'Weight (kg)', type: 'number', min: 30, max: 200 },
    { key: 'indication_cs', label: 'Indication of CS', type: 'text' },
    { key: 'asa_grade', label: 'ASA grade', type: 'select', options: ['II', 'III'] },
    { key: 'comorbidities', label: 'Co-morbidities', type: 'text', optional: true, placeholder: 'None / list' },
    { key: 'education', label: 'Educational status', type: 'select',
      options: ['No formal education', 'Primary (up to class 5)', 'Middle (class 6-8)', 'Secondary (class 9-10)', 'Higher secondary (class 11-12)', 'Graduate', 'Postgraduate or above'] },
    { key: 'occupation', label: 'Occupation', type: 'select', options: ['Homemaker', 'Employed', 'Self-employed', 'Student', 'Unemployed', 'Other'] },
    { key: 'monthly_income_inr', label: 'Monthly family income (INR)', type: 'number', min: 0, max: 10000000 },
    { key: 'parity', label: 'Parity', type: 'number', min: 0, max: 15 },
    { key: 'live_issues', label: 'Live issues', type: 'number', min: 0, max: 15 },
    { key: 'previous_cs', label: 'History of previous CS', type: 'select', options: ['No', 'Yes'] },
    { key: 'previous_cs_count', label: 'Number of previous CS', type: 'number', min: 1, max: 10, showIf: { key: 'previous_cs', value: 'Yes' } },
    { key: 'previous_cs_event', label: 'Any significant event during previous CS', type: 'text', optional: true, showIf: { key: 'previous_cs', value: 'Yes' } },
    { key: 'other_surgery', label: 'Any history of surgery other than CS', type: 'select', options: ['No', 'Yes'] },
    { key: 'other_surgery_detail', label: 'Details of other surgery', type: 'text', optional: true, showIf: { key: 'other_surgery', value: 'Yes' } },
    { key: 'administration_mode', label: 'BWS administration', type: 'select', options: ['Interviewer-administered (Hindi)', 'Self-completed'] },
    { key: 'interviewer', label: 'Interviewer initials', type: 'text' }
  ];

  function fieldVisible(f, demo, settings) {
    if (f.onlyIfNameEnabled && !(settings && settings.recordName)) return false;
    if (f.showIf && String((demo || {})[f.showIf.key] || '') !== f.showIf.value) return false;
    return true;
  }

  function validateDemo(demo, settings) {
    const errors = {};
    demo = demo || {};
    for (const f of DEMO_FIELDS) {
      if (!fieldVisible(f, demo, settings)) continue;
      const v = demo[f.key];
      const empty = v === undefined || v === null || String(v).trim() === '';
      if (empty) { if (!f.optional) errors[f.key] = 'Required'; continue; }
      if (f.type === 'number') {
        const n = Number(v);
        if (!isFinite(n)) errors[f.key] = 'Must be a number';
        else if (f.min !== undefined && n < f.min) errors[f.key] = 'Minimum ' + f.min;
        else if (f.max !== undefined && n > f.max) errors[f.key] = 'Maximum ' + f.max;
      }
      if (f.type === 'select' && !f.options.includes(v)) errors[f.key] = 'Invalid option';
    }
    return errors;
  }

  function newRecord(pid, design, now) {
    now = now || new Date().toISOString();
    const seq = design[pid] || design[String(pid)];
    if (!seq) throw new Error('No design for participant ' + pid);
    const tasks = {};
    seq.forEach((t, i) => { tasks[i + 1] = { taskId: t[0], options: t[1].slice(), best: null, worst: null, startedAt: null, completedAt: null }; });
    return { pid: Number(pid), createdAt: now, updatedAt: now, exportedAt: null, status: 'in_progress', demo: {}, apais: {}, tasks };
  }

  function taskComplete(t) { return !!(t && t.best && t.worst && t.best !== t.worst && t.options.includes(t.best) && t.options.includes(t.worst)); }
  function tasksDone(rec) { return Object.values(rec.tasks || {}).filter(taskComplete).length; }
  function firstIncompleteTask(rec) {
    const n = Object.keys(rec.tasks || {}).length;
    for (let i = 1; i <= n; i++) if (!taskComplete(rec.tasks[i])) return i;
    return null;
  }

  function nextFreeId(records, max) {
    max = max || MAX_PID;
    for (let i = 1; i <= max; i++) if (!records[i] && !records[String(i)]) return i;
    return null;
  }

  // Any record (including a partially filled one) changed since the last backup counts as not backed up.
  function needsExport(rec) {
    return !rec.exportedAt || rec.exportedAt < rec.updatedAt;
  }
  function unexportedCount(records) { return Object.values(records).filter(needsExport).length; }

  // A record with nothing entered yet (only prefilled interviewer / administration mode) can be discarded silently.
  const PREFILLED = new Set(['interviewer', 'administration_mode']);
  function isEmptyRecord(rec) {
    if (!rec || rec.status !== 'in_progress') return false;
    const demoHasData = Object.keys(rec.demo || {}).some(k => !PREFILLED.has(k) && String(rec.demo[k] ?? '').trim() !== '');
    const apaisHasData = Object.values(rec.apais || {}).some(v => v);
    const tasksHaveData = Object.values(rec.tasks || {}).some(t => t.best || t.worst);
    return !demoHasData && !apaisHasData && !tasksHaveData;
  }
  function dropEmptyRecords(records) {
    let dropped = 0;
    for (const k of Object.keys(records)) if (isEmptyRecord(records[k])) { delete records[k]; dropped++; }
    return dropped;
  }

  // Merge two record maps; the more recently updated copy of each participant wins.
  function mergeRecords(a, b) {
    const out = {};
    for (const src of [a || {}, b || {}]) {
      for (const k of Object.keys(src)) {
        const r = src[k]; if (!r || !r.pid) continue;
        const cur = out[r.pid];
        if (!cur || (r.updatedAt || '') > (cur.updatedAt || '')) out[r.pid] = r;
      }
    }
    return out;
  }

  // ---- CSV export ----
  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(header, rows) {
    return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  }
  function sortedRecords(records) { return Object.values(records).sort((x, y) => x.pid - y.pid); }

  function secondsBetween(a, b) {
    if (!a || !b) return '';
    const s = (new Date(b) - new Date(a)) / 1000;
    return isFinite(s) ? Math.round(s) : '';
  }

  // Long format: one row per (participant, task, alternative). Ready for survival::clogit / support.BWS in R.
  function buildBwsLong(records) {
    const header = ['participant_id', 'presentation_order', 'task_id', 'position', 'outcome_id', 'outcome_en', 'best', 'worst', 'task_seconds', 'status'];
    const rows = [];
    for (const r of sortedRecords(records)) {
      const n = Object.keys(r.tasks).length;
      for (let i = 1; i <= n; i++) {
        const t = r.tasks[i]; if (!taskComplete(t)) continue;
        t.options.forEach((oid, p) => rows.push([r.pid, i, t.taskId, p + 1, oid, OUTCOME_BY_ID[oid] ? OUTCOME_BY_ID[oid].en : '',
          oid === t.best ? 1 : 0, oid === t.worst ? 1 : 0, secondsBetween(t.startedAt, t.completedAt), r.status]));
      }
    }
    return toCSV(header, rows);
  }

  // One row per task: what was shown and what was chosen.
  function buildBwsChoices(records) {
    const header = ['participant_id', 'presentation_order', 'task_id', 'position_1', 'position_2', 'position_3', 'position_4', 'best_outcome', 'worst_outcome', 'started_at', 'completed_at', 'task_seconds'];
    const rows = [];
    for (const r of sortedRecords(records)) {
      const n = Object.keys(r.tasks).length;
      for (let i = 1; i <= n; i++) {
        const t = r.tasks[i];
        rows.push([r.pid, i, t.taskId, ...t.options, t.best || '', t.worst || '', t.startedAt || '', t.completedAt || '', secondsBetween(t.startedAt, t.completedAt)]);
      }
    }
    return toCSV(header, rows);
  }

  // One row per participant: proforma + APAIS + completion.
  function buildParticipantsWide(records, settings) {
    const demoKeys = DEMO_FIELDS.filter(f => !(f.onlyIfNameEnabled && !(settings && settings.recordName))).map(f => f.key);
    const header = ['participant_id', 'status', ...demoKeys, 'apais_1', 'apais_2', 'apais_3', 'apais_4', 'apais_5', 'apais_6',
      'apais_anxiety', 'apais_information', 'apais_high_anxiety', 'tasks_completed', 'bws_total_seconds', 'created_at', 'updated_at'];
    const rows = [];
    for (const r of sortedRecords(records)) {
      const s = apaisScores(r.apais);
      const ts = Object.values(r.tasks).map(t => t.startedAt).filter(Boolean).sort();
      const te = Object.values(r.tasks).map(t => t.completedAt).filter(Boolean).sort();
      rows.push([r.pid, r.status, ...demoKeys.map(k => r.demo[k] === undefined ? '' : r.demo[k]),
        ...[1, 2, 3, 4, 5, 6].map(n => r.apais[n] || ''), s.anxiety === null ? '' : s.anxiety, s.information === null ? '' : s.information,
        s.highAnxiety === null ? '' : (s.highAnxiety ? 1 : 0), tasksDone(r), secondsBetween(ts[0], te[te.length - 1]), r.createdAt, r.updatedAt]);
    }
    return toCSV(header, rows);
  }

  // Single analysis file: participant columns repeated on every row, one row per outcome shown
  // (48 per completed participant). Participants with no completed task get one row with blank task columns.
  function buildCombined(records, settings) {
    const demoKeys = DEMO_FIELDS.filter(f => !(f.onlyIfNameEnabled && !(settings && settings.recordName))).map(f => f.key);
    const header = ['participant_id', 'status', ...demoKeys, 'apais_1', 'apais_2', 'apais_3', 'apais_4', 'apais_5', 'apais_6',
      'apais_anxiety', 'apais_information', 'apais_high_anxiety', 'tasks_completed', 'created_at', 'updated_at',
      'presentation_order', 'task_id', 'position', 'outcome_id', 'outcome_en', 'best', 'worst', 'task_started_at', 'task_completed_at', 'task_seconds'];
    const rows = [];
    for (const r of sortedRecords(records)) {
      const s = apaisScores(r.apais);
      const head = [r.pid, r.status, ...demoKeys.map(k => r.demo[k] === undefined ? '' : r.demo[k]),
        ...[1, 2, 3, 4, 5, 6].map(n => r.apais[n] || ''), s.anxiety === null ? '' : s.anxiety, s.information === null ? '' : s.information,
        s.highAnxiety === null ? '' : (s.highAnxiety ? 1 : 0), tasksDone(r), r.createdAt, r.updatedAt];
      let any = false;
      const n = Object.keys(r.tasks).length;
      for (let i = 1; i <= n; i++) {
        const t = r.tasks[i]; if (!taskComplete(t)) continue;
        any = true;
        t.options.forEach((oid, p) => rows.push([...head, i, t.taskId, p + 1, oid, OUTCOME_BY_ID[oid] ? OUTCOME_BY_ID[oid].en : '',
          oid === t.best ? 1 : 0, oid === t.worst ? 1 : 0, t.startedAt || '', t.completedAt || '', secondsBetween(t.startedAt, t.completedAt)]));
      }
      if (!any) rows.push([...head, '', '', '', '', '', '', '', '', '', '']);
    }
    return toCSV(header, rows);
  }

  function buildBackup(records, settings, now, deleted) {
    return JSON.stringify({ app: APP_ID, dataVersion: DATA_VERSION, exportedAt: now || new Date().toISOString(), settings: settings || {}, records, deleted: deleted || [] }, null, 0);
  }
  // Union of deletion-log entries, keyed by (pid, deletedAt).
  function mergeDeleted(a, b) {
    const seen = new Set(), out = [];
    for (const e of [...(a || []), ...(b || [])]) { const k = e.pid + '@' + e.deletedAt; if (!e || seen.has(k)) continue; seen.add(k); out.push(e); }
    return out.sort((x, y) => (x.deletedAt || '').localeCompare(y.deletedAt || ''));
  }
  function parseBackup(text) {
    const obj = JSON.parse(text);
    if (!obj || obj.app !== APP_ID || !obj.records) throw new Error('Not a backup file from this app');
    const records = {};
    for (const k of Object.keys(obj.records)) {
      const r = obj.records[k];
      if (!r || typeof r.pid !== 'number' || !r.tasks) throw new Error('Corrupt record ' + k);
      records[r.pid] = r;
    }
    return { records, settings: obj.settings || {}, exportedAt: obj.exportedAt, deleted: Array.isArray(obj.deleted) ? obj.deleted : [] };
  }

  const STUDY_SLUG = 'CS-Preference-BWS';
  // ---------- search ----------
  // Every token must match some field (AND). Per-token score = best field match × field weight.
  // Match ladder: exact 100 > prefix 85 > word-prefix 70 > substring 55 > fuzzy (≤1 edit for 4+ chars, ≤2 for 7+) 40/30.
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function norm(s) {
    return String(s === undefined || s === null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s./-]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function dateForms(iso) {   // '2026-09-01' -> ['2026-09-01','01/09/2026','1/9/2026','01/09','1/9','1 sep','01 sep','sep 2026','1 sep 2026']
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return [];
    const [_, y, mo, d] = m, mon = MONTHS[Number(mo) - 1], D = String(Number(d)), M = String(Number(mo));
    return [`${y}-${mo}-${d}`, `${d}/${mo}/${y}`, `${D}/${M}/${y}`, `${d}/${mo}`, `${D}/${M}`, `${D} ${mon}`, `${d} ${mon}`, `${mon} ${y}`, `${D} ${mon} ${y}`, `${d}-${mo}-${y}`];
  }
  function editDistance(a, b, max) {   // Damerau-Levenshtein (optimal string alignment), early exit when > max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  function matchScore(token, value) {   // both normalised; returns 0..100
    if (!value) return 0;
    if (value === token) return 100;
    if (value.startsWith(token)) return 85;
    const words = value.split(' ');
    if (words.some(w => w.startsWith(token))) return 70;
    if (value.includes(token)) return 55;
    if (/\d/.test(token)) return 0;                        // no fuzzy matching for numbers or dates
    const max = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
    if (!max) return 0;
    let best = max + 1;
    for (const w of words) { if (w.length >= 3) best = Math.min(best, editDistance(token, w, max)); if (best === 1) break; }
    return best <= max ? (best === 1 ? 40 : 30) : 0;
  }
  // Searchable fields for one record: [{label, value(display), n(normalised), w(weight)}]
  function searchFields(rec, settings) {
    const d = rec.demo || {}, s = apaisScores(rec.apais);
    const f = [];
    const add = (label, value, w, forms) => { if (value === undefined || value === null || String(value).trim() === '') return; f.push({ label, value: String(value), forms: (forms || [norm(value)]).filter(Boolean), w }); };
    add('ID', rec.pid, 1.0, [String(rec.pid), 'id ' + rec.pid, '#' + rec.pid]);
    if (settings && settings.recordName === false) { /* name hidden */ } else add('Name', d.name, 1.0);
    add('Status', { in_progress: 'in progress partial', complete: 'complete', withdrawn: 'withdrawn incomplete' }[rec.status], 0.5);
    add('Age', d.age, 0.8); add('Indication', d.indication_cs, 0.8); add('Co-morbidities', d.comorbidities, 0.8);
    add('Previous CS event', d.previous_cs_event, 0.7); add('Other surgery', d.other_surgery_detail, 0.7);
    add('Education', d.education, 0.6); add('Occupation', d.occupation, 0.6); add('ASA', d.asa_grade ? 'asa ' + d.asa_grade : '', 0.6, d.asa_grade ? [norm('asa ' + d.asa_grade), norm(d.asa_grade)] : null);
    add('Previous CS', d.previous_cs === 'Yes' ? 'previous cs yes ' + (d.previous_cs_count || '') : d.previous_cs === 'No' ? 'previous cs no primigravida' : '', 0.5);
    add('Height', d.height_cm, 0.5); add('Weight', d.weight_kg, 0.5); add('Income', d.monthly_income_inr, 0.5);
    add('Parity', d.parity, 0.4); add('Live issues', d.live_issues, 0.4); add('Interviewer', d.interviewer, 0.5); add('Mode', d.administration_mode, 0.3);
    add('Admission', d.admission_date, 0.6, dateForms(d.admission_date)); add('Surgery date', d.surgery_date, 0.6, dateForms(d.surgery_date));
    add('Recorded', rec.updatedAt, 0.4, dateForms(rec.updatedAt));
    if (s.anxiety !== null) add('APAIS anxiety', s.anxiety, 0.4, [String(s.anxiety), 'apais ' + s.anxiety, s.highAnxiety ? 'high anxiety' : 'low anxiety']);
    return f;
  }
  function searchRecords(records, query, settings) {
    const q = norm(query);
    const list = Object.values(records);
    if (!q) return list.sort((a, b) => b.pid - a.pid).map(r => ({ rec: r, score: 0, matches: [] }));
    // date-like tokens stay whole ("3 sep" is joined below when both parts look like a date)
    let tokens = q.split(' ');
    const joined = [];
    for (let i = 0; i < tokens.length; i++) {
      if (i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i]) && MONTHS.includes(tokens[i + 1].slice(0, 3))) { joined.push(tokens[i] + ' ' + tokens[i + 1].slice(0, 3)); i++; }
      else joined.push(tokens[i]);
    }
    tokens = joined;
    const out = [];
    for (const rec of list) {
      const fields = searchFields(rec, settings);
      let total = 0; const matches = [];
      for (const tok of tokens) {
        let best = 0, bestField = null;
        for (const f of fields) {
          for (const form of f.forms) {
            const sc = matchScore(tok, form) * f.w;
            if (sc > best) { best = sc; bestField = f; }
          }
        }
        if (!best) { total = 0; break; }
        total += best; if (bestField && !matches.includes(bestField)) matches.push(bestField);
      }
      if (total > 0) out.push({ rec, score: total, matches: matches.map(f => ({ label: f.label, value: f.value })) });
    }
    return out.sort((a, b) => b.score - a.score || (b.rec.updatedAt || '').localeCompare(a.rec.updatedAt || ''));
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  // e.g. 2026-09-03_14-05-33 (local device time)
  function stamp(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
  }
  // e.g. CS-Preference-BWS_backup_2026-09-03_14-05-33_n12.json
  function fileName(kind, ext, count, d) {
    return STUDY_SLUG + '_' + kind + '_' + stamp(d) + (count === undefined ? '' : '_n' + count) + '.' + ext;
  }

  // Sanity check of the embedded design: 224 participants, 12 tasks each, 4 distinct options, all 12 task ids.
  function validateDesign(design, blocks) {
    const problems = [];
    const pids = Object.keys(design).map(Number);
    if (pids.length !== MAX_PID) problems.push('expected ' + MAX_PID + ' participants, got ' + pids.length);
    for (const pid of pids) {
      const seq = design[pid];
      if (seq.length !== 12) problems.push('pid ' + pid + ' has ' + seq.length + ' tasks');
      const ids = seq.map(t => t[0]).sort((a, b) => a - b).join();
      if (ids !== '1,2,3,4,5,6,7,8,9,10,11,12') problems.push('pid ' + pid + ' task ids ' + ids);
      for (const [tid, opts] of seq) {
        if (new Set(opts).size !== 4) problems.push('pid ' + pid + ' task ' + tid + ' duplicate options');
        if (blocks && opts.slice().sort().join() !== blocks[tid].join()) problems.push('pid ' + pid + ' task ' + tid + ' options do not match block');
      }
    }
    return problems;
  }

  return { APP_ID, DATA_VERSION, MAX_PID, OUTCOMES, OUTCOME_BY_ID, APAIS, APAIS_SCALE, DEMO_FIELDS,
    apaisScores, fieldVisible, validateDemo, newRecord, taskComplete, tasksDone, firstIncompleteTask, nextFreeId,
    needsExport, unexportedCount, isEmptyRecord, dropEmptyRecords, mergeRecords, csvEscape, toCSV, buildBwsLong, buildBwsChoices, buildParticipantsWide, buildCombined,
    buildBackup, parseBackup, mergeDeleted, stamp, fileName, STUDY_SLUG, validateDesign, norm, editDistance, matchScore, searchFields, searchRecords };
});
