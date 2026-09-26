# 素材来源

- `recorder-cases-concept.png`：来自用户指定的录音豆外壳任务最终版 `exec-42e90d3c-a5f5-40ce-8f1b-c1862aa6d327.png`，完整复制原图。产品落地页通过 CSS 取景显示三款，原图文件未修改；外观图不是量产或实物验证证明。

- `cat.png`：来自 `output/design/bracket-cat-user-original.png`，即用户最后指定直接复制的原创括号猫。仅裁去空白并提取透明背景，未重新生成或修改五官、花纹、动作。
- `dog.png`：来自用户原创斑点狗文件 `da0c3d780f4d240cdbbb2e2335472cff.png`，仅提取原图，保留所有独立笔画。
- `fox.png`：用户提供的 `cb1adc9a2716ed8023679787a02d9b45.png` 原文件，未重画、未修改像素。放在「注意」页标题右侧，与猫狗使用相同的标题布局；通过 SVG 显示窗口隐藏画布外围空白，通过混合模式融入便签底色。
- `popup-cat.png`：旧版弹窗猫，保留素材；当前弹窗改用下述趴猫。
- `index.html` 中的 `#task-cat-art`：按用户 2026-09-26 草图用内联 SVG 路径绘制的四种小豆丁猫，保留黑色线条、红项圈、黄色铃铛。用于点击黄点后的滚出动画；属于参考草图重绘，并非原图裁切。
- `index.html` 中的 `.popup-cat`：按同张草图右侧绘制的趴猫，翘尾巴、前爪搭住录音弹窗的上边缘。内联 SVG 可随 HTML 离线分享，无额外素材请求。
- `title.png`、`content-heading.png`、`pending-heading.png`：从定稿 `output/design/joined-gradient-notes-original-cat-v1.png` 提取的固定展示标题字形，均有对应中文替代文本。动态正文、输入框、按钮和其他标题为真实 HTML 文本；正文使用设备字体，未下载字体依赖。

这些素材仅用于本私有项目。页面原有标题猫和问号狗继续使用原图；本次新增的猫为 SVG 路径绘制，没有使用生图模型。

## 落地页流程图小猫（2026-09-26）

`landing-cats-original.png` 是用户本次提供的 `189a17464b0d0481079db0e318290f45.png` 完整原文件，2800×1840；未重画、未改动像素。`landing.html` 使用四个 SVG viewBox 分别取景右侧跳跃、抱鱼、坐姿、翘尾四只猫，显示在流程节点 1、3、4、6。黑线白底通过混合模式融入页面。现行落地页不再引用 `recorder-cases-concept.png`，该素材仅保留历史版本使用。
