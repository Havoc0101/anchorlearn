> 当前版本：**HAVOC 9.27**。请从 [整合版启动说明](AnchorLearn-A-v3.2/HAVOC-9.27.md) 开始，源码及产品页面位于 `AnchorLearn-A-v3.2/`。

# AnchorLearn · 接着学

面向成人学习场景的音频整理原型：**音频 → 本机转写 → 校对文字 → 重点与待办**。

没有明确行动时仅提炼重点；任务归属不清楚时提出澄清问题。当前为本地 Web Demo，尚未接入安克录音豆 SDK，也不是医疗工具。

## 启动（macOS / Linux）

需要 Python 3.10+、可用的 DeepSeek 官方 API Key，以及首次下载依赖和模型的网络连接。

```bash
git clone https://github.com/Havoc0101/anchorlearn.git
cd anchorlearn
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python setup_audio.py
.venv/bin/python server.py
```

首次下载 small 多语言转写模型约500 MB。按终端提示输入 Key（不显示输入），或由环境变量 `DEEPSEEK_API_KEY` 提供。不要把密钥放入源代码。打开 http://127.0.0.1:8765/ 。后续启动只需运行最后一行；macOS 也可以使用 `启动.command`。

模型下载失败可重新运行 `setup_audio.py`。服务运行期间修改后端代码后，需先按 Control+C 停止，再启动。

## 使用

1. 选择录音文件并点击“转成文字”。
2. 回听并校对文字，填写实际录音日期及身份说明。
3. 点击“提炼重点与待办”，查看摘要、重点、任务原句与澄清问题。

支持 WAV、MP3、M4A、MP4、AAC、OGG、FLAC、WebM；每段最多25 MB、10分钟。建议先使用30秒至2分钟的清晰录音。也可直接粘贴文字，文字与补充说明合计不超过12000字。

## 数据与边界

- 音频在本机使用 faster-whisper 转写，不发送到 DeepSeek，也不持久保存。
- 点击整理时，文字、日期和补充说明发送到 DeepSeek 官方接口，调用费用由 API 账户承担。
- Key 只读取到服务进程中，不写入页面或日志。
- 服务仅监听本机，不是面向公网的生产服务。
- 未实现任务保存、通知、日历、麦克风录音、说话人身份识别和硬件接入。
- 模型可能误听、误解或编造，请核对原句。日期字段不包含具体时刻。
- 当前为 AI 工作流原型，尚未实现自主工具调用 Agent。

## 接口

### POST /api/transcribe

请求体为音频二进制；Content-Type 为 `application/octet-stream`，`X-Filename` 为 encodeURIComponent 编码的文件名。

返回 `text`、`segments`（每项含 start、end、text，时间单位秒）、`language`、`duration`。未识别出语音时文本和片段为空。

### POST /api/analyze

Content-Type 为 `application/json`：

```json
{"text":"请在2026年9月30日提交报告。","recorded_date":"2026-09-25"}
```

返回结构示例（非实测输出）：

```json
{
  "reading_card": "报告需要在9月30日提交。",
  "key_points": ["报告截止日期为9月30日。"],
  "tasks": [{
    "title": "提交报告",
    "due_date": "2026-09-30",
    "first_step": "打开报告文档",
    "source_quote": "请在2026年9月30日提交报告。"
  }],
  "clarifications": [],
  "status": "draft",
  "needs_confirmation": true
}
```

状态：`draft` 有任务；`no_tasks` 无任务或问题；`needs_clarification` 有待澄清问题。澄清项含 `question` 和 `source_quote`。无截止日期时 `due_date` 为 null。所有输出都不代表已保存或安排提醒。

错误返回非200状态码及 `{"error":"原因"}`。`GET /health` 返回服务状态及是否配置 Key，不返回密钥。

前端默认与后端同源；跨端口页面需开发代理，手机联调需单独配置。

## 验证

```bash
.venv/bin/python -m unittest test_backend test_audio
```

测试覆盖请求构造、结果校验、空任务、澄清依据、音频解码和无效输入；模拟模型调用不消耗 API 额度，不代表语义准确率评估。

## 文件

- `server.py`：HTTP 服务、DeepSeek 调用及结果校验。
- `transcribe.py`：本地音频解码和转写。
- `index.html`：上传、回听、校对和卡片展示。
- `setup_audio.py`：首次模型下载。

模型、虚拟环境、缓存和录音由 `.gitignore` 排除。

## 参考

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [DeepSeek API 文档](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)
