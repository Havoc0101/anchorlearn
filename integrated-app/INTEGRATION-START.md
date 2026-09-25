# AnchorLearn 前后端整合交接（2026-09-26）

解压后 backend 与 mobile-preview 必须保持同级。建议放在独立目录验收，不覆盖 B 现有运行目录与数据库。

启动：`python3 backend/server.py --port 8765 --db output/local/tasks.db`

打开 http://127.0.0.1:8765/ 。若端口已被占用，先停止旧预览或使用 `--port 8767`。
保存与读取不需要密钥。真实分析需现有 DeepSeek Key；可用 `--ask-key` 在终端安全输入。不要把 Key 发给队友或写进页面。

本包完成：补充要求/来源/草稿编号持久化、确认标记、待完成状态、同源服务、刷新读取、丢失返回后的安全重试、同草稿防重复保存。

检验：Python 10 项 + Node 28 项通过；Chrome 修改名称/要求 → 确认 → 真实 SQLite 写入 → 刷新重读通过。分析测试为虚构输出，不代表真实模型质量。

未完成：任务修改/完成/删除接口、提醒、日历、真实模型与音频联调、手机真机验证。

来源：Havoc0101/anchorlearn 的 codex/backend-task-storage 分支，代码基线 f8a8db5，下载分支头 8210964。本包是独立的整合副本，未改动 B 的 GitHub 分支。

原始服务尚未有 review-v1 能力标记，不能只复制前端就认为接通。请一起使用本包后台，或按 backend/README.md 把字段与静态服务修改整合进 B 的开发分支。

详细接口见 API-HANDOFF.md；运行、来源、检查与边界见 backend/README.md。请只在组内私有仓库分享。
