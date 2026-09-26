const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('./review-api.js');

test('recording uses raw binary and encoded filename; configuration is separate', async () => {
  const calls = [];
  const client = createClient({ transcribePath: '/api/transcribe', configurePath: '/api/configure', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('configure') ? { key_configured: true } : { text: '真实接口协议测试', segments: [], duration: 1 }));
  } });
  const audio = new Blob(['fixture']); audio.name = '课堂录音.wav';
  assert.equal((await client.transcribe(audio)).duration, 1);
  assert.equal(calls[0].options.body, audio);
  assert.equal(calls[0].options.headers['X-Filename'], encodeURIComponent(audio.name));
  assert.equal(calls[0].options.headers['Content-Type'], 'application/octet-stream');
  assert.equal(await client.configureKey('test-placeholder'), true);
  assert.deepEqual(JSON.parse(calls[1].options.body), { api_key: 'test-placeholder' });
});

test('invalid audio never sends data, provider errors remain visible, malformed responses fail', async () => {
  let calls = 0;
  const client = createClient({ transcribePath: '/api/transcribe', fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ error: '文件中没有音轨' }), { status: 400 });
  } });
  for (const file of [{ name: 'test.txt', size: 1 }, { name: 'test.wav', size: 0 }, { name: 'test.wav', size: 26 * 1024 * 1024 }]) {
    await assert.rejects(client.transcribe(file), { code: 'invalid_input' });
  }
  assert.equal(calls, 0);
  await assert.rejects(client.transcribe({ name: 'test.wav', size: 10 }), /文件中没有音轨/);
  const broken = createClient({ transcribePath: '/api/transcribe', fetchImpl: async () => new Response('{}') });
  await assert.rejects(broken.transcribe({ name: 'test.wav', size: 10 }), { code: 'invalid_response' });
});
