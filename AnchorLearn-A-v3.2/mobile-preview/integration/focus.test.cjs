const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./review-data.js');
const keys = parts => parts.filter(p => p.role).map(p => p.text);

test('sparse task cues prefer date and action, without coloring pronouns', () => {
  const text = '请你在9月30日前提交实验报告，报告要包含两个课堂案例。';
  const parts = D.focusParts(text, [text]);
  assert.deepEqual(keys(parts), ['9月30日前', '提交实验报告']);
  assert.equal(parts.map(p => p.text).join(''), text);
});
test('lecture cues use analysis topics and short conclusions instead of grammar roles', () => {
  const math = '老师讲解因式分解，用十字相乘检验中间项。';
  assert.deepEqual(keys(D.focusParts(math, [math])), ['因式分解', '十字相乘']);
  assert.ok(keys(D.focusParts('海水温度升高，所以珊瑚白化。', ['海水温度升高导致珊瑚白化'])).includes('珊瑚白化'));
});
test('multiple task points do not crowd lecture concepts out of the summary', () => {
  const topics = ['老师讲解了因式分解，使用十字相乘检验中间项。', '要求在9月30日前提交实验报告。', '实验报告需包含两个课堂案例。', '五道练习题不用提交。'];
  const summary = '老师讲了因式分解与十字相乘检验中间项的方法；同时提到实验报告提交要求，并说明五道练习题无需提交。';
  assert.deepEqual(keys(D.focusParts(summary, topics)), ['因式分解', '十字相乘', '无需提交']);
  assert.deepEqual(keys(D.focusParts(topics[2], topics)), ['两个课堂案例']);
});
test('negation and conditional clauses cannot leave an affirmative action highlighted', () => {
  for (const text of ['我们不用提交报告。', '如果需要提交报告，请先确认。', '取消提交实验报告，等待后续通知。']) {
    const emphasized = keys(D.focusParts(text, [text]));
    assert.ok(!emphasized.some(word => /^(?:提交|完成|实验报告|报告)$/.test(word)));
    assert.ok(emphasized.some(word => /不用|如果|取消/.test(word)));
  }
  assert.deepEqual(keys(D.focusParts('截止日期从9月30日改到10月2日。')), ['改到10月2日']);
});
test('density is bounded and plain text, Unicode, whitespace and punctuation survive', () => {
  const sentence = '📚老师介绍海洋环流，报告需要包含三个课堂案例，并在10月2日前提交实验报告。';
  const text = ' \n' + (sentence + '\n').repeat(20) + '<script>文字</script>';
  const parts = D.focusParts(text, ['海洋环流与课堂案例', sentence]);
  assert.equal(parts.map(p => p.text).join(''), text);
  assert.ok(keys(parts).length <= 18);
  const one = D.focusParts(sentence, [sentence]);
  assert.ok(keys(one).length <= 3);
  assert.ok(keys(one).join('').length <= Math.floor(sentence.replace(/\s|。/g, '').length * 0.5));
  assert.deepEqual(D.focusParts('嗯啊。', []), [{ text: '嗯啊。' }]);
});
