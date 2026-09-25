# AnchorLearn V2 · 录音入口与重点高亮（2026-09-26）

这是 A 当前本地版本的独立整合快照。解压 AnchorLearn-integrated-2026-09-26-v2.zip 后，backend 和 mobile-preview 位于同一层。请优先下载文件名带 v2 的新包；同目录旧 ZIP 保留作为回退版本。

## 给 B：已经跑通之后怎么更新

**可以下载继续接，但不保证仅下载就能运行。**本包不含虚拟环境、约 486 MB 的语音模型、API Key、录音和数据库。现有环境配置不会随 ZIP 自动迁移。

1. 解压到新的独立目录，保留你当前能跑通的代码和数据库。若你又改了后端，先对比，不要用本包覆盖你的工作。
2. 复用已安装 faster-whisper 的 Python 环境。启动时使用那个环境的 Python，而不是不确定的系统 Python。若用 Windows，其路径通常是旧项目的 `.venv\Scripts\python.exe`；macOS/Linux 为旧项目的 `.venv/bin/python`。没有环境时先按 backend/README.md 的依赖清单配置；其中锁文件是在 macOS arm64 / Python 3.12 生成，Windows 尚未验收。
3. 把已验证的 small 模型四个文件复制到新版 `backend/models/small/`；对照 `backend/audio-model.json` 的 SHA256。不要假定模型缓存会被自动发现。缺模型也能看页面和保存文字任务，不能转写录音。
4. 在新版根目录，用旧环境的 Python 启动下列命令。Python 路径带空格须加引号；Windows PowerShell 调用带引号路径时在前面加 `&`。

```sh
"旧项目/.venv/bin/python" backend/server.py --port 8767 --db output/local/tasks.db
```

Windows PowerShell 示例（替换旧项目实际路径）：

```powershell
& "C:\旧项目\.venv\Scripts\python.exe" backend/server.py --port 8767 --db output/local/tasks.db
```

此命令使用新测试库和 8767 端口，旧版无需停止。若要沿用旧任务，先停旧服务备份数据库，再将 `--db` 指向备份副本；不要让两个版本共用同一数据库做验收。

5. 打开 http://127.0.0.1:8767/#recording ，在本机页面输入自己的 DeepSeek Key 并验证。密钥仅留在服务内存，重启需重新配置；不要提交或转发密钥。也可使用 `--ask-key` 启动参数。
6. 打开 http://127.0.0.1:8767/health ，应见 `task_contract: review-v1`，以及音频状态和密钥状态；录音入口会展示是否准备好。修改代码后需重启新服务并刷新页面，旧进程不会自动加载新版。
7. 用你刚才跑通的同一段音频重测：选择文件 → 转写 → 校对 → 提炼任务 → 核对保存 → 刷新重读。成功才算新版在你机器上跑通。

## 这版增加什么

- 保留原猫狗纸张样式、多任务核对、SQLite 保存与刷新读取、防重复确认。
- 录音文件上传、回听、本机转写、校对后发送文字给 DeepSeek；新增网页内密钥验证入口。
- 「我的 → 体验重点高亮」，或 `/#reading`：蓝色“谁”、紫色“做什么”、青色“什么东西”，时间加粗，例外和改期加下划线，可关闭。仅人工标注示例，不是自动语法分析，也不是已验证的注意力干预。

## 本次打包验证

在冻结后的本包源码副本上运行，不是只测试工作区：

- 根目录 `node --test mobile-preview/integration/*.test.cjs mobile-preview/tests/*.test.cjs`：30 项通过。
- backend 目录，用已有项目虚拟环境 Python 执行 `-m unittest test_audio test_key_setup test_tasks test_backend test_review_contract test_recording_routes`：19 项通过。
- 模型请求使用模拟响应；保存和读取测试包括真实临时 HTTP 服务与 SQLite。没有在 B 的电脑执行，也没有验证 B 刚跑通的具体代码版本。
- 高亮此前在 Chrome 实测开关、原文不变和编辑名称保留。真实转写的历史本机合成语音检查见 backend/README.md；本次打包未重新下载模型、安装依赖或调用真实 DeepSeek。

## 兼容边界

本地后台基线为 B 的 codex/backend-task-storage / f8a8db5，之后添加 review-v1 字段和静态服务、录音及密钥入口。B 后续的新提交不应假定已包含。若沿用你自己的新后端，请按 mobile-preview/integration/README.md 对齐接口，并保留 `/api/transcribe`、`/api/configure` 和 `/health` 能力信息；不要只替换前端就认为一定兼容。

最小演示的建议日程、实际应用内提醒和确认延期后的同步更新，尚未在本包形成完整已验收流程。自动全文高亮、锁屏通知、设备 SDK 接入可后做。

本包仅供原私有仓库组内协作；不含密钥、数据库、语音模型、虚拟环境或私人录音。
