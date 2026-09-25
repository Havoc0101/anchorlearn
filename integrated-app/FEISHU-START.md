# 飞书文档导入版

基于 codex/integrated-handoff-2026-09-26 的集成包，新增飞书新版文档正文导入。

## 启动

在本目录执行：

```bash
python3 backend/server.py --port 8765 --db output/local/tasks.db --ask-key --ask-feishu
```

依次在本地输入飞书 App ID、App Secret、DeepSeek Key。密钥不写入文件。
应用需开通 docx:document:readonly，并在目标文档中添加该应用为可阅读。

打开 http://127.0.0.1:8765/ ，点击“导入飞书 / 整理文字”，粘贴 docx 链接，读取正文后核对日期和身份，再点击提炼。

当前仅支持新版文档 docx，不支持直接读取妙记或视频。正文超过12000字会拒绝导入，不截断。不自动分析，不自动保存任务。

接口：POST /api/import/feishu，JSON 请求 {"url":"https://组织.feishu.cn/docx/编号"}，返回 text、source_url、document_id。失败时保留页面原输入。既有保存确认流程保持不变。

验证：后端11项测试通过；前端JS语法检查通过。用户已反馈本地导入流程完成。

```bash
cd backend
python3 -m unittest test_feishu test_tasks test_backend test_review_contract
```

数据库、凭证和录音不包含在交付包中。旧 integrated-handoff 目录为历史版本，本版源码在 integrated-app。
