# 本地前后端整合版

基于 B 的 `Havoc0101/anchorlearn` 分支 `codex/backend-task-storage`，源码提交 `f8a8db5ca5fb8e403163bd95d833f6e6c874b360`；下载时分支头为 `82109642febdf73910af67000e770cb010cf434b`。这是一份本地整合副本，没有改动 B 的远程分支。

原样引入 `transcribe.py`、`test_backend.py`、`test_audio.py`、`test_tasks.py`；在 `tasks.py`、`server.py` 上补充核对字段与静态页面服务，新增 `test_review_contract.py`。原项目说明要求 Python 3.10+；本次保存与 HTTP 测试在现有 Python 3.9 上通过，音频部分未运行。没有安装或变更第三方依赖。

## 启动

从整合包根目录运行（`backend` 与 `mobile-preview` 是同级目录）：

```sh
python3 backend/server.py --port 8765 --db output/local/tasks.db
```

打开 http://127.0.0.1:8765/ 。只监听本机。数据库在指定路径；重启须使用同一路径。不要把数据库提交到 GitHub。若 8765 已被旧静态预览占用，先停止那个预览；不要同时启动两份服务。

任务保存、读取不需要 API Key。实际文字分析仍需 B 的 DeepSeek 配置；需要交互输入时加 `--ask-key`，或使用已有 `DEEPSEEK_API_KEY` 环境变量。密钥不写入前端或文件。本次没有调用真实模型。

音频转写原代码保留，但当前页面未接音频上传；本地也未安装语音依赖/模型。不要为任务存储联调执行原项目安装脚本。

## 与 B 原接口兼容

- 老请求仍支持 `confirmed:true`、`request_id` 与 1–3 项基础任务。
- 带 `review_id` 的新请求必须完整携带 `client_task_id`、`requirements`、`source_kind`，避免静默丢字段。
- 任务 `status:pending` 表示待完成，保存成功不等于任务已完成。
- 同请求重试返回原结果；同号不同内容 409。新请求编号再次确认同一草稿也复用原任务；修改已保存草稿返回 409，不覆盖原记录。
- 兼容原数据库，增加草稿编号索引表；现有任务不删除、不猜测来源。
- `/health` 增加 `task_contract:"review-v1"`；新前端先检查版本，旧服务器不支持时不会发送保存。
- 静态服务只允许前端页面、脚本、样式和 PNG；后台源码、数据库、文档、隐藏文件不可通过网页下载。保留本机 Host/Origin 限制。

完整请求与返回见 `mobile-preview/integration/README.md`。

## 验证（2026-09-26）

在 `backend` 目录：

```sh
python3 -m unittest test_tasks test_backend test_review_contract
```

10 项通过，包含 B 的 4 项原测试；新增字段保留、跨请求草稿去重、事务回滚、并发重试、旧记录兼容等。

在根目录：

```sh
node --test mobile-preview/integration/review.test.cjs mobile-preview/integration/backend.test.cjs mobile-preview/tests/model.test.cjs
```

28 项通过。其中 `backend.test.cjs` 启动真实 Python HTTP 服务与 SQLite 临时数据库，验证修改、返回丢失、进程重启、重试编号一致、冲突、重新读取、来源校验与静态资源隔离。不消耗模型额度。

Chrome 实际点击验证：虚构分析草稿 → 修改任务名称及补充要求 → 确认弹窗 → 写入真实 SQLite 测试库 → 刷新 → 日程页重新读取，名称和要求保留，无截止日期仍为空。浏览器测试仅替换分析输出，页面有明确测试标记；保存和读取使用本目录实际代码。测试数据库与正常预览数据库隔离。

没有运行 `test_audio`：缺少其所需第三方语音依赖，任务保存不依赖它；也未验证真实 AI 语义质量、转写、手机通知或真机表现。无独立构建、Lint、类型检查配置。
