/* Backend-independent review data. No DOM, storage, or automatic confirmation. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  function required(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空。`);
    return value;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function deadline(value) {
    if (value === null || value === '') return null;
    if (!validDate(value)) throw new Error('截止日期应为有效的 YYYY-MM-DD 日期，未明确时留空。');
    return value;
  }
  function evidence(quote, sourceText) {
    required(quote, '原话依据');
    if (!sourceText.includes(quote)) throw new Error('原话依据与本次输入不匹配，请重新分析或核对原文。');
    return quote;
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  // IDs below identify drafts in this page, never persisted backend tasks.
  function fromAnalysis(result, { reviewId, recordingId = null, sourceText, userContext = '' }) {
    required(reviewId, '草稿编号');
    required(sourceText, '分析原文');
    if (recordingId !== null) required(recordingId, '录音编号');
    if (typeof userContext !== 'string') throw new Error('补充说明格式不正确。');
    if (!result || !Array.isArray(result.tasks) || !Array.isArray(result.clarifications) ||
        !Array.isArray(result.key_points) || !result.key_points.length) throw new Error('分析结果格式不正确。');
    required(result.reading_card, '录音摘要');
    result.key_points.forEach(point => required(point, '重点'));
    const expectedStatus = result.clarifications.length ? 'needs_clarification' : result.tasks.length ? 'draft' : 'no_tasks';
    if (result.status !== expectedStatus || result.needs_confirmation !== Boolean(result.tasks.length || result.clarifications.length)) {
      throw new Error('分析结果状态与任务不一致，请重试。');
    }
    // Context is not presented as a quote from the teacher/recording.
    const input = sourceText + (userContext.trim() ? '\n用户说明：' + userContext.trim() : '');
    const source = quote => ({
      quote: evidence(quote, input),
      kind: sourceText.includes(quote) ? 'transcript' : 'user-context',
      start: null, end: null, // No invented audio offsets from the language model.
    });
    return freeze({
      reviewId, recordingId, status: expectedStatus,
      summary: result.reading_card,
      keyPoints: [...result.key_points],
      tasks: result.tasks.map((task, index) => {
        if (!task || typeof task !== 'object') throw new Error('任务格式不正确。');
        const dueDate = deadline(task.due_date);
        return {
          clientTaskId: `${reviewId}:task:${index + 1}`,
          title: required(task.title, '任务名称'),
          dueDate,
          requirements: '', // B currently supplies no separate requirements field.
          source: source(task.source_quote),
          suggestion: { text: required(task.first_step, '建议第一步'), isAI: true },
        };
      }),
      questions: result.clarifications.map((question, index) => {
        if (!question || typeof question !== 'object') throw new Error('待确认问题格式不正确。');
        return { id: `${reviewId}:question:${index + 1}`, question: required(question.question, '待确认问题'), source: source(question.source_quote) };
      }),
    });
  }

  // Called only from an explicit confirm action. Editing never saves or schedules.
  // patches may change editable fields only; source/suggestion/IDs stay immutable.
  function prepareConfirmation(review, patches, requestId) {
    required(requestId, '保存请求编号');
    if (review.questions.length) throw new Error('请先补充待确认问题并重新分析，再确认保存。');
    if (!review.tasks.length) throw new Error('本次没有可保存的任务。');
    if (review.tasks.length > 3) throw new Error('当前后端一次最多保存三项任务。');
    if (!Array.isArray(patches)) throw new Error('任务修改格式不正确。');
    const edits = new Map();
    for (const patch of patches) {
      if (!patch || !review.tasks.some(task => task.clientTaskId === patch.clientTaskId)) throw new Error('修改对应的任务不存在。');
      if (edits.has(patch.clientTaskId)) throw new Error('同一任务不能重复提交修改。');
      if (Object.keys(patch).some(key => !['clientTaskId', 'title', 'dueDate', 'requirements'].includes(key))) {
        throw new Error('只能修改任务名称、截止日期和要求，不能修改原话或任务编号。');
      }
      edits.set(patch.clientTaskId, patch);
    }
    return freeze({
      request_id: requestId, confirmed: true, review_id: review.reviewId, recording_id: review.recordingId,
      tasks: review.tasks.map(task => {
        const edited = { ...task, ...edits.get(task.clientTaskId) };
        const title = required(edited.title, '任务名称').trim();
        if (title.length > 200 || typeof edited.requirements !== 'string' || edited.requirements.length > 4000) {
          throw new Error('任务名称限 200 字，补充要求限 4000 字。');
        }
        return {
          client_task_id: task.clientTaskId, title, due_date: deadline(edited.dueDate),
          requirements: edited.requirements.trim(),
          source_quote: task.source.quote, source_kind: task.source.kind,
          first_step: task.suggestion.text,
        };
      }),
    });
  }

  function validateSavedTasks(tasks, { allowLegacy = false } = {}) {
    if (!Array.isArray(tasks)) throw new Error('后端任务列表格式不正确。');
    tasks = copy(tasks);
    const ids = new Set();
    const clients = new Set();
    for (const task of tasks) {
      if (!task || typeof task !== 'object') throw new Error('后端任务记录无效。');
      required(task.id, '正式任务编号');
      const legacy = allowLegacy && task.status === 'pending' &&
        !['client_task_id', 'requirements', 'source_kind', 'review_id'].some(key => key in task);
      if (legacy) Object.assign(task, { client_task_id: null, requirements: '', source_kind: 'unknown' });
      else required(task.client_task_id, '原草稿任务编号');
      required(task.title, '任务名称');
      required(task.source_quote, '原话依据');
      required(task.first_step, '建议第一步');
      if (typeof task.requirements !== 'string' || (!legacy && !['transcript', 'user-context'].includes(task.source_kind)) ||
          !(task.due_date === null || validDate(task.due_date)) || !['pending', 'confirmed'].includes(task.status) ||
          ids.has(task.id) || (!legacy && clients.has(task.client_task_id))) throw new Error('后端任务记录无效或重复。');
      ids.add(task.id); if (!legacy) clients.add(task.client_task_id);
    }
    return copy(tasks);
  }
  function validateConfirmation(result, snapshot) {
    if (!result || result.request_id !== snapshot.request_id) throw new Error('保存返回与本次请求不匹配，请查询后确认。');
    const tasks = validateSavedTasks(result.tasks);
    if (tasks.length !== snapshot.tasks.length) throw new Error('后端未返回全部任务，请查询保存结果，勿显示全部成功。');
    for (const sent of snapshot.tasks) {
      const saved = tasks.find(task => task.client_task_id === sent.client_task_id);
      if (!saved || Object.keys(sent).some(key => saved[key] !== sent[key])) {
        throw new Error('保存结果与核对内容不一致，请查询后确认。');
      }
    }
    return { requestId: result.request_id, tasks };
  }
  const api = { validDate, fromAnalysis, prepareConfirmation, validateSavedTasks, validateConfirmation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnchorReviewData = api;
})(typeof window !== 'undefined' ? window : globalThis);
