# 录音便签 · 定稿交互版

按用户确认的纸张便签图实现：中文手绘标题、原创猫狗、内容黄／待确认绿／注意红、右侧连体页签与向纸内淡出的渐变。首次入口是「课程作业安排」示例详情；已有保存的多任务示例时恢复该便签。

## 运行

无需安装第三方依赖。在仓库根目录运行：

```sh
python3 backend/server.py --port 8765 --db output/local/tasks.db
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

这是本地 Web Demo，包含原单任务示例、多任务核对流程和 SQLite 存储。首页、日程与「我的」是为详情交互配套的最小页面。本仓库已接入基于 B 新代码的 SQLite 保存/读取整合副本，但未运行真实转写、AI 推理、音频回听、录音豆同步、系统日历或通知，不是可安装 App，也未宣称比赛方案已提交。动态核对页的浏览器验证和虚构 HTTP 失败重试记录见交接文档。当前无包管理器、构建依赖或构建命令；未安装新依赖。

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
