const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./review-data.js');
const length = text => [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].length;
function sample(text, highlights) {
  const parts = []; let cursor = 0;
  for (const [word, role] of highlights) {
    const start = text.indexOf(word, cursor);
    assert.ok(start >= cursor);
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: word, role }); cursor = start + word.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
function render(text, highlights) {
  const parts = D.sparseGrammarParts(text, sample(text, highlights));
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.ok(parts.filter(p => p.role).every(p => length(p.text) <= 5));
  return parts.filter(p => p.role);
}
test('long phrases are dropped whole; generic subjects are not automatic highlights', () => {
  const text = '老师提醒大家按照课堂说明提交包含两个案例的完整实验报告。';
  const marks = render(text, [['老师', 'who'], ['提交', 'action'], ['包含两个案例的完整实验报告', 'object']]);
  assert.deepEqual(marks, [{ text: '提交', role: 'action' }]);
});
test('sentence density and count apply across multiple annotated clauses', () => {
  const text = '小王按照课堂安排整理材料，然后复习笔记，接着检查报告，最后提交作业并向老师说明情况。';
  const marks = render(text, [['小王', 'who'], ['整理', 'action'], ['材料', 'object'], ['复习', 'action'], ['笔记', 'object'], ['检查', 'action'], ['报告', 'object'], ['提交', 'action'], ['作业', 'object']]);
  assert.equal(marks.length, 3);
  assert.ok(marks.reduce((n, p) => n + length(p.text), 0) <= Math.floor(length(text.replace(/[\s\p{P}]/gu, '')) * 0.25));
  assert.deepEqual(render('请提交。', [['提交', 'action']]), []);
});
test('negation is kept intact and uncertain affirmative actions are not colored', () => {
  const text = '五道练习题仅用于课后复习，这次不用提交。';
  assert.deepEqual(render(text, [['不用提交', 'action']]), [{ text: '不用提交', role: 'action' }]);
  assert.deepEqual(render(text, [['提交', 'action']]), []);
  for (const prefix of ['如果大家已经完成复习，就', '这次可能', '这次不一定']) {
    assert.deepEqual(render(prefix + '提交课堂实验报告作为讨论材料。', [['提交', 'action']]), []);
  }
});
test('adjacent fragments cannot bypass the limit or turn a word into single letter highlights', () => {
  const text = '请在这周课堂结束之后提交完整实验报告供大家一起讨论。';
  const parts = sample(text, [['提', 'action'], ['交', 'action'], ['完整实验', 'object'], ['报告', 'object']]);
  const output = D.sparseGrammarParts(text, parts);
  assert.deepEqual(output.filter(p => p.role), [{ text: '提交', role: 'action' }]);
  assert.equal(output.map(p => p.text).join(''), text);
});
test('repeated occurrences, HTML, whitespace and grapheme clusters keep exact text', () => {
  const text = '报告仅供大家参考，最终需要核对的是报告。\n<参考> é 📚 👩‍💻';
  const annotation = { quote: '报告。', occurrence: 1, parts: [{ text: '报告', role: 'object' }, { text: '。', role: null }] };
  const output = D.sparseGrammarParts(text, D.grammarParts(text, [annotation]));
  assert.equal(output[0].text, '报告仅供大家参考，最终需要核对的是');
  assert.equal(output.map(p => p.text).join(''), text);
  const emojiText = '课堂里的角色是一位👩‍💻，大家可以一起讨论她的工作。';
  assert.deepEqual(render(emojiText, [['👩‍💻', 'who']]), [{ text: '👩‍💻', role: 'who' }]);
  const broken = sample(emojiText, [['👩', 'who']]);
  assert.ok(D.sparseGrammarParts(emojiText, broken).every(p => !p.role));
  assert.deepEqual(render('课堂里需要阅读完整的English章节内容并做好相关笔记。', [['English', 'object']]), []);
});
test('invalid, missing and cross-line candidates degrade to unchanged plain text', () => {
  const text = '请按照课堂中的要求整理\n材料并完成课后复习。';
  assert.deepEqual(render(text, [['整理\n材料', 'action']]), []);
  for (const parts of [null, [{ text: '伪造', role: 'who' }], [{ text, role: '__proto__' }]]) {
    assert.deepEqual(D.sparseGrammarParts(text, parts), [{ text }]);
  }
  const texts = ['课堂内容需要认真整理', '材料之后再进行复习'];
  const joined = texts.join('\n');
  const sections = D.grammarSections(texts, [{ quote: joined, occurrence: 1, parts: [
    { text: '课堂内容需要认真', role: null }, { text: '整理\n材料', role: 'object' }, { text: '之后再进行复习', role: null },
  ] }]);
  assert.deepEqual(sections.map(p => p.map(part => part.text).join('')), texts);
  assert.ok(sections.flat().every(p => !p.role), 'a cross-section phrase must not become two clipped highlights');
});
