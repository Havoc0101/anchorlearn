# 本地前后端整合版

基于 B 的 `Havoc0101/anchorlearn` 分支 `codex/backend-task-storage`，源码提交 `f8a8db5ca5fb8e403163bd95d833f6e6c874b360`；下载时分支头为 `82109642febdf73910af67000e770cb010cf434b`。这是一份本地整合副本，没有改动 B 的远程分支。

沿用 B 的本地语音识别与任务存储实现，补充上传入口、运行状态、网页内密钥验证及核对字段保存。当前使用项目 `.venv`（Python 3.12.14）；已获用户批准，通过 Socket Firewall 安装 `faster-whisper==1.2.1` 及配套依赖。

## 启动

从整合包根目录运行（`backend` 与 `mobile-preview` 是同级目录）：

```sh
.venv/bin/python backend/server.py --port 8765 --db output/local/tasks.db
```

打开 http://127.0.0.1:8765/#recording 。只监听本机。数据库在指定路径；重启须使用同一路径。不要把数据库提交到 GitHub。若 8765 已被旧静态预览占用，先停止那个预览；不要同时启动两份服务。

录音转写、任务保存和读取不需要 API Key。页面中选择录音 → 转成文字 → 回听并校对 → 提炼重点与任务 → 核对并保存。实际文字分析需要在页面展开“配置 DeepSeek API Key”，输入后点击“验证并连接”；密钥仅留在后端内存，输入框提交后清空，不写入浏览器存储或文件。仍支持 `--ask-key` 和环境变量。真实 AI 分析已通过用户数学文字及虚构语法样例验证；以下保留早期连接排查记录。

### 主谓宾阅读辅助（2026-09-26）

`/api/analyze` 增加可选 `reading_annotations`；`/health` 提供 `reading_contract:"grammar-v1"`。每项含原文 `quote`、从 1 开始的 `occurrence` 和 `parts:[{text,role}]`，role 为 `subject`、`predicate`、`object` 或 null。后端仅保留逐字匹配原文、分段完整、位置有效且不重叠的标注；无效项不会影响任务提取。最多 24 个关键分句，与重点提取合用一次模型请求。AI 仍可能误判语法，尤其是识别错字或残句；校验保证文本一致性，不保证语法准确率。标注尚未存入任务数据库。

本次 39 项 Node、22 项 Python 测试通过，精确命令、真实模型与浏览器验证及限制见 [重点高亮接入记录](../docs/planning/重点高亮接入-2026-09-26.md)。

### 密钥启动检查修正（2026-09-26）

排查真实连接时官方分析接口返回 401，尚未完成真实 AI 联调。另通过启动入口回归测试复现并修正：存在环境变量时 `--ask-key` 原先会跳过重新输入；现在显式输入始终覆盖旧环境值，空回车只启动预览。

显式输入后先调用官方 `GET /models` 验证认证，不发送学习文字或生成内容；成功显示“密钥认证通过”后才提供页面。失败只显示分类信息，不输出密钥、密钥片段或官方错误正文。遮挡后的密钥、引号和空白会提前被拒绝。此检查不保证后续分析额度或语义质量。

服务启动前检查端口；占用时先提示停止旧进程，不让用户输入完才发现启动失败。修改代码后必须重启用户正在运行的服务；旧进程不会自动更新或替换其内存中的密钥。

验证命令（backend 目录）：`python3 -m unittest test_key_setup test_tasks test_backend test_review_contract`。新增 6 项密钥启动测试，仅使用占位符和模拟官方响应；真实密钥由用户在页面密码框或终端自行输入并验证。

音频上传已接通，支持 WAV、MP3、M4A、MP4、AAC、OGG、FLAC、WebM，最多 25 MB / 10 分钟。本机 CPU 转写，录音不发给 DeepSeek；用户点击分析后才发送校对文字。音频只留在请求内存和本次页面中，不永久保存；刷新后回听需重新选择文件。识别错误需人工校对，目前不按任务定位音频，也没有浏览器麦克风录制按钮。

## 与 B 原接口兼容

- 老请求仍支持 `confirmed:true`、`request_id` 与 1–3 项基础任务。
- 带 `review_id` 的新请求必须完整携带 `client_task_id`、`requirements`、`source_kind`，避免静默丢字段。
- 任务 `status:pending` 表示待完成，保存成功不等于任务已完成。
- 同请求重试返回原结果；同号不同内容 409。新请求编号再次确认同一草稿也复用原任务；修改已保存草稿返回 409，不覆盖原记录。
- 兼容原数据库，增加草稿编号索引表；现有任务不删除、不猜测来源。
- `/health` 增加 `task_contract:"review-v1"`；新前端先检查版本，旧服务器不支持时不会发送保存。
- 静态服务只允许前端页面、脚本、样式和 PNG；后台源码、数据库、文档、隐藏文件不可通过网页下载。保留本机 Host/Origin 限制。

完整请求与返回见 `mobile-preview/integration/README.md`。

## 早期存储联调记录（2026-09-26）

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

上述为先前存储阶段验证；下面为本次录音接入后的实际检查。

## 本次录音接入验证（2026-09-26）

- 后端（backend 目录）：`../.venv/bin/python -m unittest test_audio test_key_setup test_tasks test_backend test_review_contract test_recording_routes`，19 项通过。必须在 backend 目录执行，旧测试的子进程依赖该工作目录。
- 前端（仓库根目录）：`node --test mobile-preview/integration/*.test.cjs mobile-preview/tests/*.test.cjs`，本次录音改动验证时 30 项通过。
- `node --check mobile-preview/integration/review-page.js`；`.venv/bin/python -m pip check` 通过。
- 真实本机 HTTP 转写：macOS Tingting 合成的 6.2 秒中文 WAV → `/api/transcribe` → 正确识别“9 月 30 日提交课程报告、包含两个课堂案例”，输出为繁体字。这是合成语音检查，不代表嘈杂课堂、口音或长音频的准确率。
- 内置浏览器真实选择该 WAV、点击转写，页面显示完成并回填文字。Chrome 已打开入口，但自动操作连接不稳定，上传验证使用内置浏览器。
- 已有保存/读取与重试检查使用真实 SQLite；AI 分析测试使用明确标记的模拟响应，真实 DeepSeek 全流程仍待用户有效密钥。未验证手机通知、真机表现；无独立 Lint、类型检查配置。

## 依赖与模型记录

直接依赖在 `requirements-audio.txt`；`requirements-audio.lock.txt` 是项目 `.venv/bin/python -m pip freeze` 生成的全量精确版本快照（本机 macOS arm64 / Python 3.12），其他平台的 wheel 需另行验证。安装的 23 个包与安装前检查一致，均来自 `files.pythonhosted.org` 的 wheel；没有 Git/HTTP 源码依赖或源码构建。包含 PyAV、CTranslate2、ONNX Runtime、NumPy、tokenizers 等原生二进制；Socket Firewall 未报风险警告，这不等于安全证明。

安装命令：`sfw --verbose .venv/bin/python -m pip install --report output/local/audio-install.json --only-binary=:all: -r backend/requirements-audio.txt`。新环境恢复需先遵守本机依赖批准规则，再用 `sfw .venv/bin/python -m pip install --only-binary=:all: -r backend/requirements-audio.lock.txt`。没有全局安装 Python 包或更改网络代理配置。

模型来自官方 [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small/tree/536b0662742c02347bc0e980a01041f333bce120)，固定版本和各文件 SHA256 见 `audio-model.json`。模型主文件已与官方公开 SHA256 核对一致。实际文件在 `backend/models/small/`，约 486 MB；模型、`.venv`、录音测试文件和数据库均被 Git 忽略。重装时下载清单中的四个文件到该目录并校验，不能仅复制源码就宣称模型已就绪。
