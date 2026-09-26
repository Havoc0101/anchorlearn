const test = require('node:test');
const assert = require('node:assert/strict');
const { readingParts } = require('./review-data.js');

test('math lecture uses its analysis topics instead of highlighting only a pronoun', () => {
  const text = '我们再来一遍因此分解。我看看十字相乘，相加等不等中间这个数。相乘的话是6M加2，正好是8M。把它想成常数。';
  const topics = ['把 k 当作常数处理，再做因式分解。', '分解后用十字相乘核对结果是否等于中间项。', '两项相乘得到6M加2，相加恰为8M。'];
  const parts = readingParts(text, topics);
  const selected = parts.filter(part => part.role === 'focus').map(part => part.text).join('|');
  assert.match(selected, /常数/);
  assert.match(selected, /十字相乘/);
  assert.match(selected, /8M/);
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.ok(!parts.some(part => part.text === '因式分解')); // Do not correct ASR by rewriting evidence.
});

test('topic highlighting generalizes beyond school assignment vocabulary', () => {
  for (const [text, topics, important] of [
    ['我们今天谈海洋环流和温盐差异。', ['海洋环流受温盐差异影响。'], '海洋环流'],
    ['我们讨论线粒体如何产生能量。', ['线粒体与能量产生机制。'], '线粒体'],
  ]) {
    assert.ok(readingParts(text, topics).some(part => part.role === 'focus' && part.text.includes(important)));
    assert.equal(readingParts(text, topics).map(part => part.text).join(''), text);
  }
  assert.deepEqual(readingParts('只留原文', ['原文没有的内容', '<script>']), readingParts('只留原文'));
});

test('real text gets keyword colors while preserving every character and repetition', () => {
  const source = '同学们，请在9月30日前提交课程报告。\n课程报告📚需要两个课堂案例。';
  const parts = readingParts(source);
  assert.equal(parts.map(part => part.text).join(''), source);
  for (const role of ['who', 'when', 'action', 'object']) assert.ok(parts.some(part => part.role === role));
  assert.equal(parts.filter(part => part.text === '课程报告').length, 2);
});

test('negation and changed dates stay in source order without inferring a final deadline', () => {
  const source = '第一组不用提交报告。第二组截止日期从9月30日改到10月2日，具体时间尚未确定。';
  const parts = readingParts(source);
  assert.equal(parts.map(part => part.text).join(''), source);
  assert.equal(parts.find(part => part.text === '不用').role, 'exception');
  assert.equal(parts.find(part => part.text === '尚未').role, 'exception');
  assert.equal(parts.find(part => part.text === '改到').role, 'change');
  assert.deepEqual(parts.filter(part => part.role === 'when').map(part => part.text), ['9月30日', '10月2日']);
});

test('traditional transcription, unknown words and HTML remain literal text', () => {
  for (const text of ['同學請在九月三十日提交課程報告。', '⛵🌊說話的人不明', '<img src=x onerror=alert(1)>提交报告', '', '  \n ']) {
    assert.equal(readingParts(text).map(part => part.text).join(''), text);
  }
  assert.deepEqual(readingParts('量子纠缠'), [{ text: '量子纠缠' }]);
});
