const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
const confirmed = () => M.saveReview(M.fresh(), { deadline: '2026-10-02', noDeadline: false, format: 'PDF' });

test('unconfirmed fields cannot create a schedule', () => {
  const state = M.fresh();
  assert.equal(M.pending(state.review), 2);
  assert.throws(() => M.addSchedule(state), /截止日期/);
  assert.equal(state.schedule, null);
  assert.throws(() => M.addSchedule(M.saveReview(state, { deadline: '2026-10-02', noDeadline: false, format: 'later' })), /提交格式/);
});
test('saving confirmation does not silently add a schedule', () => {
  const state = confirmed();
  assert.equal(state.schedule, null);
  assert.equal(M.pending(state.review), 0);
});
test('an explicitly unknown deadline stays null, without an invented time', () => {
  const state = M.saveReview(M.fresh(), { deadline: '', noDeadline: true, format: 'Word' });
  assert.equal(M.addSchedule(state).schedule.deadline, null);
});
test('a valid date is preserved as a date, including leap years', () => {
  assert.equal(M.validDate('2028-02-29'), true);
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '10月2日', '2026-10-02T23:59:00']) assert.equal(M.validDate(value), false);
  assert.equal(M.addSchedule(confirmed()).schedule.deadline, '2026-10-02');
});
test('conflicting date and unknown flag are rejected', () => {
  assert.throws(() => M.saveReview(M.fresh(), { deadline: '2026-10-02', noDeadline: true, format: 'PDF' }), /不能同时/);
});
test('repeated confirmation updates one schedule and retains completion', () => {
  const state = M.addSchedule(confirmed());
  state.schedule.completed = true;
  const again = M.addSchedule(state);
  assert.deepEqual(again.schedule, state.schedule);
  assert.equal(again.schedule.id, 'course-report');
});
test('editing the review leaves the old schedule until explicit confirmation', () => {
  const old = M.addSchedule(confirmed());
  const edited = M.saveReview(old, { deadline: '2026-10-09', noDeadline: false, format: 'Word' });
  assert.equal(edited.schedule.deadline, '2026-10-02');
  assert.equal(M.changed(edited), true);
  const updated = M.addSchedule(edited);
  assert.equal(updated.schedule.deadline, '2026-10-09');
  assert.equal(updated.schedule.format, 'Word');
  assert.equal(M.changed(updated), false);
  assert.equal(old.review.format, 'PDF');
});
test('saved state survives serialization and reading', () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(key, value) { assert.equal(key, M.KEY); this.value = value; } };
  assert.deepEqual(M.read(storage), M.fresh());
  const state = M.addSchedule(confirmed());
  M.persist(storage, state);
  assert.deepEqual(M.read(storage), state);
});
test('corrupt or incompatible data is rejected without overwriting storage', () => {
  for (const raw of ['oops', '{}', JSON.stringify({ ...M.fresh(), version: 9 }), JSON.stringify({ ...M.fresh(), schedule: { id: 'wrong' } })]) {
    const storage = { getItem: () => raw, setItem: () => assert.fail('must not write during read') };
    assert.throws(() => M.read(storage));
  }
});
test('storage write failure is surfaced to the caller', () => {
  assert.throws(() => M.persist({ setItem() { throw new Error('QuotaExceededError'); } }, confirmed()), /QuotaExceededError/);
});
