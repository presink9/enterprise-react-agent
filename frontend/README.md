# 企业财税助手 · React 交互原型

独立运行的中文知识问答工作台。**全部回答、引用和执行进度都是本地演示，不连接 Python 服务、真实模型、PostgreSQL 或知识库。**

## 运行

需要 Node.js 22.12+，在项目根目录执行：

```powershell
cd frontend
npm ci
npm run dev
```

访问 <http://localhost:5173>。仅绑定回环地址，端口占用时明确报错。停止服务按 Ctrl+C。

```powershell
npm test
npm run format:check
npm run build
npm run preview
```

生产构建预览位于 <http://localhost:4173>。浏览器测试使用已安装的 Microsoft Edge：`npm run test:e2e`，会自动启动生产预览服务；请先构建。其他环境可在 Playwright 配置中选择已安装的 Chromium 通道。

## 可以体验什么

- 首屏的完整示例问答、Markdown 表格、可展开引用和执行过程。
- 新建、搜索、切换会话；内容仅保存在当前浏览器 localStorage。
- 输入框上方切换正常回答、多轮检索、无检索结果、处理超时；发送任意问题会执行**所选场景的固定脚本**，不会理解问题或访问外部服务。
- 停止当前任务、重试失败任务、复制回答。重试采用当前选择的演示场景，并保留原问题。
- 切换会话后，后台任务仍更新原会话；刷新时未完成的任务显示“已停止生成”。
- “重置演示”需确认，会清除这个原型的本地会话并恢复初始示例，不影响其他浏览器数据。
- 1440px 三栏工作区、768px 独立聊天区、390px 单栏与资料抽屉。抽屉支持 Escape 和焦点约束，输入支持中文组合输入及 Shift+Enter 换行。

## 结构与后续接入

- `src/chat/demo.ts`：所有示例会话、回答、引用、场景；内容为虚构资料，不能作为财税依据。
- `src/chat/mockService.ts`：可取消的异步事件流，约 4.5 秒完成单轮，约 8 秒完成多轮。超时也是压缩时间的模拟。
- `src/chat/types.ts`：后端现有 SSE 事件类型及本地界面状态。
- `src/chat/state.ts` / `useChat.ts`：状态转换、会话隔离、取消、重试和存储恢复。
- `src/components/`：会话导航、聊天区、引用资料与抽屉；CSS Modules 隔离组件样式。

接入真实服务时实现 `ChatService.stream` 并替换注入的模拟服务，解析 `POST /api/v1/chat/stream` 的 SSE；`message` 是完整回答，不是 token 增量。当前后端没有结构化引用或会话列表接口，不能把本地 `sourceIds` 当作后端已支持的能力。需要先定义真实引用数据契约，再替换模拟引用解析。前端不保存或发送模型 API Key。

## 设计来源

使用 [Taste Skill](https://github.com/Leonxlnx/taste-skill) 的应用界面规范，固定版本 `12af471f627f866411b4bd785b19646d3672784c`。选择 **Framed sheet**，seed `20261029`，无重抽；适合长时间阅读的企业问答工作区。

画面的问题：**这份回答给出了什么，以及依据来自哪里？**

视觉特征：雾蓝白 L 形外框、近白工作区、低饱和专业蓝引用链接与检索时间线，访客标记以少量暖中性色中和冷感。IBM Plex Sans 通过 npm 自托管，中文回退到本地系统字体。无外部字体 CDN、图片下载或远程 API 请求。

蓝色精修集中在 `styles.css` 的语义令牌和 `Workspace.module.css` 的绘制层：轻环境光、局部微噪点、蓝调浅阴影、输入框内阴影、细边缘光和标题栏轻玻璃。主色 `#365f91`、背景 `#edf3fa`、正文 `#1e304b`；圆角、间距、栅格、字号、组件位置及交互沿用原型。hover / focus / active / disabled 使用同组令牌，过渡不移动元素；支持减少动态、减少透明度及系统高对比度设置。

主题对象清单：企业问题、申请材料、审批记录、费用凭证、引用片段、文档章节、会话记录、检索轮次、处理耗时、停止与重试。桌面主回答优先，资料是稳定的辅助区域；移动端分区查看。

Skill 安装在用户目录，未将整个第三方仓库复制进本项目。复现安装可使用 Codex 的 skill-installer，参数为：

```text
--repo Leonxlnx/taste-skill --path skills/taste-skill
--ref 12af471f627f866411b4bd785b19646d3672784c --name design-taste-frontend
```

Skill 检查命令（在项目根目录，将 `<skill>` 替换为实际安装目录）：

```text
node <skill>/scripts/lint.mjs --app frontend/src
node <skill>/scripts/inspect.mjs --app http://127.0.0.1:4173 --out .taste-skill/blue-after --allow gradient,glass,shadow,button-fx
```

本地检查截图、依赖及构建产物均不提交。尚未接入真实问答，因此本原型不改变后端的模型耗时或超时行为。

验收覆盖了取消、超时重试、无结果、会话隔离、刷新恢复和重置；浏览器检查包含引用、复制、中文组合输入及移动端抽屉。1440 / 768 / 390px 的可见元素坐标与原型逐一比对，未改变布局。

用户明确要求环境光、浅阴影与轻玻璃，因此在 Taste 浏览器检查中允许 `gradient,glass,shadow,button-fx` 四项。其中 `button-fx` 仅用于纯色按钮的轻阴影、内边缘光和按下反馈；没有按钮渐变、发光动画或位移。静态 lint 不支持同名 `--allow` 参数，会报告这些定制样式；这是对其默认扁平风格的有意覆盖。浏览器检查保留 `no-data-hue` 提示：工具按类名把步骤时间线识别为统计图，但这里是离散处理状态，保留细线和蓝色状态图标。其余可访问性及布局规则继续执行。
