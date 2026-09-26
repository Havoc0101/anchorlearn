const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./review-data.js');
const { createClient } = require('./review-api.js');
const sentence = '老师不用提交报告。';
const annotation = { quote: sentence, occurrence: 1, parts: [
  { text: '老师', role: 'subject' }, { text: '不用提交', role: 'predicate' },
  { text: '报告', role: 'object' }, { text: '。', role: null },
] };
test('grammar maps exact subject predicate object and keeps negation with predicate', () => {
  const parts = D.grammarParts(sentence, [annotation]);
  assert.deepEqual(parts.slice(0, 3), [{ text: '老师', role: 'who' }, { text: '不用提交', role: 'action' }, { text: '报告', role: 'object' }]);
  assert.equal(parts.map(p => p.text).join(''), sentence);
  assert.deepEqual(D.grammarParts('不用提交报告', [annotation], sentence), [{ text: '不用提交', role: 'action' }, { text: '报告', role: 'object' }]);
});
test('repeated clauses and emoji offsets target exact occurrences without rewriting', () => {
  const text = '📚' + sentence + '\n' + sentence;
  const parts = D.grammarParts(text, [{ ...annotation, occurrence: 2 }]);
  assert.equal(parts[0].text, '📚' + sentence + '\n');
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.equal(D.grammarParts(sentence, [annotation], text), null);
});
test('bad grammar gracefully falls back; absent subjects or objects are not invented', () => {
  assert.equal(D.grammarParts(sentence, [{ ...annotation, parts: [{ text: '编造', role: 'subject' }] }]), null);
  assert.equal(D.grammarParts(sentence, [{ ...annotation, parts: [{ text: sentence, role: '__proto__' }] }]), null);
  assert.equal(D.grammarParts(sentence, undefined), null);
  const text = '请阅读。';
  const parts = D.grammarParts(text, [{ quote: text, occurrence: 1, parts: [{ text: '请', role: null }, { text: '阅读', role: 'predicate' }, { text: '。', role: null }] }]);
  assert.ok(!parts.some(p => p.role === 'who' || p.role === 'object'));
  assert.equal(parts.map(p => p.text).join(''), text);
});
test('analysis adapter carries grammar separately from task confirmation', () => {
  const result = { reading_card: '无需提交', key_points: ['不提交'], tasks: [], clarifications: [], status: 'no_tasks', needs_confirmation: false, reading_annotations: [annotation] };
  const review = D.fromAnalysis(result, { reviewId: 'grammar-check', sourceText: sentence });
  assert.equal(review.readingText, sentence);
  assert.deepEqual(review.readingAnnotations, [annotation]);
  assert.ok(Object.isFrozen(review.readingAnnotations));
});
test('summary sections preserve newlines and emoji, and do not confuse repeated points', () => {
  const texts = ['📚学习\n' + sentence, sentence, '没有标注'];
  const sections = D.grammarSections(texts, [{ ...annotation, occurrence: 2 }]);
  assert.deepEqual(sections.map(parts => parts.map(p => p.text).join('')), texts);
  assert.ok(sections[0].every(p => !p.role));
  assert.equal(sections[1].find(p => p.role === 'action').text, '不用提交');
  assert.ok(sections[2].every(p => !p.role));
});
test('summary annotation ignores newly generated summaries and tasks', async () => {
  const calls = [];
  const client = createClient({ fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ reading_card: '不应该覆盖原摘要', tasks: [{ title: '不应该创建的新任务' }], reading_annotations: [annotation] }));
  } });
  const sections = await client.annotateSummary({ summary: sentence, keyPoints: ['无需提交'], recordedDate: '2026-09-26' });
  assert.deepEqual(sections.map(parts => parts.map(p => p.text).join('')), [sentence, '无需提交']);
  assert.deepEqual(calls, [{ url: '/api/analyze', body: { text: sentence + '\n无需提交', recorded_date: '2026-09-26' } }]);
});
test('unavailable or fabricated summary annotations report failure without a pretend fallback', async () => {
  for (const reading_annotations of [undefined, [{ ...annotation, quote: '老师需要提交报告。' }]]) {
    const client = createClient({ fetchImpl: async () => new Response(JSON.stringify({ reading_annotations })) });
    await assert.rejects(client.annotateSummary({ summary: sentence, keyPoints: ['无需提交'], recordedDate: '2026-09-26' }), error => error.code === 'no_annotations');
  }
});
test('sparse annotation allows empty or partial sections without a second request', async () => {
  for (const annotations of [[], [{ ...annotation, occurrence: 2 }]]) {
    let calls = 0;
    const client = createClient({ fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ reading_annotations: annotations }));
    } });
    const sections = await client.annotateSummary({ summary: sentence, keyPoints: [sentence], recordedDate: '2026-09-26' });
    assert.deepEqual(sections.map(parts => parts.map(p => p.text).join('')), [sentence, sentence]);
    assert.ok(sections[0].every(p => !p.role));
    assert.equal(calls, 1);
  }
});
