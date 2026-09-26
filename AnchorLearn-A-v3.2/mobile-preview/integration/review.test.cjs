const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const D = require('./review-data.js');
const { createClient } = require('./review-api.js');

const source = '请交实验报告。阅读第三章。下周讨论。';
function output() {
  return {
    reading_card: '报告与阅读安排', key_points: ['提交实验报告'],
    tasks: [{ title: '交实验报告', due_date: null, first_step: '打开报告模板', source_quote: '请交实验报告。' }],
    clarifications: [], status: 'draft', needs_confirmation: true,
  };
}
function review(result = output()) {
  return D.fromAnalysis(result, { reviewId: 'review-1', sourceText: source });
}
function snapshot() { return D.prepareConfirmation(review(), [], 'request-1'); }
function saved(body) {
  return { request_id: body.request_id, tasks: body.tasks.map((task, index) => ({ ...task, id: `stored-${index}`, status: 'confirmed' })) };
}
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('maps multiple tasks without merging dates, inventing requirements or audio positions', () => {
  const result = output();
  result.tasks.push({ title: '阅读第三章', due_date: '2026-10-02', first_step: '打开讲义', source_quote: '阅读第三章。' });
  const r = review(result);
  assert.equal(r.tasks.length, 2);
  assert.notEqual(r.tasks[0].clientTaskId, r.tasks[1].clientTaskId);
  assert.equal(r.tasks[0].dueDate, null);
  assert.equal(r.tasks[1].dueDate, '2026-10-02');
  assert.equal(r.tasks[0].requirements, '');
  assert.equal(r.tasks[0].source.start, null);
  assert.equal(r.tasks[0].suggestion.isAI, true);
  assert.equal(Object.isFrozen(r.tasks[0].source), true);
});
test('rejects fabricated evidence, malformed contracts and impossible calendar dates', () => {
  for (const mutate of [
    r => { r.tasks[0].source_quote = '老师没有说过'; },
    r => { r.tasks[0].due_date = '2026-02-29'; },
    r => { delete r.tasks[0].due_date; },
    r => { r.status = 'saved'; },
    r => { r.needs_confirmation = false; },
    r => { r.tasks = null; },
  ]) {
    const r = output(); mutate(r); assert.throws(() => review(r));
  }
  assert.equal(D.validDate('2028-02-29'), true);
  assert.equal(D.validDate('0000-01-01'), false);
  assert.equal(D.validDate('2026-10-02T23:59:00'), false);
});
test('marks user explanation as context rather than teacher evidence', () => {
  const r = output(); r.tasks[0].source_quote = '我还要交练习。';
  const model = D.fromAnalysis(r, { reviewId: 'r', sourceText: source, userContext: '我还要交练习。' });
  assert.equal(model.tasks[0].source.kind, 'user-context');
});
test('no-task output keeps the summary and cannot be confirmed as saved', () => {
  const r = review({ ...output(), tasks: [], status: 'no_tasks', needs_confirmation: false });
  assert.equal(r.summary, '报告与阅读安排');
  assert.throws(() => D.prepareConfirmation(r, [], 'req'), /没有可保存/);
});
test('unresolved ownership questions must be reanalyzed before confirmation', () => {
  const r = review({ ...output(), status: 'needs_clarification', clarifications: [{ question: '你是哪个组？', source_quote: '下周讨论。' }] });
  assert.equal(r.questions.length, 1);
  assert.throws(() => D.prepareConfirmation(r, [], 'req'), /重新分析/);
});
test('edits keep original evidence and AI suggestion; blank deadline stays null', () => {
  const r = review();
  const before = JSON.stringify(r);
  const sent = D.prepareConfirmation(r, [{ clientTaskId: r.tasks[0].clientTaskId, title: '修改后的报告', dueDate: '', requirements: '用户补充的要求' }], 'req');
  assert.equal(sent.tasks[0].title, '修改后的报告');
  assert.equal(sent.tasks[0].due_date, null);
  assert.equal(sent.tasks[0].source_quote, '请交实验报告。');
  assert.equal(sent.tasks[0].first_step, '打开报告模板');
  assert.equal(JSON.stringify(r), before);
  assert.equal(Object.isFrozen(sent.tasks[0]), true);
  assert.equal('schedule' in sent, false);
});
test('rejects tampering, wrong task IDs, repeated edits and invalid form values', () => {
  const r = review(), id = r.tasks[0].clientTaskId;
  for (const edits of [
    [{ clientTaskId: id, source_quote: '改写原话' }],
    [{ clientTaskId: 'missing', title: '报告' }],
    [{ clientTaskId: id }, { clientTaskId: id }],
    [{ clientTaskId: id, title: '  ' }],
    [{ clientTaskId: id, dueDate: '2026-04-31' }],
  ]) assert.throws(() => D.prepareConfirmation(r, edits, 'req'));
});
test('save and read are disabled by default and never contact a fabricated endpoint', async () => {
  const client = createClient({ fetchImpl: () => assert.fail('must not request') });
  assert.equal(client.capabilities.confirm, false);
  await assert.rejects(client.confirm(snapshot()), { code: 'not_configured' });
  await assert.rejects(client.readTasks(), { code: 'not_configured' });
});
test('analysis matches B request fields and keeps context separate in the view model', async () => {
  let called = 0;
  const client = createClient({ fetchImpl: async (url, options) => {
    called++;
    assert.equal(url, '/api/analyze');
    assert.deepEqual(JSON.parse(options.body), { text: source + '\n用户说明：我是第二组', recorded_date: '2026-09-25' });
    assert.equal(options.headers.Authorization, undefined);
    return response(output());
  } });
  const r = await client.analyze({ text: source, recordedDate: '2026-09-25', context: '我是第二组', reviewId: 'r' });
  assert.equal(r.tasks[0].source.kind, 'transcript');
  await assert.rejects(client.analyze({ text: source, recordedDate: '2026-02-30', reviewId: 'r' }), { code: 'invalid_input' });
  await assert.rejects(client.analyze({ text: '字'.repeat(12000), recordedDate: '2026-09-25', context: '补充', reviewId: 'r' }), { code: 'invalid_input' });
  assert.equal(called, 1);
});
test('duplicate pending clicks share a request; changed content cannot reuse its ID', async () => {
  let resolve, count = 0;
  const s = snapshot();
  const client = createClient({ confirmPath: '/api/tasks/confirm', fetchImpl: () => { count++; return new Promise(done => { resolve = done; }); } });
  const a = client.confirm(s), b = client.confirm(s);
  const changed = JSON.parse(JSON.stringify(s)); changed.tasks[0].title = '新内容';
  await assert.rejects(client.confirm(changed), { code: 'request_conflict' });
  resolve(response(saved(s)));
  const [x, y] = await Promise.all([a, b]);
  assert.deepEqual(x, y);
  assert.equal(count, 1);
  assert.equal(x.tasks[0].id, 'stored-0');
});
test('partial saves, changed fields, duplicate records and wrong request IDs are not success', async () => {
  const s = snapshot();
  for (const mutate of [
    r => { r.request_id = 'other'; },
    r => { r.tasks = []; },
    r => { r.tasks[0].title = '后端意外覆盖'; },
    r => { delete r.tasks[0].id; },
    r => { r.tasks.push(r.tasks[0]); },
    r => { r.tasks[0].status = 'draft'; },
  ]) {
    const result = saved(s); mutate(result);
    const client = createClient({ confirmPath: '/confirm', fetchImpl: async () => response(result) });
    await assert.rejects(client.confirm(s));
  }
});
test('network failure keeps the snapshot retryable with the same ID and contents', async () => {
  const bodies = [], s = snapshot();
  const client = createClient({ confirmPath: '/confirm', fetchImpl: async (_, options) => {
    bodies.push(options.body);
    if (bodies.length === 1) throw new TypeError('offline');
    return response(saved(JSON.parse(options.body)));
  } });
  await assert.rejects(client.confirm(s), { code: 'network_error' });
  const result = await client.confirm(s);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(result.tasks[0].title, s.tasks[0].title);
});
test('timeout aborts requests and HTTP/non-JSON errors never become saved tasks', async () => {
  const s = snapshot();
  const timeout = createClient({ confirmPath: '/confirm', timeoutMs: 10, fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  await assert.rejects(timeout.confirm(s), { code: 'timeout' });
  for (const [res, code] of [[new Response('{}', { status: 503 }), 'http_error'], [new Response('<html>preview page</html>'), 'invalid_response']]) {
    const client = createClient({ confirmPath: '/confirm', fetchImpl: async () => res });
    await assert.rejects(client.confirm(s), { code });
  }
});
test('rejects external endpoints instead of sending recordings to another host', () => {
  for (const confirmPath of ['https://example.com/save', '//example.com/save', '/\\example.com', '/ save']) {
    assert.throws(() => createClient({ confirmPath }));
  }
});
test('real local HTTP transport confirms then rereads exactly the edited tasks using a test server', async () => {
  let stored = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tasks/confirm' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const result = saved(body); stored = result.tasks; res.end(JSON.stringify(result));
    } else if (req.url === '/api/tasks' && req.method === 'GET') res.end(JSON.stringify({ tasks: stored }));
    else { res.statusCode = 404; res.end('{}'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const client = createClient({ confirmPath: '/api/tasks/confirm', tasksPath: '/api/tasks', fetchImpl: (url, options) => fetch(base + url, options) });
    const r = review();
    const sent = D.prepareConfirmation(r, [{ clientTaskId: r.tasks[0].clientTaskId, title: '核对后的报告', dueDate: '2026-10-02' }], 'request-http');
    const result = await client.confirm(sent);
    assert.equal(result.tasks[0].title, '核对后的报告');
    assert.equal(result.tasks[0].due_date, '2026-10-02');
    assert.deepEqual(await client.readTasks(), result.tasks);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
