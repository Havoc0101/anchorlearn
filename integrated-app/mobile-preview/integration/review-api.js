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
  function createClient({ fetchImpl = root.fetch?.bind(root), analyzePath = '/api/analyze', confirmPath = null, tasksPath = null, requireTaskContract = false, timeoutMs = 65000 } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求。');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('超时时间须为正数。');
    path(analyzePath);
    if (confirmPath !== null) path(confirmPath);
    if (tasksPath !== null) path(tasksPath);
    const inFlight = new Map();
    async function request(endpoint, method, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method, signal: controller.signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
          ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
        let result;
        try { result = await response.json(); }
        catch (error) {
          if (controller.signal.aborted) throw error;
          throw new ApiError('invalid_response', '服务返回的不是有效数据，请检查接口是否接通。', response.status);
        }
        if (!response.ok) throw new ApiError('http_error', `请求失败（HTTP ${response.status}），请保留填写内容后重试。`, response.status);
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw new ApiError('timeout', '请求超时；保存结果可能尚未返回，请保留原请求编号查询或重试。');
        if (error instanceof ApiError) throw error;
        throw new ApiError('network_error', '无法连接后端，请检查服务和页面代理。当前修改应保留，勿显示保存成功。');
      } finally { clearTimeout(timer); }
    }
    return {
      capabilities: Object.freeze({ analyze: true, confirm: confirmPath !== null, readTasks: tasksPath !== null }),
      async analyze({ text, recordedDate, context = '', reviewId, recordingId = null }) {
        if (typeof text !== 'string' || !text.trim() || typeof context !== 'string' || !D.validDate(recordedDate) ||
            typeof reviewId !== 'string' || !reviewId.trim() || (recordingId !== null && (typeof recordingId !== 'string' || !recordingId.trim()))) {
          throw new ApiError('invalid_input', '请提供文字、实际录音日期和本次草稿编号。');
        }
        const combined = text + (context.trim() ? '\n用户说明：' + context.trim() : '');
        if (combined.length > 12000) throw new ApiError('invalid_input', '文字与补充说明合计不能超过 12000 字。');
        const result = await request(analyzePath, 'POST', { text: combined, recorded_date: recordedDate });
        return D.fromAnalysis(result, { reviewId, recordingId, sourceText: text, userContext: context });
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
