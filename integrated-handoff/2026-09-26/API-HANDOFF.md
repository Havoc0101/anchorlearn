# 核对页与 B 后端联调约定

更新：2026-09-26。现有手绘 UI 已连接本项目 `backend/` 整合副本的保存和读取；B 远程分支仍是原版本，尚未合并此补丁。没有重新设计页面。

## 一起运行

在整合包根目录执行：

```sh
python3 backend/server.py --port 8765 --db output/local/tasks.db
```

Chrome 打开 http://127.0.0.1:8765/ 。同一服务提供页面和 `/api`，不需跨端口请求或移除 Host/Origin 校验。普通 `python3 -m http.server` 只能预览，不能保存正式任务。

- “录音 → 整理一段文字”：真实分析由 B 的 DeepSeek 逻辑处理，缺 Key 会明确失败，绝不回退到虚构结果。
- 分析完成后进入“待确认”，逐条修改名称、日期、补充要求，确认弹窗后才保存。
- “日程”中的“已核对任务 · 后端记录”展示数据库记录。刷新自动重读，也可点“刷新已保存任务”或“我的 → 读取后端已保存任务”。暂不支持编辑已保存记录、排程或提醒。
- “我的”中的三项任务、归属不明、无任务仍是独立的本浏览器示例，不写后端。
- 分享单文件使用独立存储且禁用联网；不等同于整合服务。

## 分析：POST /api/analyze

请求 `{text, recorded_date}`，沿用 B 的原协议。补充说明拼在 text 尾部，只在用户点击时调用。前端用 `reading_card`、`key_points`、`tasks`、`clarifications` 与 `status` 生成核对页。

原文引用必须能在本次文字/补充说明中找到；引用出自用户补充时标记 `user-context`，不冒充老师原话。`first_step` 始终标注 AI 建议；任务要求为空时不使用 AI 建议填充。音频时间片段尚未关联。

有澄清问题时不允许确认本批任务，先补充并重新分析。无任务仍保留摘要。无明确截止日期保存 null，不补 23:59 或猜测日期。

## 确认：POST /api/tasks/confirm

```json
{
  "request_id": "同一次确认和所有重试共用的UUID",
  "confirmed": true,
  "review_id": "本次分析草稿编号",
  "recording_id": null,
  "tasks": [{
    "client_task_id": "草稿编号:task:1",
    "title": "核对后的报告名称",
    "due_date": null,
    "requirements": "用户补充的要求，可为空",
    "source_quote": "请交报告。",
    "source_kind": "transcript",
    "first_step": "打开报告文档"
  }]
}
```

1–3 项任务；title ≤200 字、requirements ≤4000 字、first_step ≤1000 字、source_quote ≤12000 字；整个 JSON 请求最多 60000 字节。request_id 为 8–128 位字母、数字、下划线或连字符，页面使用 UUID。

成功返回 HTTP 200：

```json
{
  "request_id": "与请求一致",
  "tasks": [{
    "id": "后端生成的稳定UUID",
    "client_task_id": "草稿编号:task:1",
    "review_id": "本次分析草稿编号",
    "recording_id": null,
    "title": "核对后的报告名称",
    "due_date": null,
    "requirements": "用户补充的要求，可为空",
    "source_quote": "请交报告。",
    "source_kind": "transcript",
    "first_step": "打开报告文档",
    "status": "pending",
    "created_at": "2026-09-26T00:00:00+00:00"
  }]
}
```

`pending` 表示任务未完成；用户确认保存由请求与成功返回表达。旧本地示例的 `confirmed` 状态仍可读，不转换成正式任务。

- 前端发送前检查 `/health` 的 `task_contract` 必须为 `review-v1`，防止把完整表单发到会忽略新增字段的旧服务。
- 一批任务以 SQLite 事务原子保存；失败不留下半批。
- 同 request_id、同内容返回相同任务；同号内容改变返回 409。
- 新 request_id 但相同 `(review_id, client_task_id)` 和内容，返回原任务；更改已保存任务返回 409，需要未来的修改接口处理。
- 新一次分析产生新 review_id，仍是另一份草稿；不按标题猜测任务是否相同。
- 客户端编号不是后端存证。保存接口暂不独立核验原文与用户身份，适用于本机单用户 Demo。

## 读取：GET /api/tasks

返回 `{ "tasks": [...] }`，无记录返回空数组。按保存顺序，未分页。刷新页面时自动读取，服务重启后只要使用同一路径数据库便可恢复。

B 旧版基础记录没有补充字段，前端只读兼容：不编造草稿编号，来源标记 unknown，要求显示为空。缺少部分新字段的损坏记录会被拒绝，不伪装为旧记录。

## 失败与重试

- 正式请求快照和编号在发送前写入 sessionStorage；网络失败或返回丢失时保留快照，暂时锁定编辑。
- 查询时按 client_task_id 匹配并逐字段核对全部任务；未完整匹配不宣称保存成功。
- 刷新后原样重试必须使用同一 request_id 和原内容。后端事务与请求表负责去重。
- SQLite 错误返回 503；非法请求 400；冲突 409；错误正文 `{error:"原因"}`。
- 前端不把请求失败写到 localStorage 冒充成功；只有示例使用本浏览器存储。
- 后端版本不兼容时不发送保存，解除本次待发送状态，显示需更新联调版本。

## 代码与验证

`review-data.js` 管理数据与返回校验；`review-api.js` 管理请求、版本检查和重试；`review-page.js` 管理 UI 与刷新读取；`config.js` 配置同源接口。

```sh
node --test mobile-preview/integration/review.test.cjs mobile-preview/integration/backend.test.cjs mobile-preview/tests/model.test.cjs
```

28 项通过；另在 backend 目录运行 `python3 -m unittest test_tasks test_backend test_review_contract`，10 项通过。真实 SQLite HTTP 测试包含响应丢失、服务重启和跨请求去重。Chrome 已实际验证修改名称/要求、确认保存与刷新重读。

浏览器分析草稿使用明确标注的虚构数据，没有运行真实 DeepSeek 或音频转写。数据库保存是真实执行。尚未实现提醒、任务完成/修改/删除、硬件接入或手机真机测试。没有新增依赖。
