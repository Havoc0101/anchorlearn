# AnchorLearn 前后端整合交接（2026-09-26）

完整整合包、接口约定及 SHA256SUMS 校验文件放在本目录。

下载 AnchorLearn-integrated-2026-09-26.zip 并解压到独立目录；backend 与 mobile-preview 保持同级。

启动：`python3 backend/server.py --port 8765 --db output/local/tasks.db`

打开 http://127.0.0.1:8765/ 。真实 AI 分析需要在本机配置 DeepSeek Key，密钥不要上传。

38 项自动化测试通过；Chrome 已验证修改名称与要求、确认保存、刷新读取。分析测试使用虚构输出，数据库保存真实执行。提醒与真实 AI/音频联调尚未完成。

这是独立交接分支，不覆盖 B 的主分支或后端开发分支。
