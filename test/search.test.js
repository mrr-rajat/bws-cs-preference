const assert = require('assert'); const fs = require('fs'); const path = require('path');
const C = require('../core.js');
const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '../design.js'), 'utf8'))(w);
const D = w.BWS_DESIGN; const S = { recordName: true };
function mk(pid, demo, status = 'complete', apais = { 1: 3, 2: 3, 3: 4, 4: 3, 5: 2, 6: 5 }, upd) {
  const r = C.newRecord(pid, D, '2026-09-0' + (pid % 9 + 1) + 'T10:00:00.000Z'); r.demo = demo; r.status = status; r.apais = apais; r.updatedAt = upd || r.createdAt; return r;
}
const recs = {
  1: mk(1, { name: 'Sunita Devi', age: '28', indication_cs: 'Previous CS', previous_cs: 'Yes', previous_cs_count: '1', admission_date: '2026-09-01', surgery_date: '2026-09-03', education: 'Graduate', occupation: 'Homemaker', monthly_income_inr: '25000', interviewer: 'Anshul' }),
  2: mk(2, { name: 'Pooja Sharma', age: '31', indication_cs: 'Breech presentation', previous_cs: 'No', admission_date: '2026-08-28', comorbidities: 'Gestational diabetes', education: 'Secondary (class 9-10)', interviewer: 'Anshul' }, 'in_progress'),
  12: mk(12, { name: 'Meena Kumari', age: '25', indication_cs: 'Placenta praevia', comorbidities: 'Hypothyroidism', previous_cs: 'No', height_cm: '156', weight_kg: '68' }),
  25: mk(25, { name: 'Sunita Yadav', age: '34', indication_cs: 'Previous 2 CS', previous_cs: 'Yes', previous_cs_count: '2', education: 'No formal education' }, 'withdrawn'),
  120: mk(120, { name: 'Anita Singh', age: '28', indication_cs: 'Previous CS', monthly_income_inr: '12000' })
};
const ids = q => C.searchRecords(recs, q, S).map(x => x.rec.pid);

assert.deepStrictEqual(ids(''), [120, 25, 12, 2, 1], 'empty query: newest id first');
assert.strictEqual(ids('12')[0], 12, 'bare number puts that ID first');
assert.ok(ids('12').includes(120), 'and includes prefix matches like 120');
assert.deepStrictEqual(ids('sunita'), [25, 1], 'two Sunitas, equal score -> most recently updated first');
assert.deepStrictEqual(ids('sunita devi'), [1], 'AND across tokens');
assert.deepStrictEqual(ids('sunita previous').sort((a, b) => a - b), [1, 25], 'both Sunitas have previous CS');
assert.deepStrictEqual(ids('sunitha'), ids('sunita'), 'one-typo fuzzy match');
assert.deepStrictEqual(ids('breach'), [2], 'fuzzy on indication');
assert.deepStrictEqual(ids('diabetes'), [2], 'word match inside co-morbidities');
assert.deepStrictEqual(ids('hypo'), [12], 'prefix within a word');
assert.deepStrictEqual(ids('25000'), [1], 'exact income');
assert.deepStrictEqual(ids('age 28'), [], '"age" is not a value in any field, so AND fails (labels are not searched)');
assert.deepStrictEqual(ids('28').sort((a, b) => a - b), [1, 2, 120], 'number 28 matches ages and admission day 28');
assert.deepStrictEqual(ids('28').slice(0, 2).sort((a, b) => a - b), [1, 120], 'exact age (28) ranks above date-part match');
assert.deepStrictEqual(ids('01/09'), [1], 'date dd/mm');
assert.deepStrictEqual(ids('1 sep'), [1], 'date "1 sep"');
assert.deepStrictEqual(ids('3 september'), [1, 2], 'month name trimmed to 3 letters; exact surgery date (w .6) outranks recorded-on date (w .4)');
assert.deepStrictEqual(ids('withdrawn'), [25], 'status search');
assert.deepStrictEqual(ids('partial'), [2], 'partial = in progress');
assert.strictEqual(ids('high anxiety').length, 5, 'anxiety 11 = high for all seeded');
assert.strictEqual(ids('zzzzqq').length, 0, 'no match');
assert.strictEqual(ids('#25')[0], 25, '#id form ranks the ID first (age 25 / income 25000 follow)');
assert.strictEqual(ids('ID 25')[0], 25, '"id 25" form ranks the ID first');
// name hidden setting excludes names
assert.strictEqual(C.searchRecords(recs, 'sunita', { recordName: false }).length, 0, 'name not searchable when recording disabled');
// matches carry labels
const m = C.searchRecords(recs, 'sunita devi', S)[0].matches.map(x => x.label);
assert.deepStrictEqual(m, ['Name'], 'both tokens matched in Name -> one label');
const m2 = C.searchRecords(recs, 'meena hypo', S)[0].matches.map(x => x.label);
assert.deepStrictEqual(m2, ['Name', 'Co-morbidities']);
// ranking: exact name beats fuzzy
const r = C.searchRecords({ 1: recs[1], 25: recs[25] }, 'devi', S); assert.strictEqual(r[0].rec.pid, 1);
assert.strictEqual(C.editDistance('sunita', 'sunitha', 2), 1); assert.strictEqual(C.editDistance('abcd', 'abdc', 2), 1, 'transposition = 1');
assert.strictEqual(C.matchScore('12', '120'), 85); assert.strictEqual(C.matchScore('12', '312'), 55); assert.strictEqual(C.matchScore('13', '120'), 0, 'no fuzzy for numbers'); assert.strictEqual(C.matchScore('01/09', '08/09'), 0, 'no fuzzy for dates');
console.log('search: all tests passed');
