# 录音便签 · 定稿交互版

## 产品落地页（2026-09-26）

同一后端服务启动后，访问 `/landing.html`：AnchorLearn 锚学社流程图版，浅炭灰白字导航、中间导航位置固定、品牌与圆形入口靠两端、纯白留白、毛玻璃分层卡片与阻尼回弹。首屏依据用户提供的官方外形参考，展示录音豆收在收纳壳里的原生 WebGL 模型，缓慢自动转动并随光变化；点击或回车后录音豆居中，壳子移到最左侧并转为侧身展示。支持旋转、按压、收回、复位与暂停自动旋转。

首屏之后直接进入六步箭头流程图：收到示例提醒 → 打开便签 → 括号内容 → 问号待确认 → 感叹号注意 → 确认保存。六个步骤均有动物插画，四只原有小猫加上新增的长尾小猫和斑点小狗，沿用用户原图，以 SVG 视窗取景展示。流程图直接嵌入原版软件并切换已有页面，没有重绘便签或角色，也不自动分析、填写或保存数据。新增情绪感知、ADHD 友好和一键向家人求助三个后续开发方向，均明确区分当前功能与未上线规划。

页尾品牌名、口号、说明与按钮使用一致间距，进入视口后逐行浮现；减少动态效果时直接显示。

软件演示使用当前源文件，新版多任务便签包含摘要重点高亮与可展开任务；已有恢复的便签优先保留。右上角圆形刷新按钮可重新读取当前软件。流程不自动保存数据。

本次独立预览：<http://127.0.0.1:8770/landing.html>。启动命令为 `.venv/bin/python backend/server.py --port 8770 --db output/local/landing-preview.db`（仓库根目录执行）。8770 使用独立预览数据库，原 8765 服务和数据不受影响。真实分析需在产品页面连接模型服务。

实现文件：`landing.html`、`landing.css`、`landing.js`。没有新依赖。3D 是外形交互展示模型，不是官方工程模型；按键不控制真实录音。WebGL 不可用时显示收纳组合的 SVG。前三版在 `output/landing-v1-archive/`、`output/landing-v2-archive/`、`output/landing-v3-archive/` 保留，未定稿 IP 外壳图片不在新版引用。未公开发布。

验证与限制见 [第三版落地页验收记录](../docs/planning/产品落地页-v3-收纳壳-2026-09-26.md)。

按用户确认的纸张便签图实现：中文手绘标题、原创猫狗、内容黄／待确认绿／注意红、右侧连体页签与向纸内淡出的渐变。首次入口是「课程作业安排」示例详情；已有保存的多任务示例时恢复该便签。

## 运行

静态示例无需第三方依赖；真实录音版使用已准备好的项目 `.venv` 和语音模型，详见 [后端说明](../backend/README.md)。在仓库根目录运行：

```sh
.venv/bin/python backend/server.py --port 8765 --db output/local/tasks.db
```

在 Chrome 打开 <http://127.0.0.1:8765/>。服务只监听本机，未发布到互联网；另一台手机不能直接使用这个地址。

## 新增：动态核对页

已接入多任务数据层，保留定稿外观。

1. 打开「我的 → 三项任务示例」，进入「待确认」，分别修改名称、日期和要求。
2. 点击「核对并保存示例」，查看预览后确认；刷新仍能读回。保存不会自动生成日程或提醒。
3. 「我的」还有归属待确认、无任务示例。问题未澄清前不允许直接保存任务。
4. 「录音 → 整理一段文字」连接 B 的分析逻辑，需要后端配置 DeepSeek Key；缺 Key 会明确失败，旧内容保留。

正式保存与读取已在 `integration/config.js` 中启用，需使用本项目 `backend/` 整合服务；刷新自动读取后端任务。交接约定及完整验证记录见 [integration/README.md](integration/README.md)。本地示例不会冒充后端记录。

## 原单任务示例仍可体验

1. 点击右侧「内容／待确认／注意」，切换便签。键盘方向键、Home、End 也能切换。
2. 点击「查看原文与录音」，查看只读示例原话；本例没有音频，未提供假播放按钮。
3. 选日期和 PDF／Word；不确定日期可明确选择「尚无明确日期」，格式也可稍后确认。切换页签保留本次草稿，保存后刷新仍能读取。
4. 回到内容页点「核对并加入日程」。未核对完会提示；最终确认后才写入日程，取消不保存。
5. 已保存的核对结果可以继续修改，原日程要再次确认才更新。重复确认更新同一个任务，不重复添加；完成状态保留。
6. 日程页可标记完成。首页「＋」或「我的 → 体验新录音提醒」可触发示例弹窗；关闭后原便签仍保留，查看任务进入详情。

日期只存用户选定的日期；原话没有几点时不会补造 23:59。不确定截止日期时保存为 null。

## 文件与素材

- `index.html`：真实页面内容、表单、弹窗；不是整页截图。
- `styles.css`：手机布局、纸张、渐变、页签及导航。
- `app.js`：页面交互、弹窗与存储失败反馈。
- `model.js`：核对、日程和本地存储规则；之后可替换持久化接口。
- `assets/`：原图提取的角色与已定稿标题。详见 `assets/README.md`。
- `tests/model.test.cjs`：用 Node 自带测试工具验证数据与确认边界。
- `integration/`：动态核对页、接口配置、数据校验、明确标记的演示数据与测试。

本地数据使用 `anchorlearn.stationery.v1`；不会覆盖旧蓝色预览的存储键。数据仅存在当前浏览器、当前站点地址下；草稿未保存时刷新会丢失。后续后端接入不能把模型密钥放进前端。

## 验证记录（2026-09-25）

```sh
node --check mobile-preview/app.js
node --check mobile-preview/model.js
node --check mobile-preview/integration/review-page.js
node --check mobile-preview/integration/config.js
node --check mobile-preview/integration/demo-cases.js
node --test mobile-preview/integration/review.test.cjs mobile-preview/tests/model.test.cjs
git diff --check
```

共 25 项测试通过。原示例的 10 项状态测试覆盖：未核对拦截、保存不自动加日程、空截止日期、日期合法性、冲突字段、重复加入、修改后重新确认、刷新读取、损坏存储和写入失败。

Chrome 实际操作检查：三页签、键盘切换、草稿跨页保留、原话弹窗与 Escape、未确认拦截、取消、首次加入、重复查看、完成后刷新、修改与确认更新、无日期、提醒关闭与进入。检查了 390×844、320×568 与桌面视口；两种手机宽度无横向溢出，图片加载完整，控制台未发现错误。浏览器尺寸模拟不等同于 iOS／Android 真机测试。

## 当前边界

这是本地 Web Demo，包含原单任务示例、多任务核对流程和 SQLite 存储。首页、日程与「我的」是为详情交互配套的最小页面。本仓库已接入基于 B 新代码的 SQLite 保存/读取整合副本，已运行本机真实转写、页面音频回听和真实 DeepSeek 分析；尚未接入录音豆同步、系统日历或通知，不是可安装 App，也未宣称比赛方案已提交。动态核对页的浏览器验证和虚构 HTTP 失败重试记录见交接文档。前端无构建依赖；真实转写使用项目 Python 依赖。

## v3.1 简洁阅读（2026-09-26）

默认模式改为“简洁重点”，根据已有分析和明确表达筛选少量短语，统一淡色提示，增大重点列表文字。主谓宾保留为可选模式，只有选择时才额外请求摘要语法。范围、精确验证命令与限制见 [简洁阅读记录](../docs/planning/简洁阅读-v3.1-2026-09-26.md)。

## v3 最终整合版（2026-09-26）

同一版本包含黄点展开/收起、四种猫滚出、翘尾趴猫提醒弹窗、狐狸与感叹号，以及真实分析的摘要/重点/原文主谓宾高亮。两个任务直接修改了同一工作区，整合保留它们当前文件，无需覆盖或合并远程分支。验收范围与使用方式见 [最终整合记录](../docs/planning/最终整合版-v3-2026-09-26.md)。

## 组内单文件分享包（2026-09-25）

`build-share.cjs` 使用 Node 内置库生成 `output/share/AnchorLearn-demo.html`，内嵌全部图片、样式与脚本，保留示例交互，禁用文字分析与联网请求。分享版使用独立示例存储键，不携带本机浏览器中填写的数据。ZIP 只包含网页、打开说明、后端接口交接文档。

生成与检查命令：

```sh
node mobile-preview/build-share.cjs
node --check mobile-preview/build-share.cjs
python3 -m zipfile -c output/share/AnchorLearn-share.zip output/share/AnchorLearn-demo.html output/share/打开说明.txt output/share/后端接口交接.md
python3 -m zipfile -t output/share/AnchorLearn-share.zip
python3 -m zipfile -l output/share/AnchorLearn-share.zip
git diff --check
```

上述命令已成功运行。另通过 Node `vm.Script` 对 HTML 中的 8 段内嵌脚本进行语法检查；检查到 8 处 PNG 内嵌引用、0 处外部资源引用。压缩包完整性检查通过。浏览器工具的 URL 策略禁止访问 `file://`，因此未实测双击打开；原网页的 HTTP 浏览器测试不代替这一检查。未安装依赖、未上传或公开发布。

## 联调更新（2026-09-26）

前后端联合测试 28 项、Python 测试 10 项通过。Chrome 已验证修改任务名称和补充要求、确认入库、刷新读取；分析输出使用标注的虚构数据，保存使用真实 SQLite。详见 [backend/README.md](../backend/README.md)。B 远程分支未被修改；组内整合包需要同时包含 backend 与 mobile-preview。

### 真实录音入口（2026-09-26）

打开 http://127.0.0.1:8765/#recording 。选择录音 → 转成文字 → 校对 → 提炼任务 → 核对保存。密钥在页面内验证；转写无需密钥。录音最多 25 MB / 10 分钟，暂不支持麦克风直接录制。准确运行版本、依赖与真实验证范围见 [backend/README.md](../backend/README.md)。离线分享 HTML 仍只演示示例。

### 黄点折叠与小豆丁猫（2026-09-26）

内容页默认只显示任务标题。点击黄点展开该项日期、要求、AI 建议及原文入口，再次点击收起；各项独立展开，切换页签保留状态，刷新后收起。黄点保留原视觉大小，点击区域为 44×44 像素，支持 Tab、空格和回车。每次展开轮流滚出开心、眨眼、打哈欠、好奇四种猫；系统启用减少动态效果时直接出现。录音提醒改用草图中的翘尾趴猫。五种猫均参考用户草图用内联 SVG 重绘，非原图裁切。

改动位于 `index.html`（猫图形）、`app.js`（通用折叠）、`styles.css`（布局与动画）、`integration/review-page.js`（任务展开状态）。不涉及任务存储或后端接口。单文件 HTML 可直接包含内联图形，不需要放宽服务的静态资源白名单。

本次实际验证命令：

```sh
node --check mobile-preview/app.js
node --check mobile-preview/integration/review-page.js
node --check mobile-preview/build-share.cjs
node --test mobile-preview/tests/model.test.cjs mobile-preview/integration/reading.test.cjs mobile-preview/integration/audio.test.cjs
node --test mobile-preview/integration/review.test.cjs
node mobile-preview/build-share.cjs
git diff --check
```

17 项数据/阅读/音频测试与 15 项核对接口测试通过。接口测试初次因沙箱禁止监听本机端口而失败，获工具权限后重跑通过。Chrome 实测默认收起、重复点击、四种猫、空格操作、独立展开、切换页签、原单任务兼容与趴猫弹窗；390×844、320×568 宽度均无横向溢出。真实手机和系统减少动态效果设置未实测；本次未重跑后端 Python/SQLite 套件，因未改动后端。未安装依赖、未发布或上传。
