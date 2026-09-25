/* Pure local-demo state. Backend integration replaces storage, not confirmation rules. */
(function (root) {
  'use strict';
  const KEY = 'anchorlearn.stationery.v1';
  const FORMATS = ['', 'PDF', 'Word', 'later'];
  const fresh = () => ({ version: 1, review: { deadline: '', noDeadline: false, format: '' }, schedule: null, attentionRead: false });
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function validateReview(r) {
    if (!r || typeof r.noDeadline !== 'boolean' || typeof r.deadline !== 'string' || !FORMATS.includes(r.format)) throw new Error('核对信息格式不正确。');
    if (r.deadline && !validDate(r.deadline)) throw new Error('请选择有效的截止日期。');
    if (r.noDeadline && r.deadline) throw new Error('“尚无明确日期”不能同时填写截止日期。');
    return { deadline: r.deadline, noDeadline: r.noDeadline, format: r.format };
  }
  function pending(r) { return Number(!r.deadline && !r.noDeadline) + Number(!r.format || r.format === 'later'); }
  function saveReview(state, review) { return { ...state, review: validateReview(review) }; }
  function addSchedule(state) {
    const r = validateReview(state.review);
    if (!r.deadline && !r.noDeadline) throw new Error('请先核对截止日期，或选择“尚无明确日期”。');
    if (!r.format || r.format === 'later') throw new Error('请先确认提交格式，再加入日程。');
    return { ...state, schedule: { id: 'course-report', deadline: r.deadline || null, format: r.format, completed: state.schedule?.completed || false } };
  }
  function changed(state) {
    return Boolean(state.schedule && (state.schedule.deadline !== (state.review.deadline || null) || state.schedule.format !== state.review.format));
  }
  function read(storage) {
    const raw = storage.getItem(KEY); if (!raw) return fresh();
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || typeof v.attentionRead !== 'boolean') throw new Error('无法读取保存的演示记录。');
    const review = validateReview(v.review);
    let schedule = null;
    if (v.schedule !== null) {
      const s = v.schedule;
      if (!s || s.id !== 'course-report' || !['PDF','Word'].includes(s.format) || typeof s.completed !== 'boolean' || !(s.deadline === null || validDate(s.deadline))) throw new Error('日程记录无效。');
      schedule = { id: s.id, deadline: s.deadline, format: s.format, completed: s.completed };
    }
    return { version: 1, review, schedule, attentionRead: v.attentionRead };
  }
  function persist(storage, next) { storage.setItem(KEY, JSON.stringify(next)); return next; }
  const api = { KEY, fresh, validDate, validateReview, pending, saveReview, addSchedule, changed, read, persist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NoteModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
