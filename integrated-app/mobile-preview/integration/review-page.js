/* Dynamic task review inside the approved stationery shell. */
(function () {
  'use strict';
  const D = window.AnchorReviewData, shell = window.NoteShell;
  const api = window.AnchorReviewAPI.createClient(window.AnchorReviewConfig);
  const $ = selector => document.querySelector(selector);
  const DEMO_KEY = 'anchorlearn.connected-demo.v1';
  const PENDING_KEY = 'anchorlearn.pending-confirmation.v1';
  let active = false, mode = null, review = null, input = null, caseKey = null;
  let edits = [], answers = [], dirty = false, busy = false;
  let staged = null, pending = null, saved = null, backendTasks = [];

  function add(parent, tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    parent.append(el); return el;
  }
  function button(parent, text, action, className = 'secondary') {
    const el = add(parent, 'button', text, className); el.type = 'button';
    el.addEventListener('click', action); return el;
  }
  function dialog(id, title) {
    const el = add(document.body, 'dialog'); el.id = id;
    button(el, '×', () => el.close(), 'dialog-close icon-button').setAttribute('aria-label', '关闭' + title);
    const heading = add(el, 'h2', title); heading.id = id + '-title'; el.setAttribute('aria-labelledby', heading.id);
    return el;
  }
  function field(parent, label, id, type, value) {
    const caption = add(parent, 'label', label, 'connected-label'); caption.htmlFor = id;
    const el = add(parent, type === 'textarea' ? 'textarea' : 'input'); el.id = id;
    if (type !== 'textarea') el.type = type;
    el.value = value || ''; return el;
  }
  function dateText(value) { return value ? value.replaceAll('-', '/') + '（时间未说明）' : '尚无明确截止日期'; }
  function sourceLabel(value) { return value.kind === 'user-context' ? '用户补充说明' : '原文依据'; }
  const sourceDialog = dialog('connected-source-dialog', '对照本次原文');
  const sourceBody = add(sourceDialog, 'div', undefined, 'transcript');
  add(sourceDialog, 'p', '文字依据可核对；尚未关联音频时间片段，暂不提供定位回听。', 'quiet-note');
  button(sourceDialog, '返回便签', () => sourceDialog.close());
  function showSource() {
    sourceBody.replaceChildren(); add(sourceBody, 'p', input.text);
    if (input.context) { add(sourceBody, 'h3', '用户补充说明'); add(sourceBody, 'p', input.context); }
    sourceDialog.showModal();
  }
  function say(text, error = false) {
    const el = $('#connected-feedback');
    if (el) { el.textContent = text; el.dataset.error = String(error); }
  }
  function allowReplacement() {
    if (busy || pending) { shell.toast('先确认当前保存请求的结果，避免重复创建任务。', true); return false; }
    return !dirty || window.confirm('当前任务还有未保存的修改。确定放弃这些修改并载入另一份结果吗？');
  }

  function refreshStatus() {
    for (const id of ['original-title', 'original-metadata', 'original-content', 'original-actions', 'original-pending-heading', 'review-form', 'original-attention', 'original-attention-actions']) $('#' + id).hidden = active;
    for (const id of ['connected-title', 'connected-metadata', 'connected-content', 'connected-pending-heading', 'connected-review', 'connected-attention']) $('#' + id).hidden = !active;
    if (!active || !review) return;
    $('#connected-title').textContent = input.title;
    $('#connected-metadata').textContent = `${input.recordedDate} · 文字输入 · ${mode === 'demo' ? '接口示例' : '后端分析结果'}`;
    $('#pending-dot').hidden = Boolean(saved && !dirty) || (!review.questions.length && !review.tasks.length);
    $('#connected-note-card').hidden = false;
    $('#connected-note-title').textContent = input.title;
    $('#connected-note-summary').textContent = mode === 'demo' ? '接口示例 · 点击继续核对' : '本次分析 · 尚未关联音频';
  }

  function renderContent() {
    const box = $('#connected-content'); box.replaceChildren();
    add(box, 'p', review.summary, 'connected-summary');
    const points = add(box, 'ul', undefined, 'connected-points');
    review.keyPoints.forEach(point => add(points, 'li', point));
    const tasks = add(box, 'ul', undefined, 'ruled-list');
    review.tasks.forEach((task, index) => {
      const item = add(tasks, 'li'), edited = edits[index];
      add(item, 'h3', edited.title); add(item, 'p', '截止日期：' + dateText(edited.dueDate));
      if (edited.requirements) add(item, 'p', edited.requirements);
      add(item, 'small', 'AI 建议第一步：' + task.suggestion.text);
      const details = add(item, 'details'); add(details, 'summary', sourceLabel(task.source)); add(details, 'blockquote', task.source.quote);
    });
    if (!review.tasks.length) add(box, 'p', review.questions.length ? '任务归属尚未确定，先回答待确认问题。' : '本次没有明确待办，保留重点即可。', 'quiet-note');
    const actions = add(box, 'div', undefined, 'paper-actions');
    button(actions, '查看本次原文 ›', showSource, 'source-link');
    if (review.tasks.length || review.questions.length) button(actions, review.questions.length ? '查看待确认问题' : saved && !dirty ? '查看核对结果' : '核对任务', () => shell.selectTab('pending', true), 'primary');
    add(actions, 'p', mode === 'demo' ? '接口示例，不是模型实际提取结果。' : saved ? '任务已保存到后端；尚未安排日程或提醒。' : '分析草稿，尚未保存到后端。', 'action-caption');
  }
  function renderReview() {
    const box = $('#connected-review'); box.replaceChildren();
    const form = add(box, 'form'); form.id = 'connected-review-form';
    const fields = add(form, 'fieldset'); fields.className = 'connected-fields';
    fields.disabled = busy || Boolean(pending) || (mode === 'backend' && Boolean(saved));
    review.tasks.forEach((task, index) => {
      const row = add(fields, 'div', undefined, 'question');
      add(row, 'span', String(index + 1).padStart(2, '0'), 'question-number');
      const body = add(row, 'div');
      const title = field(body, `任务 ${index + 1} 名称`, `connected-task-${index}-title`, 'text', edits[index].title);
      title.required = true; title.maxLength = 200;
      const date = field(body, `任务 ${index + 1} 截止日期`, `connected-task-${index}-date`, 'date', edits[index].dueDate);
      date.min = '0001-01-01'; date.max = '9999-12-31';
      add(body, 'small', '没有明确日期可留空，不会自动补期限。');
      const requirements = field(body, `任务 ${index + 1} 要求（选填）`, `connected-task-${index}-requirements`, 'textarea', edits[index].requirements);
      requirements.maxLength = 4000; requirements.rows = 2;
      add(body, 'small', sourceLabel(task.source)); add(body, 'blockquote', task.source.quote);
      add(body, 'p', 'AI 建议第一步：' + task.suggestion.text, 'field-help');
      for (const el of [title, date, requirements]) el.addEventListener('input', () => {
        edits[index] = { clientTaskId: task.clientTaskId, title: title.value, dueDate: date.value || null, requirements: requirements.value };
        dirty = true; staged = null; say('修改尚未保存。'); renderContent(); refreshStatus();
      });
    });
    review.questions.forEach((question, index) => {
      const row = add(fields, 'div', undefined, 'question');
      add(row, 'span', '?', 'question-number'); const body = add(row, 'div');
      add(body, 'h3', question.question); add(body, 'blockquote', question.source.quote);
      add(body, 'small', sourceLabel(question.source));
      const answer = field(body, `问题 ${index + 1} 补充说明`, `connected-answer-${index}`, 'textarea', answers[index]); answer.maxLength = 1000; answer.rows = 2;
      answer.addEventListener('input', () => { answers[index] = answer.value; dirty = true; say('补充说明尚未重新分析，不能视为问题已解决。'); });
    });
    const feedback = add(form, 'p', '', 'feedback'); feedback.id = 'connected-feedback'; feedback.setAttribute('role', 'status');
    if (review.questions.length) {
      const action = button(form, '补充后重新分析', reanalyze, 'primary'); action.disabled = busy || mode === 'demo' || Boolean(pending);
      add(form, 'p', mode === 'demo' ? '这是待确认状态示例，不模拟回答后的模型推理。真实文字可从“录音”页提交分析。' : '回答会交给模型重新核对；不直接把不确定的任务当作已确认。', 'quiet-note');
    } else if (review.tasks.length) {
      const submit = add(form, 'button', mode === 'demo' ? '核对并保存示例' : saved ? '已保存到后端' : '核对并保存任务', 'primary'); submit.type = 'submit';
      submit.disabled = busy || Boolean(pending) || (mode === 'backend' && (!api.capabilities.confirm || Boolean(saved)));
      add(form, 'p', mode === 'demo' ? '仅保存示例到此浏览器；不排程，不发送提醒。' : api.capabilities.confirm ? '确认后保存任务，日程与提醒需后续接入。' : '后端保存未接通。可以核对和编辑，当前没有保存到服务器。', 'quiet-note');
    } else add(form, 'p', '没有需要保存的任务。', 'quiet-note');
    if (pending) {
      add(form, 'p', '上次保存结果尚未确认，编辑暂时锁定。请查询或原样重试，避免重复创建。', 'quiet-note');
      button(form, '原样重试保存', sendPending, 'primary').disabled = busy || !api.capabilities.confirm;
      button(form, '查询保存结果', readBackend).disabled = busy || !api.capabilities.readTasks;
    }
    form.addEventListener('submit', event => { event.preventDefault(); stageConfirmation(); });
  }
  function renderAttention() {
    const box = $('#connected-attention'); box.replaceChildren();
    const list = add(box, 'ul', undefined, 'ruled-list');
    for (const [title, text] of [
      ['按任务分别核对', '每项任务有自己的日期，空日期不表示即将截止。'],
      ['原话与建议分开', '原文依据保持只读；建议第一步是 AI 建议，可以按实际情况调整。'],
      ['保存不等于提醒', mode === 'demo' ? '此处是接口示例，保存仅在当前浏览器。' : '只有后端返回确认后才显示已保存；没有自动安排日程或通知。'],
    ]) { const item = add(list, 'li'); add(item, 'h3', title); add(item, 'p', text); }
  }
  function render() { refreshStatus(); renderContent(); renderReview(); renderAttention(); }
  function activate(next, details, nextMode) {
    review = next; input = details; mode = nextMode; active = true;
    edits = next.tasks.map(task => ({ clientTaskId: task.clientTaskId, title: task.title, dueDate: task.dueDate, requirements: task.requirements }));
    answers = next.questions.map(() => ''); dirty = false; saved = null; staged = null;
    render(); shell.selectTab('content'); shell.navigate('detail');
  }

  const confirmDialog = dialog('connected-confirm-dialog', '确认保存核对结果');
  const confirmationBody = add(confirmDialog, 'div');
  const confirmationError = add(confirmDialog, 'p', '', 'feedback'); confirmationError.setAttribute('role', 'alert');
  const confirmButton = button(confirmDialog, '确认保存', finishConfirmation, 'primary');
  button(confirmDialog, '再改一下', () => confirmDialog.close(), 'text-button');
  function stageConfirmation() {
    if (busy || pending || (mode === 'backend' && (saved || !api.capabilities.confirm))) return;
    try {
      staged = D.prepareConfirmation(review, edits, crypto.randomUUID());
      confirmationBody.replaceChildren();
      staged.tasks.forEach(task => { add(confirmationBody, 'h3', task.title); add(confirmationBody, 'p', dateText(task.due_date)); if (task.requirements) add(confirmationBody, 'p', task.requirements); });
      add(confirmationBody, 'p', mode === 'demo' ? '仅保存示例到此浏览器，不会加入日程或发送通知。' : '将这些任务保存到后端，尚不安排日程或提醒。', 'quiet-note');
      confirmationError.textContent = ''; confirmDialog.showModal();
    } catch (error) { say(error.message, true); }
  }
  function finishConfirmation() {
    if (!staged || busy) return;
    if (mode === 'demo') {
      try {
        const result = { request_id: staged.request_id, tasks: staged.tasks.map(task => ({ ...task, id: 'demo:' + task.client_task_id, status: 'confirmed' })) };
        const checked = D.validateConfirmation(result, staged);
        localStorage.setItem(DEMO_KEY, JSON.stringify({ caseKey, result }));
        saved = checked.tasks; dirty = false; confirmDialog.close(); render(); renderSaved();
        say('示例已保存到此浏览器，刷新后可重新读取。'); shell.toast('示例已保存，尚未安排日程');
      } catch { confirmationError.textContent = '本地保存失败，修改仍在页面上，请允许浏览器存储后重试。'; }
      return;
    }
    try {
      // Persist before sending so reload/retry reuses the exact request ID and body.
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ review, input, edits, snapshot: staged }));
      pending = staged; sendPending();
    } catch { confirmationError.textContent = '无法保留重试凭据，本次未发送保存请求。请允许此页面使用浏览器存储。'; }
  }
  async function sendPending() {
    if (!pending || busy || !api.capabilities.confirm) return;
    busy = true; confirmButton.disabled = true; renderReview();
    try {
      const result = await api.confirm(pending); settleSaved(result.tasks);
    } catch (error) {
      if (error.code === 'incompatible_backend') {
        pending = null;
        try { sessionStorage.removeItem(PENDING_KEY); } catch {}
      }
      confirmationError.textContent = error.message; renderReview(); say(error.message, true);
    } finally { busy = false; confirmButton.disabled = false; renderReview(); if (pending) say('保存结果未确认，请查询或原样重试。', true); }
  }
  function settleSaved(tasks) {
    saved = tasks; backendTasks = [...backendTasks.filter(old => !tasks.some(task => task.id === old.id)), ...tasks]; pending = null; staged = null; dirty = false;
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* The persisted request remains safe to retry with the same ID. */ }
    confirmDialog.close(); render(); renderSaved(); shell.toast('任务已保存到后端，尚未安排日程或提醒');
  }
  async function readBackend(navigate = true) {
    if (busy || !api.capabilities.readTasks) return;
    busy = true;
    try {
      const tasks = await api.readTasks(); backendTasks = tasks;
      if (pending) {
        const matched = tasks.filter(task => pending.tasks.some(sent => sent.client_task_id === task.client_task_id));
        const result = D.validateConfirmation({ request_id: pending.request_id, tasks: matched }, pending);
        settleSaved(result.tasks);
      }
      renderSaved(); if (navigate) shell.navigate('schedule');
    } catch (error) { shell.toast(pending ? '尚未查到完整匹配的保存结果，请保留原请求继续查询或重试。' : error.message, true); }
    finally { busy = false; if (review) renderReview(); }
  }

  const savedBox = add($('#schedule-view'), 'div'); savedBox.id = 'connected-saved';
  if (api.capabilities.readTasks) button($('#schedule-view'), '刷新已保存任务', () => readBackend());
  function renderSaved() {
    savedBox.replaceChildren();
    const groups = [];
    try {
      const data = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
      if (data) groups.push({ label: '已核对任务 · 本地示例', tasks: D.validateSavedTasks(data.result.tasks) });
    } catch { add(savedBox, 'p', '多任务示例记录无法读取，原存储未改动。', 'quiet-note'); }
    if (backendTasks.length) groups.push({ label: '已核对任务 · 后端记录', tasks: backendTasks });
    groups.forEach(group => {
      add(savedBox, 'h2', group.label); add(savedBox, 'p', '这些任务尚未生成建议日程或提醒。', 'quiet-note');
      group.tasks.forEach(task => { const card = add(savedBox, 'article', undefined, 'schedule-card'); add(card, 'h3', task.title); add(card, 'p', dateText(task.due_date)); if (task.requirements) add(card, 'p', task.requirements); add(card, 'small', 'AI 建议第一步：' + task.first_step); });
    });
  }

  const analysisDialog = dialog('connected-analysis-dialog', '整理一段文字');
  const analysisForm = add(analysisDialog, 'form');
  const analysisFields = add(analysisForm, 'fieldset'); analysisFields.className = 'connected-fields';
  const linkInput = field(analysisFields, '飞书文档链接（可选）', 'connected-feishu-url', 'url', '');
  linkInput.placeholder = 'https://组织.feishu.cn/docx/…';
  const importButton = button(analysisFields, '读取飞书正文', async () => {
    if (busy) return;
    if (textInput.value.trim() && !window.confirm('读取成功后将替换当前输入文字，继续吗？')) return;
    busy = true; analysisFields.disabled = true; analyzeButton.disabled = true;
    analysisFeedback.textContent = '正在读取飞书正文…';
    try {
      const response = await fetch('/api/import/feishu', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: linkInput.value.trim()}), signal: AbortSignal.timeout(70000)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '读取失败');
      if (typeof result.text !== 'string') throw new Error('正文格式不正确');
      textInput.value = result.text;
      analysisFeedback.textContent = `已导入 ${result.text.length} 字。请核对正文、录音日期，再点击提炼。`;
      textInput.focus();
    } catch (error) {
      analysisFeedback.textContent = (error.message || '读取失败') + '，原输入保留。';
    } finally {
      busy = false; analysisFields.disabled = false; analyzeButton.disabled = false;
    }
  });
  add(analysisFields, 'p', '支持已授权的飞书新版文档。读取后先预览，不会自动发送给模型。当前上限 12000 字。', 'quiet-note');
  const titleInput = field(analysisFields, '便签标题', 'connected-input-title', 'text', '本次学习记录'); titleInput.maxLength = 100; titleInput.required = true;
  const textInput = field(analysisFields, '录音文字', 'connected-input-text', 'textarea', ''); textInput.rows = 6; textInput.required = true; textInput.maxLength = 12000;
  const today = new Date(); const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const dateInput = field(analysisFields, '实际录音日期', 'connected-input-date', 'date', todayString); dateInput.required = true; dateInput.min = '0001-01-01'; dateInput.max = '9999-12-31';
  const contextInput = field(analysisFields, '身份或补充说明（选填）', 'connected-input-context', 'textarea', ''); contextInput.rows = 2; contextInput.maxLength = 2000;
  add(analysisForm, 'p', '点击后，文字及补充说明会经后端发送给 DeepSeek，可能产生 API 费用。仅接通 B 的服务后可用。', 'quiet-note');
  const analysisFeedback = add(analysisForm, 'p', '', 'feedback'); analysisFeedback.setAttribute('role', 'status');
  const analyzeButton = add(analysisForm, 'button', '提炼重点与任务', 'primary'); analyzeButton.type = 'submit';
  analysisForm.addEventListener('submit', event => {
    event.preventDefault(); if (!allowReplacement()) return;
    analyze({ title: titleInput.value.trim(), text: textInput.value, recordedDate: dateInput.value, context: contextInput.value });
  });
  async function analyze(details) {
    if (busy) return;
    busy = true; analysisFields.disabled = true; analyzeButton.disabled = true; analysisFeedback.textContent = '正在分析，请保持页面打开…';
    try {
      const next = await api.analyze({ ...details, reviewId: crypto.randomUUID() });
      caseKey = null; activate(next, details, 'backend'); analysisDialog.close();
    } catch (error) {
      analysisFeedback.textContent = error.message + ' 本次未生成新结果，原内容和修改仍保留。';
      analysisFeedback.dataset.error = 'true'; say(error.message, true);
    } finally { busy = false; analysisFields.disabled = false; analyzeButton.disabled = false; if (review) renderReview(); }
  }
  function reanalyze() {
    if (mode !== 'backend' || busy || pending) return;
    if (!answers.some(answer => answer.trim())) { say('请先填写需要补充的信息。', true); return; }
    if (!allowReplacement()) return;
    const explanation = review.questions.map((question, i) => answers[i].trim() ? `${question.question}\n用户回答：${answers[i].trim()}` : '').filter(Boolean).join('\n');
    titleInput.value = input.title; textInput.value = input.text; dateInput.value = input.recordedDate;
    contextInput.value = [input.context, explanation].filter(Boolean).join('\n');
    analysisDialog.showModal();
    analyze({ ...input, context: contextInput.value });
  }

  function loadExample(key, stored = null) {
    if (!allowReplacement()) return;
    const example = window.AnchorReviewExamples[key];
    if (!example) throw new Error('未知示例。');
    const next = D.fromAnalysis(example.result, { reviewId: 'demo-' + key, sourceText: example.text });
    caseKey = key; activate(next, { title: example.title, text: example.text, recordedDate: example.date, context: '' }, 'demo');
    if (stored) {
      const tasks = D.validateSavedTasks(stored.tasks);
      const patches = tasks.map(task => ({ clientTaskId: task.client_task_id, title: task.title, dueDate: task.due_date, requirements: task.requirements }));
      const snapshot = D.prepareConfirmation(next, patches, stored.request_id);
      saved = D.validateConfirmation(stored, snapshot).tasks;
      edits = next.tasks.map(task => patches.find(patch => patch.clientTaskId === task.clientTaskId)); render();
    }
  }
  button($('#home-view'), '导入飞书 / 整理文字', () => { if (!busy && !pending) analysisDialog.showModal(); else shell.toast('请先处理当前保存请求。', true); });
  const noteCard = button($('#home-view'), '', () => { if (!review) return; active = true; render(); shell.navigate('detail'); }, 'record-card');
  noteCard.id = 'connected-note-card'; noteCard.hidden = true;
  const noteText = add(noteCard, 'span'); add(noteText, 'strong').id = 'connected-note-title'; add(noteText, 'small').id = 'connected-note-summary';
  const tools = add($('#profile-view'), 'article', undefined, 'about-paper');
  add(tools, 'h2', '核对不同的内容');
  add(tools, 'p', '以下都是明确标注的接口示例，用来体验多项任务和不同核对状态。');
  const demoButtons = add(tools, 'div', undefined, 'connected-demo-buttons');
  for (const [key, label] of [['multiple', '三项任务示例'], ['ambiguous', '归属待确认示例'], ['empty', '无任务示例']]) button(demoButtons, label, () => loadExample(key));
  const readButton = button(tools, '读取后端已保存任务', readBackend); readButton.disabled = !api.capabilities.readTasks;
  add(tools, 'p', api.capabilities.confirm && api.capabilities.readTasks ? '已配置保存与读取接口；保存结果以服务返回为准。示例与后端记录分别展示。' : '真实保存和读取接口当前未完整配置，接通后再启用。不会把示例存储当作后端数据。', 'quiet-note');
  for (const el of document.querySelectorAll('#home-view .record-card[data-view], #view-new-task, #schedule-view [data-view="detail"]')) el.addEventListener('click', () => { active = false; refreshStatus(); shell.selectTab('content'); shell.navigate('detail'); });
  window.addEventListener('beforeunload', event => { if (dirty || pending) { event.preventDefault(); event.returnValue = ''; } });
  window.AnchorReviewPage = Object.freeze({ refreshStatus });

  try {
    const record = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (record) {
      const raw = { reading_card: record.review.summary, key_points: record.review.keyPoints, tasks: record.review.tasks.map(task => ({ title: task.title, due_date: task.dueDate, source_quote: task.source.quote, first_step: task.suggestion.text })), clarifications: [], status: 'draft', needs_confirmation: true };
      const restored = D.fromAnalysis(raw, { reviewId: record.review.reviewId, recordingId: record.review.recordingId, sourceText: record.input.text, userContext: record.input.context });
      const expected = D.prepareConfirmation(restored, record.edits, record.snapshot.request_id);
      // Before review-v1, the disabled integration prepared snapshots without this flag.
      const snapshot = { ...record.snapshot };
      if (snapshot.confirmed === undefined) snapshot.confirmed = true;
      if (Object.keys(expected).some(key => JSON.stringify(expected[key]) !== JSON.stringify(snapshot[key])) || Object.keys(snapshot).length !== Object.keys(expected).length) throw new Error('保存凭据不匹配');
      activate(restored, record.input, 'backend'); edits = record.edits; pending = expected; render(); shell.selectTab('pending');
    } else {
      const stored = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
      if (stored) loadExample(stored.caseKey, stored.result);
    }
  } catch { shell.toast('之前的核对记录无法恢复，原记录未覆盖。请核查后再继续。', true); }
  renderSaved();
  if (api.capabilities.readTasks) readBackend(false);
})();
