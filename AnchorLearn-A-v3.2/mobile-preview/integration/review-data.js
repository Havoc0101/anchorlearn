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
      readingText: input,
      readingAnnotations: Array.isArray(result.reading_annotations) ? copy(result.reading_annotations) : [],
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
  function grammarParts(text, annotations, original = text) {
    if (typeof text !== 'string' || typeof original !== 'string' || !Array.isArray(annotations)) return null;
    const base = original.indexOf(text);
    // Repeated excerpt text has no reliable occurrence identity; do not guess its grammar.
    if (base < 0 || (text !== original && original.indexOf(text, base + text.length) !== -1)) return null;
    const roles = { subject: 'who', predicate: 'action', object: 'object' };
    const spans = [], clauses = [];
    for (const annotation of annotations.slice(0, 24)) {
      if (!annotation || typeof annotation.quote !== 'string' || !annotation.quote.trim() || annotation.quote.length > 600 ||
          !Number.isInteger(annotation.occurrence) || annotation.occurrence < 1 || annotation.occurrence > 100 ||
          !Array.isArray(annotation.parts) || !annotation.parts.length || annotation.parts.length > 32 ||
          annotation.parts.some(p => !p || typeof p.text !== 'string' || !p.text || ![null, 'subject', 'predicate', 'object'].includes(p.role)) ||
          annotation.parts.map(p => p.text).join('') !== annotation.quote) continue;
      let start = -1, end = 0;
      for (let n = 0; n < annotation.occurrence; n++) {
        start = original.indexOf(annotation.quote, end);
        if (start < 0) break;
        end = start + annotation.quote.length;
      }
      if (start < 0 || clauses.some(([a, b]) => start < b && end > a)) continue;
      clauses.push([start, end]);
      let cursor = start;
      for (const part of annotation.parts) {
        const stop = cursor + part.text.length;
        if (part.role && cursor >= base && stop <= base + text.length) spans.push({ start: cursor - base, end: stop - base, role: roles[part.role] });
        cursor = stop;
      }
    }
    if (!spans.length) return null;
    spans.sort((a, b) => a.start - b.start);
    const parts = []; let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) parts.push({ text: text.slice(cursor, span.start) });
      parts.push({ text: text.slice(span.start, span.end), role: span.role }); cursor = span.end;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor) });
    return parts;
  }
  // Apply one display policy to AI annotations, summaries, and manual examples.
  // Invalid/long candidates are dropped intact, never truncated into different words.
  function sparseGrammarParts(text, parts) {
    const plain = [{ text }];
    if (typeof text !== 'string' || !Array.isArray(parts) ||
        parts.some(p => !p || typeof p.text !== 'string') ||
        parts.map(p => p.text).join('') !== text || typeof Intl.Segmenter !== 'function') return plain;
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    const chars = value => [...segmenter.segment(value)];
    const boundaries = new Set([text.length, ...chars(text).map(c => c.index)]);
    const roles = { action: 3, object: 2, who: 1 };
    const candidates = [];
    let offset = 0;
    for (const part of parts) {
      const end = offset + part.text.length;
      if (Object.hasOwn(roles, part.role)) {
        const previous = candidates.at(-1);
        if (previous?.end === offset && previous.role === part.role) {
          previous.end = end; previous.text += part.text;
        } else candidates.push({ start: offset, end, text: part.text, role: part.role });
      }
      offset = end;
    }
    const selected = [];
    for (const sentence of text.matchAll(/[^。！？!?\n]+[。！？!?]?/gu)) {
      const begin = sentence.index, end = begin + sentence[0].length;
      const budget = Math.floor(chars(sentence[0]).filter(c => !/^[\s\p{P}]+$/u.test(c.segment)).length * 0.25);
      const uncertain = /如果|假如|除非|只有|可能|也许|也許|不一定|未必|是否|若|尚未确定/.test(sentence[0]);
      let used = 0, count = 0;
      const options = candidates.filter(c => {
        c.size = chars(c.text).length;
        if (c.start < begin || c.end > end || c.size < 1 || c.size > 5 ||
            !boundaries.has(c.start) || !boundaries.has(c.end) || /[\s\p{P}]/u.test(c.text) ||
            (c.role === 'who' && /^(老师|老師|我们|我們|你们|你們|大家|他们|他們)$/.test(c.text))) return false;
        if (c.role !== 'action') return true;
        // Conservative guard: do not emphasize an affirmative action under a
        // condition or a preceding negation. Keep an intact negative predicate.
        const prefix = text.slice(begin, c.start).split(/[，,；;]/u).at(-1);
        return !uncertain && !/(不|没|沒|无须|無須|无需|無需|未|禁止|取消)/u.test(prefix);
      }).sort((a, b) => roles[b.role] - roles[a.role] || a.start - b.start);
      for (const c of options) {
        if (count >= 3 || used + c.size > budget ||
            selected.some(other => c.start <= other.end && c.end >= other.start)) continue;
        selected.push(c); used += c.size; count++;
      }
    }
    const result = []; offset = 0;
    for (const c of selected.sort((a, b) => a.start - b.start)) {
      if (c.start > offset) result.push({ text: text.slice(offset, c.start) });
      result.push({ text: text.slice(c.start, c.end), role: c.role }); offset = c.end;
    }
    if (offset < text.length) result.push({ text: text.slice(offset) });
    return result.length ? result : plain;
  }
  function topicTerms(text, topics) {
    if (!Array.isArray(topics) || typeof Intl.Segmenter !== 'function') return [];
    const stop = new Set('我们 我們 你们 你們 他们 他們 自己 大家 今天 这个 這個 那个 那個 这里 這裡 然后 然後 所以 就是 已经 已經 可以 需要 是否 怎么 怎麼 什么 什麼 一个 一個 一遍 一下 一些 还有 還有 进行 進行 通过 通過 关于 關於 内容 內容 原文 录音 錄音 片段 提到 强调 強調 认为 認為 类似 類似 结果 結果 处理 處理 没有 沒有 不用 不要 尚未 取消 改到'.split(' '));
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const candidates = new Map();
    const useful = item => item?.isWordLike && item.segment.length >= 2 && !stop.has(item.segment) && !/^\d+$/.test(item.segment);
    for (const topic of topics.filter(value => typeof value === 'string').slice(0, 8)) {
      const words = [...segmenter.segment(topic.slice(0, 2000))];
      for (let i = 0; i < words.length; i++) {
        if (!useful(words[i])) continue;
        for (let size = 1; size <= 3 && i + size <= words.length; size++) {
          const slice = words.slice(i, i + size);
          if (!slice.every(useful)) break;
          const term = slice.map(word => word.segment).join('');
          if (term.length <= 10 && text.includes(term)) candidates.set(term, (candidates.get(term) || 0) + 1);
        }
      }
    }
    return [...candidates].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 24).map(([term]) => term).sort((a, b) => b.length - a.length);
  }
  // Use already-generated analysis topics to find exact phrases in the source.
  // Basic keyword hints remain available before analysis; neither path rewrites text.
  // Ordered alternatives keep negation/change phrases together; every character survives.
  function readingParts(text, topics = []) {
    if (typeof text !== 'string') throw new Error('阅读内容须为文字。');
    const rules = [
      ['exception', /不需要|不用|无需|無需|不要|不必|不能|没有|沒有|取消|不得|尚未|未定|待确认|待確認/],
      ['change', /改为|改為|改到|改成|延期|延后|延後|提前|推迟|推遲|更改/],
      ['when', /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|(?:\d{4}|[〇零一二三四五六七八九]{4})年(?:\d{1,2}|[一二三四五六七八九十]{1,3})月(?:\d{1,2}|[一二三四五六七八九十]{1,3})[日号號]|(?:\d{1,2}|[一二三四五六七八九十]{1,3})月(?:\d{1,2}|[一二三四五六七八九十]{1,3})[日号號]|(?:本|这|這|下|上)(?:周|週|星期)[一二三四五六日天]?|今天|明天|后天|後天|\d{1,2}[:：]\d{2}|(?:\d{1,2}|[一二三四五六七八九十]{1,3})[点點](?:半)?)(?:之前|以前|前|之后|之後|后|後)?/],
      ['who', /第[一二三四五六七八九十\d]+组(?:同学)?|第[一二三四五六七八九十\d]+組(?:同學)?|同学们|同學們|同学|同學|老师|老師|大家|我们|我們|你们|你們|小组成员|小組成員/],
      ['action', /提交|完成|阅读|閱讀|整理|复习|複習|准备|準備|讨论|討論|上传|上傳|下载|下載|检查|檢查|撰写|撰寫|写出|寫出|列出|交上来|交上來/],
      ['object', /(?:课程|課程|实验|實驗|研究|学习|學習)?(?:报告|報告|论文|論文|笔记|筆記)|练习题|練習題|作业|作業|练习|練習|课堂案例|課堂案例|课程讲义|課程講義|第[一二三四五六七八九十百\d]+章|材料|资料|資料|提纲|提綱|核心观点|核心觀點|文件|PDF|Word/],
    ];
    const terms = topicTerms(text, topics);
    if (terms.length) rules.splice(5, 0, ['focus', new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))]);
    const pattern = new RegExp(rules.map(([, expression]) => '(' + expression.source + ')').join('|'), 'gu');
    const parts = []; let offset = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
      const index = match.slice(1).findIndex(value => value !== undefined);
      parts.push({ text: match[0], role: rules[index][0] });
      offset = match.index + match[0].length;
    }
    if (offset < text.length) parts.push({ text: text.slice(offset) });
    return parts;
  }
  // Sparse reading cues from existing analysis topics and explicit expressions.
  // This is a density-limited hint, not a new semantic or clinical assessment.
  function focusParts(text, topics = []) {
    if (typeof text !== 'string') throw new Error('阅读内容须为文字。');
    const candidates = [], protectedClauses = [];
    const push = (start, value, score) => {
      if (value.length >= 2 && value.length <= 16) candidates.push({ start, end: start + value.length, text: value, score });
    };
    const exclusion = /(?:不需要|不用|无需|無需|不必|不能|不要|没有|沒有|不得|尚未|取消|可能|如果|只有|除非)[^，,。；;！？!?\n]*/gu;
    for (const m of text.matchAll(exclusion)) {
      protectedClauses.push([m.index, m.index + m[0].length]);
      // Keep the complete condition when short; otherwise emphasize only the explicit cue.
      const cue = m[0].match(/^(?:不需要|不用|无需|無需|不必|不能|不要|没有|沒有|不得|尚未|取消|可能|如果|只有|除非)/)[0];
      push(m.index, m[0], 111);
      push(m.index, cue, 110);
    }
    let offset = 0;
    for (const part of readingParts(text)) {
      if (part.role === 'when') {
        const before = text.slice(Math.max(0, offset - 2), offset);
        const change = /改到|改为|改為/.test(before);
        push(change ? offset - 2 : offset, change ? before + part.text : part.text, change ? 105 : 90);
      }
      if (part.role === 'object') push(offset, part.text, 65);
      offset += part.text.length;
    }
    for (const m of text.matchAll(/(?:提交|完成|阅读|閱讀|复习|複習|整理)(?:[一二三四五六七八九十两兩\d]+(?:道|份|篇|个|個))?(?:实验报告|實驗報告|课程报告|課程報告|报告|報告|练习题|練習題|作业|作業|第三章|材料|笔记|筆記)/gu)) push(m.index, m[0], 95);
    for (const m of text.matchAll(/(?:至少|至多|不少于|不超过|包含|包括)(?:[一二三四五六七八九十两兩\d]+(?:个|個|道|份|篇))[^，,。；;！？!?\n]*/gu)) push(m.index, m[0], 85);
    for (const m of text.matchAll(/(?:包含|包括)((?:[一二三四五六七八九十两兩\d]+(?:个|個|道|份|篇))[^，,。；;！？!?\n]*)/gu)) push(m.index + 2, m[1], 84);
    for (const m of text.matchAll(/(因此|所以|意味着|說明|说明|结论是|結果是|结果是|等于)([^，,。；;！？!?\n]+)/gu)) push(m.index + m[1].length, m[2], 88);
    const generic = /老师|老師|我们|我們|同学|同學|讲解|講解|介绍|介紹|本次|录音|錄音|原文|提到|要求|重点|重點|内容|內容|主要|示例|检验|檢驗|通过|通過|用来|用來|进行|進行|使用|提交|完成|包含|包括/;
    const terms = new Set((Array.isArray(topics) ? topics : []).filter(t => typeof t === 'string').slice(0, 8).flatMap(topic => topicTerms(text, [topic])));
    for (const term of terms) {
      if (generic.test(term) || term === '中间' || term === '中間') continue;
      let at = 0;
      while ((at = text.indexOf(term, at)) !== -1) { push(at, term, 70 + Math.min(term.length, 6)); at += term.length; }
    }
    const chosen = [];
    for (const sentence of text.matchAll(/[^。！？!?\n]+/gu)) {
      const begin = sentence.index, end = begin + sentence[0].length;
      const length = sentence[0].replace(/\s/g, '').length;
      const budget = Math.min(Math.floor(length * 0.5), Math.max(4, Math.floor(length * 0.45)));
      let used = 0, count = 0;
      const seen = new Set();
      const hasChangedDate = candidates.some(c => c.start >= begin && c.end <= end && c.score === 105);
      const options = candidates.filter(c => c.start >= begin && c.end <= end && !(hasChangedDate && c.score === 90) &&
        !protectedClauses.some(([a, b]) => c.start < b && c.end > a && c.score < 110))
        .sort((a, b) => b.score - a.score || b.text.length - a.text.length || a.start - b.start);
      for (const candidate of options) {
        if (count >= 3 || chosen.length >= 18 || used + candidate.text.length > (count === 0 ? Math.floor(length * 0.5) : budget) || seen.has(candidate.text) ||
            chosen.some(c => candidate.start < c.end && candidate.end > c.start)) continue;
        chosen.push(candidate); seen.add(candidate.text); used += candidate.text.length; count++;
      }
    }
    const parts = []; let cursor = 0;
    for (const c of chosen.sort((a, b) => a.start - b.start)) {
      if (c.start > cursor) parts.push({ text: text.slice(cursor, c.start) });
      parts.push({ text: text.slice(c.start, c.end), role: 'key' }); cursor = c.end;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor) });
    return parts;
  }
  // Split by known section offsets, not by matching repeated summary sentences.
  function grammarSections(texts, annotations) {
    const parts = grammarParts(texts.join('\n'), annotations);
    if (!parts) return null;
    let start = 0;
    return texts.map(text => {
      const end = start + text.length;
      let offset = 0;
      const section = [];
      for (const part of parts) {
        const next = offset + part.text.length;
        const left = Math.max(start, offset), right = Math.min(end, next);
        if (left < right) section.push({ ...part, role: left === offset && right === next ? part.role : undefined,
          text: part.text.slice(left - offset, right - offset) });
        offset = next;
      }
      start = end + 1;
      return section;
    });
  }
  const api = { validDate, fromAnalysis, prepareConfirmation, validateSavedTasks, validateConfirmation, readingParts, grammarParts, grammarSections, focusParts, sparseGrammarParts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnchorReviewData = api;
})(typeof window !== 'undefined' ? window : globalThis);
