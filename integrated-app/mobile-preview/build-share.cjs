'use strict';
// Produce a portable review copy using only Node's built-in libraries.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const out = path.resolve(root, '../output/share');
fs.mkdirSync(out, { recursive: true });
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const asset = file => 'data:image/png;base64,' + fs.readFileSync(path.join(root, file)).toString('base64');
let html = read('index.html');
const scripts = [];
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (_, file) => {
  scripts.push((file === 'integration/config.js'
    ? 'window.AnchorReviewConfig = Object.freeze({ confirmPath: null, tasksPath: null });'
    : read(file)).replace(/<\/script/gi, '<\\/script'));
  return '';
});
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, file) => '<style>\n' + read(file) + '\n</style>');
html = html.replace(/(src|href)="(assets\/[^"\s]+\.png)"/g, (_, attr, file) => `${attr}="${asset(file)}"`);
html = html.replace(/<title>[^<]*<\/title>/, '<title>AnchorLearn · 核对页离线演示</title>');
html = html.replace('<head>', `<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
const offline = `
// This share copy is strictly offline and has its own local demo storage.
document.querySelector('.desktop-caption')?.replaceChildren('AnchorLearn · 离线演示 · 数据仅保存在此浏览器');
for (const el of document.querySelectorAll('#home-view > button')) {
  if (el.textContent === '整理一段文字') { el.textContent = '离线演示暂不提供文字分析'; el.disabled = true; }
}
const info = document.createElement('p');
info.className = 'quiet-note';
info.textContent = '分享版已内嵌图片与程序，不连接服务器。请从下方示例体验核对和保存；数据不会同步给其他组员。';
document.querySelector('#profile-view').prepend(info);
let storedDemo = false;
try { storedDemo = Boolean(localStorage.getItem('anchorlearn.share.connected-demo.v1')); } catch {}
if (!storedDemo) {
  [...document.querySelectorAll('#profile-view button')].find(el => el.textContent === '三项任务示例')?.click();
}
`;
// Inline scripts execute in source order after all page elements exist.
html = html.replace('</body>', scripts.map(js => '<script>\n' + js.replaceAll('anchorlearn.', 'anchorlearn.share.') + '\n</script>').join('\n') + '\n<script>' + offline + '</script>\n</body>');
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"|(?:src|href)="assets\//.test(html)) throw new Error('Unbundled asset remains.');
fs.writeFileSync(path.join(out, 'AnchorLearn-demo.html'), html);
fs.writeFileSync(path.join(out, '打开说明.txt'), `AnchorLearn 核对页 · 组内离线体验版（2026-09-25）

怎么打开
1. 解压 ZIP，把 AnchorLearn-demo.html 用电脑 Chrome 或 Edge 打开。
2. 网页是独立单文件，图片和程序已包含，无需安装、开服务器或填写 API 密钥。
3. 聊天软件内的文件预览可能不运行网页程序，请先下载到电脑，再用浏览器打开。

建议体验（约 3 分钟）
1. 首次打开会显示“三项课堂任务”。点击“待确认”。
2. 修改任务名称、截止日期和要求。第三项可保留无截止日期。
3. 点击“核对并保存示例”，检查预览后确认。刷新，看结果是否保留。
4. 点击“内容”，展开原文依据，确认原话没有随修改改变。
5. 在“我的”里体验“归属待确认示例”和“无任务示例”。
6. “录音 → 课程作业安排”保留旧单任务的本地日程演示。

这次完成
保留手绘纸张、猫狗和三色页签；接入多任务展示与编辑、原文核对、确认保存、错误处理。
真实接口的保存重试逻辑已准备并使用虚构接口测试，但此分享版不连接任何服务器。

目前边界
所有内容都是示例。未接通真实转写、AI 分析、B 的数据库、手机通知或系统日历。
新增多任务保存不自动创建日程或提醒；旧示例日程单独展示。
保存仅在各自浏览器中，不会同步给其他组员，也不写回 HTML 文件。
换文件位置、换浏览器或使用无痕模式，已保存示例可能无法继续读取。
原网页已用 Chrome 检查；本单文件已检查内嵌资源与脚本语法，但浏览器工具禁止访问 file://，未能实测双击打开。
Windows 和手机真机也未验证，建议先用电脑浏览器打开；若无法操作，请反馈浏览器名称和页面现象。

请反馈
页面是否容易看懂？编辑与确认是否顺手？原话和 AI 建议是否分得清？
这是组内演示包，不是公开上线的网站。接口交接说明另附，供负责后端的组员参考。
`);
fs.copyFileSync(path.join(root, 'integration/README.md'), path.join(out, '后端接口交接.md'));
console.log(JSON.stringify({ html: path.join(out, 'AnchorLearn-demo.html'), bytes: Buffer.byteLength(html), embeddedScripts: scripts.length, externalAssets: 0 }));
