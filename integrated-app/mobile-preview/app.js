'use strict';
const M = window.NoteModel;
const $ = (selector) => document.querySelector(selector);
let state = M.fresh();
let draft = { ...state.review };
let tab = 'content';
let toastTimer;
function toast(text, error = false) {
  const el = $('#toast'); el.textContent = text; el.dataset.error = String(error); el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}
function save(next) {
  // Commit only after storage succeeds; failed writes never display a false success.
  try { M.persist(localStorage, next); state = next; render(); return true; }
  catch { toast('保存失败，请允许本地存储后重试。当前填写内容仍在。', true); return false; }
}
function dateText(value) {
  if (!value) return '尚无明确截止日期';
  const [year, month, day] = value.split('-'); return `${year}年${Number(month)}月${Number(day)}日`;
}
function feedback(text, error = false) { $('#review-feedback').textContent = text; $('#review-feedback').dataset.error = String(error); }
function fillDraft() {
  $('#deadline').value = draft.deadline;
  $('#no-deadline').checked = draft.noDeadline;
  $('#deadline').disabled = draft.noDeadline;
  for (const radio of document.querySelectorAll('[name=format]')) radio.checked = radio.value === draft.format;
}
function readDraft() {
  return { deadline: $('#deadline').value, noDeadline: $('#no-deadline').checked, format: document.querySelector('[name=format]:checked')?.value || '' };
}
function render() {
  const summary = $('#deadline-summary'); summary.replaceChildren();
  if (state.review.deadline) summary.textContent = `${dateText(state.review.deadline)}（时间未说明）`;
  else if (state.review.noDeadline) summary.textContent = '尚无明确截止日期';
  else {
    summary.append('日期待确认 ');
    const link = document.createElement('button'); link.type = 'button'; link.className = 'inline-link'; link.textContent = '去核对 ›'; link.addEventListener('click', () => selectTab('pending', true)); summary.append(link);
  }
  $('#pending-dot').hidden = M.pending(state.review) === 0;
  $('#attention-review-status').textContent = M.pending(state.review) ? '截止日期与提交格式还需确认。' : '核对结果已保存；安排变化时，记得更新日程。';
  $('#pending-help').textContent = M.pending(state.review)
    ? `还有 ${M.pending(state.review)} 处待确认${state.schedule ? '，已加入的日程暂不变' : '，尚未加入日程'}`
    : state.schedule ? (M.changed(state) ? '信息已核对，请回到内容页确认更新日程' : '信息已核对，日程已保存') : '信息已核对，可以回到内容页加入日程';
  $('#join-button').textContent = !state.schedule ? '核对并加入日程' : M.changed(state) ? '核对并更新日程' : '查看已加入的日程';
  $('#schedule-caption').hidden = !state.schedule;
  $('#schedule-caption').textContent = M.changed(state) ? '核对结果有变化，确认更新后才会修改原日程' : '已加入日程，不会重复添加';
  $('#attention-read').textContent = state.attentionRead ? '已记住 ✓' : '我记住了';
  $('#schedule-empty').hidden = Boolean(state.schedule); $('#schedule-card').hidden = !state.schedule;
  if (state.schedule) {
    $('#schedule-date').textContent = `截止日期：${dateText(state.schedule.deadline)}`;
    $('#schedule-format').textContent = `提交格式：${state.schedule.format}`;
    $('#task-complete').checked = state.schedule.completed;
    $('#schedule-card').dataset.complete = String(state.schedule.completed);
  }
  drawPaper();
  window.AnchorReviewPage?.refreshStatus();
}
function drawPaper() {
  const el = $('#notebook'); if (!el.getBoundingClientRect().width) return;
  const w = el.clientWidth, h = el.clientHeight;
  const tw = parseFloat(getComputedStyle(el).getPropertyValue('--tab-width'));
  const m = w - tw;
  const y = { content:22, pending:119, attention:216 }[tab], bh = 78;
  const path = `M16 1 H${m-14} Q${m} 1 ${m} 15 V${y-9} Q${m} ${y} ${m+10} ${y} H${w-13} Q${w-1} ${y} ${w-1} ${y+13} V${y+bh-13} Q${w-1} ${y+bh} ${w-13} ${y+bh} H${m+10} Q${m} ${y+bh} ${m} ${y+bh+10} V${h-15} Q${m} ${h-1} ${m-15} ${h-1} H16 Q1 ${h-1} 1 ${h-16} V16 Q1 1 16 1 Z`;
  $('.paper-shape').setAttribute('viewBox', `0 0 ${w} ${h}`);
  $('#paper-path').setAttribute('d', path);
  $('#wash-stop').setAttribute('stop-color', {content:'#fff0a8',pending:'#d4eec1',attention:'#ffd0c7'}[tab]);
}
function selectTab(next, focus = false) {
  if (!['content','pending','attention'].includes(next)) return;
  tab = next; $('#notebook').dataset.tab = next;
  for (const button of document.querySelectorAll('.side-tab')) {
    const selected = button.dataset.tab === next;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    $('#panel-' + button.dataset.tab).hidden = !selected;
  }
  drawPaper();
  if (focus) $('#tab-' + next).focus({preventScroll:true});
}
function showView(next) {
  if (!['home','detail','schedule','profile'].includes(next)) next = 'detail';
  for (const view of ['home','detail','schedule','profile']) $('#' + view + '-view').hidden = view !== next;
  for (const button of document.querySelectorAll('.bottom-nav button')) {
    if (button.dataset.view === (next === 'detail' ? 'home' : next)) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  window.scrollTo({top:0,behavior:'instant'}); render();
}
function navigate(view) { if (location.hash === '#' + view) showView(view); else location.hash = view; }
function openDialog(id) { const d = $('#' + id); if (!d.open) d.showModal(); }
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => navigate(b.dataset.view));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
for (const b of document.querySelectorAll('.side-tab')) {
  b.addEventListener('click', () => selectTab(b.dataset.tab));
  b.addEventListener('keydown', (e) => {
    const names=['content','pending','attention']; let i=names.indexOf(tab);
    if (['ArrowDown','ArrowRight'].includes(e.key)) i=(i+1)%3;
    else if (['ArrowUp','ArrowLeft'].includes(e.key)) i=(i+2)%3;
    else if (e.key==='Home') i=0; else if(e.key==='End') i=2; else return;
    e.preventDefault(); selectTab(names[i],true);
  });
}
for (const b of document.querySelectorAll('[data-tab-link]')) b.addEventListener('click', () => selectTab(b.dataset.tabLink,true));
for (const b of document.querySelectorAll('[data-source]')) b.addEventListener('click', () => openDialog('source-dialog'));
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close(); } });
$('#more-button').addEventListener('click', () => navigate('profile'));
$('#no-deadline').addEventListener('change', () => { if ($('#no-deadline').checked) $('#deadline').value=''; $('#deadline').disabled=$('#no-deadline').checked; draft=readDraft(); });
$('#review-form').addEventListener('input', () => { draft=readDraft(); feedback('有修改，记得保存'); });
$('#review-form').addEventListener('submit', e => {
  e.preventDefault(); draft=readDraft();
  try {
    if (save(M.saveReview(state,draft))) { feedback(M.pending(draft) ? '已保存，未确定的信息仍保留为待确认。' : '已保存，可以回到内容页加入日程。'); toast('确认结果已保存'); }
  } catch (error) { feedback(error.message,true); }
});
$('#join-button').addEventListener('click', () => {
  if (JSON.stringify(draft) !== JSON.stringify(state.review)) { selectTab('pending',true); feedback('请先保存当前填写的核对结果。',true); return; }
  if (state.schedule && !M.changed(state)) { navigate('schedule'); return; }
  try { M.addSchedule(state); }
  catch(error) { selectTab('pending',true); feedback(error.message,true); return; }
  $('#confirm-date').textContent='截止日期：'+dateText(state.review.deadline);
  $('#confirm-format').textContent='提交格式：'+state.review.format;
  $('#confirm-join').textContent=state.schedule?'确认更新日程':'确认加入日程'; $('#confirm-error').textContent=''; openDialog('confirm-dialog');
});
$('#confirm-join').addEventListener('click', () => {
  try { if(save(M.addSchedule(state))) { $('#confirm-dialog').close(); navigate('schedule'); toast('已保存到日程'); } else $('#confirm-error').textContent='未能保存，请允许本地存储后重试。'; }
  catch(error) { $('#confirm-error').textContent=error.message; }
});
$('#task-complete').addEventListener('change', e => { if(!state.schedule)return; const next={...state,schedule:{...state.schedule,completed:e.target.checked}}; if(!save(next))render(); });
$('#attention-read').addEventListener('click', () => { if(save({...state,attentionRead:true}))toast('重要事项已标记为已读'); });
function demoPopup(){ navigate('home'); openDialog('recording-dialog'); }
$('#new-recording').addEventListener('click',demoPopup); $('#show-demo-popup').addEventListener('click',demoPopup);
$('#view-new-task').addEventListener('click', () => { $('#recording-dialog').close(); selectTab('content');navigate('detail'); });
try { state=M.read(localStorage); } catch { toast('本地记录暂时无法读取，现显示示例；不会自动覆盖原记录。',true); }
draft={...state.review}; fillDraft();
new ResizeObserver(drawPaper).observe($('#notebook'));
showView(location.hash.slice(1) || 'detail');
// The integration module shares the existing navigation and paper without replacing its art.
window.NoteShell = Object.freeze({ navigate, selectTab, toast });
