// Node test of the pure logic in core.js against the embedded design.
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const C = require('../core.js');
const w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '../design.js'), 'utf8'))(w);
const DESIGN = w.BWS_DESIGN, BLOCKS = w.BWS_BLOCKS;

assert.deepStrictEqual(C.validateDesign(DESIGN, BLOCKS), [], 'design valid');
assert.strictEqual(C.OUTCOMES.length, 12);
assert.strictEqual(C.APAIS.length, 6);

// APAIS scoring
assert.deepStrictEqual(C.apaisScores({1:3,2:3,3:4,4:3,5:2,6:5}), {anxiety:11, information:9, highAnxiety:true, complete:true});
assert.strictEqual(C.apaisScores({1:3}).complete, false);

// records
let records = {};
assert.strictEqual(C.nextFreeId(records), 1);
const r1 = C.newRecord(1, DESIGN, '2026-09-03T10:00:00.000Z');
assert.strictEqual(Object.keys(r1.tasks).length, 12);
assert.deepStrictEqual(r1.tasks[1], {taskId:12, options:['O09','O11','O03','O05'], best:null, worst:null, startedAt:null, completedAt:null}, 'pid 1 first task matches CSV row 1');
records[1] = r1;
assert.strictEqual(C.nextFreeId(records), 2);
assert.strictEqual(C.firstIncompleteTask(r1), 1);

// demographics validation
const settings = {recordName:false};
let errs = C.validateDemo({}, settings);
assert.ok(errs.age && errs.asa_grade && !errs.name && !errs.previous_cs_count, 'required fields flagged, hidden/optional not');
const demo = {age:'28', admission_date:'2026-09-01', surgery_date:'2026-09-03', height_cm:'156', weight_kg:'68', indication_cs:'Previous CS', asa_grade:'II',
  education:'Graduate', occupation:'Homemaker', monthly_income_inr:'25000', parity:'1', live_issues:'1', previous_cs:'Yes', previous_cs_count:'1', other_surgery:'No',
  administration_mode:'Interviewer-administered (Hindi)', interviewer:'AR'};
assert.deepStrictEqual(C.validateDemo(demo, settings), {});
assert.deepStrictEqual(C.validateDemo(Object.assign({}, demo, {age:'17'}), settings), {age:'Minimum 18'});
r1.demo = demo; r1.apais = {1:3,2:3,3:4,4:3,5:2,6:5};

// fill tasks: best = first option, worst = last option
for (let i = 1; i <= 12; i++) { const t = r1.tasks[i]; t.best = t.options[0]; t.worst = t.options[3]; t.startedAt = '2026-09-03T10:0' + (i%10) + ':00.000Z'; t.completedAt = '2026-09-03T10:0' + (i%10) + ':30.000Z'; }
assert.strictEqual(C.tasksDone(r1), 12); assert.strictEqual(C.firstIncompleteTask(r1), null);
r1.status = 'complete'; r1.updatedAt = '2026-09-03T10:20:00.000Z';
assert.strictEqual(C.unexportedCount(records), 1);

// same outcome as best and worst is not complete
const t = C.newRecord(2, DESIGN).tasks[1]; t.best = t.options[0]; t.worst = t.options[0];
assert.strictEqual(C.taskComplete(t), false);

// CSVs
const long = C.buildBwsLong(records).split('\r\n').filter(Boolean);
assert.strictEqual(long.length, 1 + 48, '48 alternative rows');
assert.strictEqual(long[0], 'participant_id,presentation_order,task_id,position,outcome_id,outcome_en,best,worst,task_seconds,status');
assert.strictEqual(long[1], '1,1,12,1,O09,Physical safety of mother,1,0,30,complete');
assert.strictEqual(long[4], '1,1,12,4,O05,Well-being of baby,0,1,30,complete');
const bestCount = long.slice(1).filter(l => l.split(',')[6] === '1').length; assert.strictEqual(bestCount, 12);
const choices = C.buildBwsChoices(records).split('\r\n').filter(Boolean); assert.strictEqual(choices.length, 13);
const wide = C.buildParticipantsWide(records, settings).split('\r\n').filter(Boolean);
assert.strictEqual(wide.length, 2); assert.ok(!wide[0].includes(',name,'), 'name column hidden when recordName off');
assert.ok(C.buildParticipantsWide(records, {recordName:true}).startsWith('participant_id,status,name,'));
assert.ok(wide[1].includes(',11,9,1,12,'), 'apais scores + tasks in wide row: ' + wide[1]);
assert.strictEqual(C.csvEscape('a,"b"'), '"a,""b"""');

// backup round trip + merge (newer wins)
const bk = C.buildBackup(records, settings, '2026-09-03T11:00:00.000Z');
const parsed = C.parseBackup(bk);
assert.deepStrictEqual(parsed.records[1], r1);
const older = JSON.parse(JSON.stringify(r1)); older.updatedAt = '2026-09-03T09:00:00.000Z'; older.status = 'in_progress';
assert.strictEqual(C.mergeRecords({1: older}, parsed.records)[1].status, 'complete');
assert.strictEqual(C.mergeRecords(parsed.records, {1: older})[1].status, 'complete');
assert.throws(() => C.parseBackup('{"app":"other"}'));

// every participant 1..224 constructs
for (let p = 1; p <= 224; p++) C.newRecord(p, DESIGN);
assert.strictEqual(C.nextFreeId(Object.fromEntries(Array.from({length:224},(_,i)=>[i+1,{}]))), null);
console.log('core.js: all tests passed');
