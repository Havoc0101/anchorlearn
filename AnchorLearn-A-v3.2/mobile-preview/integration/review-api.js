/* Same-origin API adapter. Unavailable save endpoints never fall back to localStorage. */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./review-data.js') : root.AnchorReviewData;
  class ApiError extends Error {
    constructor(code, message, status = null) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; }
  }
  function path(value) {
    if (typeof value !== 'string' || !/^\/(?!\/)/.test(value) || /[\\\s#]/.test(value)) throw new Error('接口地址须为同源相对路径，例如 /api/analyze。');
    return value;
  }
  function createClient({ fetchImpl = root.fetch?.bind(root), analyzePath = '/api/analyze', confirmPath = null, tasksPath = null, transcribePath = null, configurePath = null, requireTaskContract = false, timeoutMs = 195000, transcriptionTimeoutMs = 43200000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求。');
    if (![timeoutMs, transcriptionTimeoutMs].every(value => Number.isFinite(value) && value > 0)) throw new Error('超时时间须为正数。');
    path(analyzePath);
    if (confirmPath !== null) path(confirmPath);
    if (tasksPath !== null) path(tasksPath);
    if (transcribePath !== null) path(transcribePath);
    if (configurePath !== null) path(configurePath);
    const inFlight = new Map();
    async function request(endpoint, method, body, { binary = false, headers = {}, wait = timeoutMs } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), wait);
      try {
        const response = await fetchImpl(endpoint, {
          method, signal: controller.signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
          ...(body === undefined ? {} : { headers: { 'Content-Type': binary ? 'application/octet-stream' : 'application/json', ...headers }, body: binary ? body : JSON.stringify(body) }),
        });
        let result;
        try { result = await response.json(); }
        catch (error) {
          if (controller.signal.aborted) throw error;
          throw new ApiError('invalid_response', '服务返回的不是有效数据，请检查接口是否接通。', response.status);
        }
        if (!response.ok) throw new ApiError('http_error', typeof result?.error === 'string' ? result.error.slice(0, 300) : `请求失败（HTTP ${response.status}），请保留填写内容后重试。`, response.status);
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw new ApiError('timeout', binary ? '转写等待超时，本机可能仍在处理中。请稍后重试，已有文字保持不变。' : '请求超时；保存结果可能尚未返回，请保留原请求编号查询或重试。');
        if (error instanceof ApiError) throw error;
        throw new ApiError('network_error', '无法连接后端，请检查服务和页面代理。当前修改应保留，勿显示保存成功。');
      } finally { clearTimeout(timer); }
    }
    return {
      capabilities: Object.freeze({ analyze: true, confirm: confirmPath !== null, readTasks: tasksPath !== null, transcribe: transcribePath !== null, configure: configurePath !== null }),
      health() { return request('/health', 'GET'); },
      async configureKey(key, baseUrl = "https://api.deepseek.com", model = "deepseek-flash") {
        if (!configurePath) throw new ApiError('not_configured', '此版本没有连接密钥配置接口。');
        const result = await request(configurePath, 'POST', { api_key: key, base_url: baseUrl, model });
        if (result?.key_configured !== true) throw new ApiError('invalid_response', '服务未确认密钥配置成功。');
        return true;
      },
      async transcribe(file) {
        if (!transcribePath) throw new ApiError('not_configured', '此版本没有连接录音转写接口。');
        if (!file || typeof file.name !== 'string' || !/\.(wav|mp3|m4a|mp4|aac|ogg|flac|webm)$/i.test(file.name) || !Number.isFinite(file.size) || file.size <= 0 || file.size > 8 * 1024 * 1024 * 1024) {
          throw new ApiError('invalid_input', '请选择不超过8 GB的 WAV、MP3、M4A、MP4、AAC、OGG、FLAC 或 WebM 录音。');
        }
        const result = await request(transcribePath, 'POST', file, { binary: true, headers: { 'X-Filename': encodeURIComponent(file.name) }, wait: transcriptionTimeoutMs });
        if (typeof result?.text !== 'string' || !Array.isArray(result.segments) || !Number.isFinite(result.duration) || result.duration < 0 || result.duration > 10800) throw new ApiError('invalid_response', '转写返回格式异常，原文字未覆盖。');
        return result;
      },
      async analyze({ text, recordedDate, context = '', reviewId, recordingId = null }) {
        if (typeof text !== 'string' || !text.trim() || typeof context !== 'string' || !D.validDate(recordedDate) ||
            typeof reviewId !== 'string' || !reviewId.trim() || (recordingId !== null && (typeof recordingId !== 'string' || !recordingId.trim()))) {
          throw new ApiError('invalid_input', '请提供文字、实际录音日期和本次草稿编号。');
        }
        const combined = text + (context.trim() ? '\n用户说明：' + context.trim() : '');
        if (Array.from(combined).length > 100000) throw new ApiError('invalid_input', '文字与补充说明合计不能超过 100000 字。');
        const result = await request(analyzePath, 'POST', { text: combined, recorded_date: recordedDate });
        return D.fromAnalysis(result, { reviewId, recordingId, sourceText: text, userContext: context });
      },
      async annotateSummary({ summary, keyPoints, recordedDate }) {
        const texts = [summary, ...(Array.isArray(keyPoints) ? keyPoints : [])];
        if (!Array.isArray(keyPoints) || !texts.every(text => typeof text === 'string' && text.trim()) ||
            texts.join('\n').length > 12000 || !D.validDate(recordedDate)) {
          throw new ApiError('invalid_input', '摘要标注需要有效文字和录音日期。');
        }
        // Reuse grammar-v1 without replacing the original analysis or accepting its tasks.
        const result = await request(analyzePath, 'POST', { text: texts.join('\n'), recorded_date: recordedDate });
        // Empty annotations are a valid sparse result, not a reason to ask the
        // model to invent highlights or automatically make another paid request.
        if (Array.isArray(result?.reading_annotations) && !result.reading_annotations.length) {
          return texts.map(text => [{ text }]);
        }
        const sections = D.grammarSections(texts, result?.reading_annotations);
        if (!sections) throw new ApiError('no_annotations', '本次没有返回可用的主谓宾标注。');
        return sections;
      },
      // Keep and reuse this immutable snapshot after a timeout. B must deduplicate it.
      async confirm(snapshot) {
        if (!confirmPath) throw new ApiError('not_configured', 'B 的保存接口尚未接通，当前任务未保存到后端。');
        if (!snapshot || typeof snapshot.request_id !== 'string' || !snapshot.request_id.trim() ||
            !Array.isArray(snapshot.tasks) || !snapshot.tasks.length) throw new ApiError('invalid_input', '请先生成已核对的保存请求。');
        // Copy immediately, so caller edits cannot change a request while it is pending.
        const payload = JSON.parse(JSON.stringify(snapshot));
        const serialized = JSON.stringify(payload);
        const previous = inFlight.get(payload.request_id);
        if (previous) {
          if (previous.serialized !== serialized) throw new ApiError('request_conflict', '相同请求编号不能用于不同的任务内容。');
          return previous.promise;
        }
        const promise = (async () => {
          if (requireTaskContract) {
            const health = await request('/health', 'GET');
            if (health?.task_contract !== 'review-v1') throw new ApiError('incompatible_backend', '后端尚未支持完整核对字段，请先更新联调版本。本次未发送保存请求。');
          }
          return D.validateConfirmation(await request(confirmPath, 'POST', payload), payload);
        })();
        inFlight.set(payload.request_id, { serialized, promise });
        try { return await promise; } finally { inFlight.delete(payload.request_id); }
      },
      async readTasks() {
        if (!tasksPath) throw new ApiError('not_configured', 'B 的任务读取接口尚未接通。');
        const result = await request(tasksPath, 'GET');
        return D.validateSavedTasks(result?.tasks, { allowLegacy: true });
      },
    };
  }
  const api = { createClient, ApiError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnchorReviewAPI = api;
})(typeof window !== 'undefined' ? window : globalThis);
