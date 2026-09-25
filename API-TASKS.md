# 任务确认与读取接口（B 实现版）

前端分支目前只有 README，没有 API-HANDOFF.md。本文件是可用的后端接口约定，详细字段仍需双方联调；不代表已验证队友前端兼容。

## POST /api/tasks/confirm

Content-Type: application/json。用户核对完毕并点击确认后才请求，不能在分析结束时自动调用。

```json
{
  "request_id": "c521013b-9b92-4b9a-919c-e50a5cdd31ea",
  "confirmed": true,
  "tasks": [
    {
      "title": "提交学习报告",
      "due_date": "2026-09-28",
      "first_step": "打开报告文档",
      "source_quote": "学习报告改到下周一提交。"
    }
  ]
}
```

一次1至3条。日期未明确传 null；标题、第一步、原句不能为空。原句应由前端保留为只读证据。当前后端保存客户端确认的内容，尚无服务端草稿ID或录音存档，不能独立验证原句来源；模型分析接口仍会核对原句是否存在于输入。

成功 HTTP 200：

```json
{
  "request_id": "c521013b-9b92-4b9a-919c-e50a5cdd31ea",
  "tasks": [
    {
      "id": "服务端生成的稳定UUID",
      "title": "提交学习报告",
      "due_date": "2026-09-28",
      "first_step": "打开报告文档",
      "source_quote": "学习报告改到下周一提交。",
      "status": "pending",
      "created_at": "2026-09-26T00:00:00+00:00"
    }
  ]
}
```

首次确认生成 request_id（推荐 crypto.randomUUID），发请求前保存请求快照。超时或响应未知时，保留相同编号与相同内容重试，后端返回原结果。不要在重试时生成新编号。

同编号不同内容返回409；输入不合规400；数据库不可用503。失败返回 `{"error":"说明"}`。保存整批任务使用一个事务，不会只保存半批。不同 request_id 视为不同确认，不做跨编号的语义去重。

## GET /api/tasks

返回 HTTP 200：`{"tasks":[上述任务对象]}`；无任务返回 `{"tasks":[]}`。按保存顺序排列，无分页。此版本是单用户本地 Demo。

## 存储及运行

任务保存在 server.py 同目录的 tasks.db，数据库已被 Git 忽略。正常停止、重启不会清空。不要把数据库提交到 GitHub。

```bash
.venv/bin/python server.py
.venv/bin/python -m unittest test_backend test_audio test_tasks
```

原分析接口只生成草稿，不自动保存。当前上传页面尚未接入保存按钮，队友应按本约定连接确认界面。任务完成状态初始为 pending；本次不包含完成/修改/删除接口和通知功能。

浏览器需与8765后端同源。独立8766页面不能直接跨域调用；拿到完整前端后再配置静态目录或开发代理，不删除 Host/Origin 校验。

## 验收顺序

1. 保存两条任务，读取列表核对字段和ID。
2. 重复相同请求，任务仍是两条，ID不变。
3. 保持编号但修改标题，应返回409。
4. 停止后端、重启，再读列表，任务和ID不变。
5. 不点击确认时不发送保存请求；归属疑问先澄清再确认。
