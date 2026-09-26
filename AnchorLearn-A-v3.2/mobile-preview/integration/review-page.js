/* Dynamic task review inside the approved stationery shell. */
(function () {
  'use strict';
  const D = window.AnchorReviewData, shell = window.NoteShell;
  const api = window.AnchorReviewAPI.createClient(window.AnchorReviewConfig);
  const $ = selector => document.querySelector(selector);
  const DEMO_KEY = 'anchorlearn.connected-demo.v1';
  const PENDING_KEY = 'anchorlearn.pending-confirmation.v1';
  const openRecordingOnLoad = location.hash === '#recording';
  const openReadingOnLoad = location.hash === '#reading';
  let readingHighlight = true;
  let readingMode = 'grammar';
  let selectedAudio = null, audioUrl = null, transcribedFile = null;
  let active = false, mode = null, review = null, input = null, caseKey = null;
  let edits = [], answers = [], dirty = false, busy = false;
  let staged = null, pending = null, saved = null, backendTasks = [];
  const taskDisclosures = new Map();
  const summaryReadings = new WeakMap();

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
  function analysisTopics() { return review ? [...review.keyPoints, review.summary] : []; }
  function grammarContext() { return review ? { text: review.readingText, annotations: review.readingAnnotations } : null; }
  function readingSelector(parent) {
    const label = add(parent, 'label', undefined, 'reading-mode');
    add(label, 'span', '阅读方式');
    const select = add(label, 'select');
    for (const [value, text] of [['focus', '简洁重点'], ['grammar', '主谓宾 · 少量']]) {
      const option = add(select, 'option', text); option.value = value;
    }
    select.value = readingMode;
    select.addEventListener('change', () => {
      readingMode = select.value;
      document.querySelectorAll('.reading-sample').forEach(el => el.dispatchEvent(new Event('reading-change')));
    });
    return select;
  }
  function renderSource(parent, source, topics = [], grammar = null) {
    const example = window.AnchorReviewExamples.focus;
    const manual = mode === 'demo' && caseKey === 'focus' && source.kind === 'transcript' &&
      source.quote === example.text && example.readingParts.map(part => part.text).join('') === source.quote;
    const grammatical = grammar && D.grammarParts(source.quote, grammar.annotations, grammar.text);
    const focus = D.focusParts(source.quote, topics);
    const box = add(parent, 'div', undefined, 'reading-sample');
    const caption = add(box, 'p', '', 'reading-caption');
    const select = readingSelector(box);
    const label = add(box, 'label', undefined, 'reading-toggle');
    const toggle = add(label, 'input'); toggle.type = 'checkbox'; toggle.checked = readingHighlight;
    add(label, 'span', '重点高亮');
    const legend = add(box, 'div', undefined, 'reading-legend');
    for (const [role, caption] of [['who', '主语'], ['action', '谓语'], ['object', '宾语']]) {
      add(legend, 'span', caption, 'reading-' + role);
    }
    const quote = add(box, 'blockquote', undefined, 'reading-quote');
    const note = add(box, 'p', undefined, 'reading-caption');
    function paint() {
      const compact = readingMode === 'focus';
      const parts = compact ? focus : D.sparseGrammarParts(source.quote, manual ? example.readingParts : grammatical);
      caption.textContent = compact ? '简洁重点 · 少量阅读提示' : manual ? '阅读小样 · 示例人工标注' : grammatical ? '少量主谓宾 · 每处最多 5 字' : '暂无主谓宾标注';
      select.value = readingMode; box.dataset.readingMode = readingMode;
      quote.replaceChildren(); legend.hidden = !readingHighlight || compact || (!grammatical && !manual);
      toggle.checked = readingHighlight;
      if (!readingHighlight) quote.textContent = source.quote;
      else for (const part of parts) {
        if (!part.role) quote.append(document.createTextNode(part.text));
        else {
          const word = add(quote, 'span', part.text, 'reading-' + part.role);
          const names = { who: '人物或群体词', action: '行动词', object: '内容词', focus: '本次分析重点中也出现的原文词组', when: '时间表达，不一定是截止日期', exception: '否定或不确定表达', change: '变更表达，请对照上下文' };
          word.title = compact ? '阅读提示，请结合整句理解' : grammatical ? { who: 'AI 识别的主语', action: 'AI 识别的谓语（保留否定）', object: 'AI 识别的宾语' }[part.role] : names[part.role];
        }
      }
      note.textContent = !readingHighlight ? '已恢复普通文字，原文内容没有改变。' : compact ? '只提示少量关键词，未强调的内容也可能重要；文字保持完整。' : manual ? '人工示例也遵守每处 5 字与少量标注限制；不是模型实际提取结果。' : grammatical ? '每句最多 3 处，不凑齐主谓宾；AI 判断可能有误，请结合整句核对。' : '尚无可用的语法标注，可切回简洁重点。';
    }
    toggle.addEventListener('change', () => {
      readingHighlight = toggle.checked;
      // Keep the content and review copies consistent without rebuilding editable fields.
      document.querySelectorAll('.reading-sample').forEach(el => el.dispatchEvent(new Event('reading-change')));
    });
    box.addEventListener('reading-change', paint); paint();
    return box;
  }
  const sourceDialog = dialog('connected-source-dialog', '对照本次原文');
  const sourceBody = add(sourceDialog, 'div', undefined, 'transcript');
  const sourceHint = add(sourceDialog, 'p', '', 'quiet-note');
  button(sourceDialog, '返回便签', () => sourceDialog.close());
  function showSource() {
    sourceBody.replaceChildren(); renderSource(sourceBody, { quote: input.text, kind: 'transcript' }, analysisTopics(), grammarContext());
    if (input.context) { add(sourceBody, 'h3', '用户补充说明'); renderSource(sourceBody, { quote: input.context, kind: 'user-context' }, analysisTopics(), grammarContext()); }
    sourceHint.textContent = input.audioName ? '依据来自已校对的转写文字。录音可在导入页回听，暂不支持按任务定位音频；刷新后需重新选择录音。' : '当前依据为文字输入，未关联录音。';
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
    $('#connected-metadata').textContent = `${input.recordedDate} · ${input.audioName ? '录音转写' : '文字输入'} · ${mode === 'demo' ? '接口示例' : '后端分析结果'}`;
    $('#pending-dot').hidden = Boolean(saved && !dirty) || (!review.questions.length && !review.tasks.length);
    $('#connected-note-card').hidden = false;
    $('#connected-note-title').textContent = input.title;
    $('#connected-note-summary').textContent = mode === 'demo' ? '接口示例 · 点击继续核对' : input.audioName ? '本次录音 · 点击核对任务' : '本次分析 · 文字输入';
  }

  function renderSummary(parent) {
    const current = review;
    const box = add(parent, 'div', undefined, 'reading-sample summary-reading');
    const status = add(box, 'p', '', 'reading-caption'); status.setAttribute('role', 'status');
    const select = readingSelector(box);
    const label = add(box, 'label', undefined, 'reading-toggle');
    const toggle = add(label, 'input'); toggle.type = 'checkbox'; toggle.checked = readingHighlight;
    toggle.setAttribute('aria-label', '摘要重点高亮'); add(label, 'span', '重点高亮');
    const legend = add(box, 'div', undefined, 'reading-legend');
    for (const [role, caption] of [['who', '主语'], ['action', '谓语'], ['object', '宾语']]) add(legend, 'span', caption, 'reading-' + role);
    const summary = add(box, 'p', undefined, 'connected-summary');
    const points = add(box, 'ul', undefined, 'connected-points');
    const nodes = [summary, ...current.keyPoints.map(() => add(points, 'li'))];
    const texts = [current.summary, ...current.keyPoints];
    const focusSections = texts.map(text => D.focusParts(text, current.keyPoints));
    const retry = button(box, '重试摘要标注', () => { summaryReadings.delete(current); start(); }, 'text-button');
    function paint() {
      const compact = readingMode === 'focus';
      const state = summaryReadings.get(current);
      const ready = state?.status === 'ready';
      const missingSummary = ready && !state.sections[0].some(part => part.role);
      select.value = readingMode; box.dataset.readingMode = readingMode;
      toggle.checked = readingHighlight; legend.hidden = !readingHighlight || !ready || compact;
      retry.hidden = compact || state?.status !== 'error';
      status.textContent = !readingHighlight ? '已关闭高亮，摘要和重点保持不变。' : compact ? '简洁重点 · 少量阅读提示' : mode === 'demo' ? '示例摘要 · 未调用 AI 标注' :
        state?.status === 'error' ? '摘要标注暂不可用，文字已保留；可重试。' :
        !ready ? '正在识别摘要与重点的主谓宾…' :
        missingSummary ? '只标合适的短词；本段摘要暂不标色。' :
        readingHighlight ? '少量主谓宾 · 每处最多 5 字' : '已关闭高亮，摘要和重点保持不变。';
      nodes.forEach((node, index) => {
        node.replaceChildren();
        if ((!compact && !ready) || !readingHighlight) node.textContent = texts[index];
        else for (const part of compact ? focusSections[index] : state.sections[index]) {
          if (!part.role) node.append(document.createTextNode(part.text));
          else {
            const word = add(node, 'span', part.text, 'reading-' + part.role);
            word.title = compact ? '阅读提示，请结合整句理解' : { who: 'AI 识别的主语', action: 'AI 识别的谓语（保留否定）', object: 'AI 识别的宾语' }[part.role];
          }
        }
      });
    }
    function start() {
      if (readingMode !== 'grammar' || !readingHighlight || mode !== 'backend' || summaryReadings.has(current)) { paint(); return; }
      const state = { status: 'loading' };
      summaryReadings.set(current, state); paint();
      api.annotateSummary({ summary: current.summary, keyPoints: current.keyPoints, recordedDate: input.recordedDate })
        .then(sections => { state.status = 'ready'; state.sections = sections.map((parts, i) => D.sparseGrammarParts(texts[i], parts)); })
        .catch(() => { state.status = 'error'; })
        .finally(() => {
          // A late result must not repaint a different recording or rebuild task inputs.
          if (review === current) document.querySelectorAll('.summary-reading').forEach(el => el.dispatchEvent(new Event('reading-change')));
        });
    }
    toggle.addEventListener('change', () => {
      readingHighlight = toggle.checked;
      document.querySelectorAll('.reading-sample').forEach(el => el.dispatchEvent(new Event('reading-change')));
    });
    box.addEventListener('reading-change', start); start();
  }

  function renderContent() {
    const box = $('#connected-content'); box.replaceChildren();
    renderSummary(box);
    if (review.tasks.length) add(box, 'p', '点一下小黄点，看看任务详情', 'task-disclosure-hint');
    const tasks = add(box, 'ul', undefined, 'ruled-list');
    review.tasks.forEach((task, index) => {
      const item = add(tasks, 'li'), edited = edits[index];
      add(item, 'h3', edited.title); add(item, 'p', '截止日期：' + dateText(edited.dueDate));
      if (edited.requirements) add(item, 'p', edited.requirements);
      add(item, 'small', 'AI 建议第一步：' + task.suggestion.text);
      const details = add(item, 'details'); add(details, 'summary', sourceLabel(task.source)); renderSource(details, task.source, analysisTopics(), grammarContext());
      if (mode === 'demo' && caseKey === 'focus') details.open = true;
      const state = taskDisclosures.get(task.clientTaskId) || { open: false };
      taskDisclosures.set(task.clientTaskId, state);
      window.NoteDisclosure.enhance(item, { id: 'connected-task-details-' + index, state });
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
    const fieldsLocked = busy || Boolean(pending) || (mode === 'backend' && Boolean(saved));
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
      for (const el of [title, date, requirements]) el.disabled = fieldsLocked;
      add(body, 'small', sourceLabel(task.source)); renderSource(body, task.source, analysisTopics(), grammarContext());
      add(body, 'p', 'AI 建议第一步：' + task.suggestion.text, 'field-help');
      for (const el of [title, date, requirements]) el.addEventListener('input', () => {
        edits[index] = { clientTaskId: task.clientTaskId, title: title.value, dueDate: date.value || null, requirements: requirements.value };
        dirty = true; staged = null; say('修改尚未保存。'); renderContent(); refreshStatus();
      });
    });
    review.questions.forEach((question, index) => {
      const row = add(fields, 'div', undefined, 'question');
      add(row, 'span', '?', 'question-number'); const body = add(row, 'div');
      add(body, 'h3', question.question); renderSource(body, question.source, analysisTopics(), grammarContext());
      add(body, 'small', sourceLabel(question.source));
      const answer = field(body, `问题 ${index + 1} 补充说明`, `connected-answer-${index}`, 'textarea', answers[index]); answer.maxLength = 1000; answer.rows = 2;
      answer.disabled = fieldsLocked;
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
    taskDisclosures.clear();
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
      group.tasks.forEach(task => {
        const card = add(savedBox, 'article', undefined, 'schedule-card'); add(card, 'h3', task.title);
        add(card, 'p', dateText(task.due_date)); if (task.requirements) add(card, 'p', task.requirements);
        add(card, 'small', 'AI 建议第一步：' + task.first_step);
        const source = add(card, 'details'); add(source, 'summary', task.source_kind === 'user-context' ? '用户补充说明' : '原文依据');
        renderSource(source, { quote: task.source_quote, kind: task.source_kind }, [task.title, task.requirements]);
      });
    });
  }

  const analysisDialog = dialog('connected-analysis-dialog', '从录音整理任务');
  const analysisForm = add(analysisDialog, 'form');
  const analysisFields = add(analysisForm, 'fieldset'); analysisFields.className = 'connected-fields';
  const connectionFeedback = add(analysisFields, 'p', '正在检查服务…', 'quiet-note');
  connectionFeedback.setAttribute('role', 'status');
  const settings = add(analysisFields, 'details'); settings.hidden = !api.capabilities.configure;
  add(settings, 'summary', '配置 DeepSeek API Key');
  const keyInput = field(settings, 'DeepSeek API Key（仅本次运行有效）', 'connected-api-key', 'password', '');
  keyInput.autocomplete = 'off'; keyInput.spellcheck = false; keyInput.maxLength = 512;
  add(settings, 'p', '密钥只交给本机服务验证，保留在运行内存中；关闭服务后需重新输入，不写入浏览器存储。', 'quiet-note');
  const keyFeedback = add(settings, 'p', '', 'feedback'); keyFeedback.setAttribute('role', 'status');
  const keyButton = button(settings, '验证并连接', async () => {
    if (busy) return;
    let candidate = keyInput.value.trim(); keyInput.value = '';
    if (!candidate) { keyFeedback.textContent = '请先填写完整密钥。'; return; }
    busy = true; analysisFields.disabled = true; analyzeButton.disabled = true;
    keyFeedback.textContent = '正在验证…';
    try { await api.configureKey(candidate); keyFeedback.textContent = '验证通过，可以提取任务了。'; settings.open = false; await refreshConnection(); }
    catch (error) { keyFeedback.textContent = error.message; }
    finally { candidate = ''; busy = false; analysisFields.disabled = false; analyzeButton.disabled = false; }
  });
  async function refreshConnection() {
    if (!api.capabilities.transcribe && !api.capabilities.configure) { connectionFeedback.textContent = '离线示例不连接录音和 AI 服务。'; return; }
    try {
      const health = await api.health();
      connectionFeedback.textContent = `录音转文字：${health.audio?.ready ? '准备就绪' : '环境尚未准备好'}；AI 分析：${health.key_configured ? '已配置密钥' : '请先配置密钥'}。`;
      settings.open = !health.key_configured;
      transcribeButton.disabled = !health.audio?.ready;
    } catch (error) { connectionFeedback.textContent = error.message; }
  }
  button(analysisFields, '重新检查连接', refreshConnection);
  add(analysisFields, 'h3', '1. 选择录音');
  const audioInput = field(analysisFields, '录音文件（最多25 MB、10分钟）', 'connected-audio-file', 'file', '');
  audioInput.accept = '.wav,.mp3,.m4a,.mp4,.aac,.ogg,.flac,.webm'; audioInput.disabled = !api.capabilities.transcribe;
  const player = add(analysisFields, 'audio'); player.controls = true; player.preload = 'metadata'; player.hidden = true;
  const audioFeedback = add(analysisFields, 'p', '', 'feedback'); audioFeedback.setAttribute('role', 'status');
  add(analysisFields, 'p', '录音在这台电脑上转写，不上传到 DeepSeek。先用30秒至2分钟的清晰录音测试。', 'quiet-note');
  audioInput.addEventListener('change', () => {
    selectedAudio = audioInput.files[0] || null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = selectedAudio ? URL.createObjectURL(selectedAudio) : null;
    if (audioUrl) player.src = audioUrl; else player.removeAttribute('src');
    player.hidden = !audioUrl;
    audioFeedback.textContent = selectedAudio ? '录音已选择；点击“转成文字”后再校对。已有文字尚未覆盖。' : '';
  });
  const transcribeButton = button(analysisFields, '转成文字', async () => {
    if (busy || !api.capabilities.transcribe) return;
    if (!selectedAudio) { audioFeedback.textContent = '请先选择一段录音。'; return; }
    if (textInput.value.trim() && !window.confirm('转写成功后会替换当前文字，是否继续？')) return;
    busy = true; analysisFields.disabled = true; analyzeButton.disabled = true;
    audioFeedback.textContent = '正在本机转写，首次加载模型可能较慢，请保持页面打开…';
    try {
      const result = await api.transcribe(selectedAudio);
      if (!result.text.trim()) { audioFeedback.textContent = '没有识别出语音，已有文字保留。请换一段声音清晰的录音。'; return; }
      textInput.value = result.text; transcribedFile = selectedAudio; updateReadingPreview();
      audioFeedback.textContent = `转写完成（约${Math.round(result.duration)}秒）。请回听并校对文字，再点击“提炼重点与任务”。`;
      if (result.text.length > 12000) audioFeedback.textContent += '文字超过12000字，请分段整理。';
    } catch (error) { audioFeedback.textContent = error.message + ' 已有文字未覆盖。'; }
    finally { busy = false; analysisFields.disabled = false; analyzeButton.disabled = false; }
  }, 'primary');
  add(analysisFields, 'h3', '2. 校对文字与录音日期');
  const titleInput = field(analysisFields, '便签标题', 'connected-input-title', 'text', '本次学习记录'); titleInput.maxLength = 100; titleInput.required = true;
  const textInput = field(analysisFields, '录音文字', 'connected-input-text', 'textarea', ''); textInput.rows = 6; textInput.required = true; textInput.maxLength = 12000;
  const readingPreview = add(analysisFields, 'details');
  add(readingPreview, 'summary', '彩色阅读预览');
  const previewBody = add(readingPreview, 'div');
  function updateReadingPreview() {
    previewBody.replaceChildren();
    if (textInput.value.trim()) renderSource(previewBody, { quote: textInput.value, kind: 'transcript' });
    else add(previewBody, 'p', '转写或输入文字后，可在这里查看重点提示。', 'quiet-note');
  }
  textInput.addEventListener('input', updateReadingPreview);
  readingPreview.addEventListener('toggle', () => { if (readingPreview.open) updateReadingPreview(); });
  updateReadingPreview();
  const today = new Date(); const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const dateInput = field(analysisFields, '实际录音日期', 'connected-input-date', 'date', todayString); dateInput.required = true; dateInput.min = '0001-01-01'; dateInput.max = '9999-12-31';
  const contextInput = field(analysisFields, '身份或补充说明（选填）', 'connected-input-context', 'textarea', ''); contextInput.rows = 2; contextInput.maxLength = 2000;
  add(analysisForm, 'p', '点击后，文字及补充说明会经后端发送给 DeepSeek，可能产生 API 费用。默认显示少量主谓宾高亮；摘要与要点会额外请求一次标注，不为凑高亮自动重试。', 'quiet-note');
  const analysisFeedback = add(analysisForm, 'p', '', 'feedback'); analysisFeedback.setAttribute('role', 'status');
  const analyzeButton = add(analysisForm, 'button', '提炼重点与任务', 'primary'); analyzeButton.type = 'submit';
  analysisForm.addEventListener('submit', event => {
    event.preventDefault(); if (!allowReplacement()) return;
    analyze({ title: titleInput.value.trim(), text: textInput.value, recordedDate: dateInput.value, context: contextInput.value, audioName: transcribedFile?.name || null });
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
  function openAnalysis() {
    if (busy || pending) { shell.toast('请先处理当前保存请求。', true); return; }
    analysisDialog.showModal(); refreshConnection();
  }
  const audioEntry = button($('#home-view'), '上传录音，开始整理', openAnalysis, 'primary');
  audioEntry.disabled = !api.capabilities.transcribe;
  $('#home-view').insertBefore(audioEntry, $('#home-view .metadata'));
  button($('#home-view'), '整理一段文字', openAnalysis);
  analysisDialog.addEventListener('close', () => { keyInput.value = ''; });
  const noteCard = button($('#home-view'), '', () => { if (!review) return; active = true; render(); shell.navigate('detail'); }, 'record-card');
  noteCard.id = 'connected-note-card'; noteCard.hidden = true;
  const noteText = add(noteCard, 'span'); add(noteText, 'strong').id = 'connected-note-title'; add(noteText, 'small').id = 'connected-note-summary';
  const tools = add($('#profile-view'), 'article', undefined, 'about-paper');
  add(tools, 'h2', '核对不同的内容');
  add(tools, 'p', '以下都是明确标注的接口示例，用来体验多项任务和不同核对状态。');
  const demoButtons = add(tools, 'div', undefined, 'connected-demo-buttons');
  for (const [key, label] of [['focus', '体验重点高亮'], ['multiple', '三项任务示例'], ['ambiguous', '归属待确认示例'], ['empty', '无任务示例']]) button(demoButtons, label, () => loadExample(key));
  const readButton = button(tools, '读取后端已保存任务', readBackend); readButton.disabled = !api.capabilities.readTasks;
  add(tools, 'p', api.capabilities.confirm && api.capabilities.readTasks ? '已配置保存与读取接口；保存结果以服务返回为准。示例与后端记录分别展示。' : '真实保存和读取接口当前未完整配置，接通后再启用。不会把示例存储当作后端数据。', 'quiet-note');
  for (const el of document.querySelectorAll('#home-view .record-card[data-view], #view-new-task, #schedule-view [data-view="detail"]')) el.addEventListener('click', () => { active = false; refreshStatus(); shell.selectTab('content'); shell.navigate('detail'); });
  window.addEventListener('beforeunload', event => { if (dirty || pending) { event.preventDefault(); event.returnValue = ''; } });
  window.AnchorReviewPage = Object.freeze({ refreshStatus });

  // Extend the existing single-task example without touching its inputs or storage.
  for (const original of document.querySelectorAll('#review-form blockquote, #source-dialog .transcript p')) {
    const parent = document.createElement('div');
    const time = original.querySelector('time');
    const quote = original.cloneNode(true); quote.querySelector('time')?.remove();
    if (time) parent.append(time.cloneNode(true));
    renderSource(parent, { quote: quote.textContent, kind: 'transcript' });
    original.replaceWith(parent);
  }

  try {
    const record = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (record) {
      const raw = { reading_card: record.review.summary, key_points: record.review.keyPoints, reading_annotations: record.review.readingAnnotations, tasks: record.review.tasks.map(task => ({ title: task.title, due_date: task.dueDate, source_quote: task.source.quote, first_step: task.suggestion.text })), clarifications: [], status: 'draft', needs_confirmation: true };
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
  if (openReadingOnLoad && !pending) loadExample('focus');
  if (api.capabilities.readTasks) readBackend(false);
  if (openRecordingOnLoad && !pending) { shell.navigate('home'); analysisDialog.showModal(); refreshConnection(); }
})();
