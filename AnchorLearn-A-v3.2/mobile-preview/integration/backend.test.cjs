const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('./review-data.js');
const { createClient } = require('./review-api.js');
const backend = path.resolve(__dirname, '../../backend');

async function start(database) {
  // Real B-derived Handler and SQLite; no replacement API implementation or paid model calls.
  const script = `import sys,server,tasks\nfrom pathlib import Path\ntasks.DB_PATH=Path(sys.argv[1])\nserver.KEY=''\nhttp=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)\nprint(http.server_port,flush=True)\nhttp.serve_forever()`;
  const child = spawn(process.env.PYTHON || 'python3', ['-u', '-c', script, database], { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Backend startup timeout: ' + errors)); }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Backend exited: ' + errors)); });
    child.stdout.once('data', data => { clearTimeout(timer); resolve(Number(String(data).trim())); });
  });
  return { base: `http://127.0.0.1:${port}`, async stop() { const stopped = once(child, 'exit'); child.kill(); await stopped; } };
}
function draft() {
  const result = { reading_card: '联调测试：报告和阅读', key_points: ['核对两项虚构任务'],
    tasks: [
      { title: '提交报告', due_date: '2026-10-02', source_quote: '请交报告。', first_step: '打开报告文档' },
      { title: '阅读第三章', due_date: null, source_quote: '我会阅读第三章。', first_step: '打开第三章' },
    ], clarifications: [], status: 'draft', needs_confirmation: true };
  return D.fromAnalysis(result, { reviewId: 'integration-review', sourceText: '请交报告。', userContext: '我会阅读第三章。' });
}

test('real SQLite HTTP lifecycle: edits, lost response, restart, retry, conflicts, reread and source boundaries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchorlearn-contract-'));
  let service = await start(path.join(dir, 'tasks.db'));
  const bodies = [];
  let loseResponse = true;
  const client = createClient({ confirmPath: '/api/tasks/confirm', tasksPath: '/api/tasks', requireTaskContract: true,
    fetchImpl: async (url, options) => {
      const response = await fetch(service.base + url, options);
      if (options.method === 'POST') {
        bodies.push(options.body);
        if (loseResponse) { loseResponse = false; await response.text(); throw new TypeError('Test: response lost after commit'); }
      }
      return response;
    } });
  try {
    const r = draft();
    const snapshot = D.prepareConfirmation(r, [{ clientTaskId: r.tasks[0].clientTaskId, title: '已修改的报告名称', requirements: '附两张图，PDF 提交', dueDate: '2026-10-03' }], 'integration-request-001');
    assert.equal(snapshot.confirmed, true);
    await assert.rejects(client.confirm(snapshot), { code: 'network_error' });
    await service.stop();
    service = await start(path.join(dir, 'tasks.db'));
    const afterRestart = await client.readTasks();
    assert.equal(afterRestart.length, 2);
    const retried = await client.confirm(JSON.parse(JSON.stringify(snapshot)));
    assert.equal(bodies[0], bodies[1]);
    assert.deepEqual(retried.tasks, afterRestart);
    assert.equal(retried.tasks[0].title, '已修改的报告名称');
    assert.equal(retried.tasks[0].requirements, '附两张图，PDF 提交');
    assert.equal(retried.tasks[0].due_date, '2026-10-03');
    assert.equal(retried.tasks[1].due_date, null);
    assert.equal(retried.tasks[1].source_kind, 'user-context');
    assert.equal(retried.tasks[0].status, 'pending');
    const changed = structuredClone(snapshot); changed.tasks[0].requirements = '修改要求';
    await assert.rejects(client.confirm(changed), { status: 409 });
    const otherRequest = { ...snapshot, request_id: 'integration-request-002' };
    assert.deepEqual((await client.confirm(otherRequest)).tasks, retried.tasks);
    assert.equal((await client.readTasks()).length, 2);
    const wrongOrigin = await fetch(service.base + '/api/tasks/confirm', { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
    assert.equal(wrongOrigin.status, 403);
    // fetch owns the Host header; use HTTP directly to actually send a hostile Host.
    const wrongHost = await new Promise((resolve, reject) => {
      http.get(service.base + '/api/tasks', { headers: { Host: 'example.invalid' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(wrongHost, 403);
    const unconfirmed = await fetch(service.base + '/api/tasks/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...snapshot, confirmed: false }) });
    assert.equal(unconfirmed.status, 400);
    for (const file of ['/server.py', '/tasks.db', '/.env', '/integration/README.md', '/assets/%2e%2e/%2e%2e/backend/tasks.py']) {
      assert.equal((await fetch(service.base + file)).status, 404, file);
    }
    for (const file of ['/', '/integration/review-page.js', '/styles.css']) assert.equal((await fetch(service.base + file)).status, 200);
    const missingKey = await fetch(service.base + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '请交报告。', recorded_date: '2026-09-26' }) });
    assert.equal(missingKey.status, 502);
    assert.match((await missingKey.json()).error, /未配置/);
    assert.equal((await client.readTasks()).length, 2);
  } finally { await service.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('unpatched backend is rejected before any save is sent', async () => {
  const calls = [];
  const client = createClient({ confirmPath: '/api/tasks/confirm', requireTaskContract: true, fetchImpl: async (url, options) => {
    calls.push([url, options.method]);
    return new Response(JSON.stringify({ ok: true }));
  } });
  await assert.rejects(client.confirm(D.prepareConfirmation(draft(), [], 'version-request')), { code: 'incompatible_backend' });
  assert.deepEqual(calls, [['/health', 'GET']]);
});

test('legacy records are readable without inventing source identity or accepting partial new records', () => {
  const old = { id: 'old-task', title: '旧任务', first_step: '打开文档', source_quote: '交报告。', due_date: null, status: 'pending' };
  const [read] = D.validateSavedTasks([old], { allowLegacy: true });
  assert.equal(read.source_kind, 'unknown');
  assert.equal(read.client_task_id, null);
  assert.throws(() => D.validateSavedTasks([old]));
  assert.throws(() => D.validateSavedTasks([{ ...old, client_task_id: 'partial' }], { allowLegacy: true }));
});
