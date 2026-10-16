# 来源与配套资源

本文记录知拾（仓库名 Xchajian）的来源关系与安装依据。整理日期：2026-10-16，整合版本以本地 NOTICE、许可文件和锁文件为准。上游后续变化不自动等于本仓库已升级。

## 代码来源

| 项目 | 本地基线与范围 | 可核对的材料 |
| --- | --- | --- |
| XClipper | package/manifest基础版本2.8.4；X解析、导出、批量、媒体、基础Obsidian接口 | [上游](https://github.com/zendegani/XClipper)、[本地根许可](../LICENSE.md) |
| 渡口 dukou | 3.3.0，提交`9c530a3c5f469349e45641456fe8b4bf9a257219`；稿件库、适配器、飞书、Node桥 | [固定提交](https://github.com/alchaincyf/dukou/tree/9c530a3c5f469349e45641456fe8b4bf9a257219)、[本地NOTICE](../src/dukou/NOTICE.md)、[MIT](../src/dukou/LICENSE)、[桥MIT](../tools/dukou/LICENSE) |
| x-follower-lens | 0.2.3，提交`ccb66fbf8fb0d34fa77494d406dcebd72cbb646a`；统计解析与徽标基础 | [固定提交](https://github.com/yaohongan/x-follower-lens/tree/ccb66fbf8fb0d34fa77494d406dcebd72cbb646a)、[本地NOTICE](../src/lens/NOTICE.md)、[MIT](../src/lens/LICENSE) |
| XpandMax | 0.9.4，提交`c28279214295bdae52b325a07d28c817c1994542`；关注模块的等待与原生菜单流程，已针对知拾适配 | [固定源码](https://github.com/yiren-ai/xpandmax/blob/c28279214295bdae52b325a07d28c817c1994542/extension/follow.js)、[本地实现](../src/lens/xpandmax-follow.js)、[NOTICE](../src/lens/NOTICE.md)、[MIT](../src/lens/XPANDMAX-LICENSE) |
| JSZip | 渡口随附 3.10.1，按 MIT 使用 | [仓库](https://github.com/Stuk/jszip)、[保留文件头声明的源码](../src/dukou/jszip.min.js) |
| pako | 嵌入渡口随附的 JSZip，未作为独立包升级 | [仓库](https://github.com/nodeca/pako)、同一 JSZip 文件中的声明；以随附实现与声明为准 |

上游渡口README的状态字段与整合时扩展版本字段可能不一致，此处按本地NOTICE记录整合基线；不把上游当前README中的能力一概当成已合入。

XClipper 的基线只有 2.8.4 版本记录，未记录唯一上游提交；此处不补造提交号。渡口和粉丝透镜的固定提交链接用于追溯整合来源，不代表当前上游分支。

### 整合范围与本地适配

| 模块 | 主要复用位置 | 本整合版的改动 |
| --- | --- | --- |
| XClipper | `src/content`、`src/ast`、`src/graphql`、`src/background`、`src/shared` | 页面保存/复制/导出入口、目录授权静默保存、评论归档去重、24 小时时间；弹窗改为统一设置 |
| 渡口 | `src/dukou`、`tools/dukou` | 稿件库及平台适配、本地桥；后台和权限适配、路径调整、错误反馈；CLI 使用 `.cjs` |
| 粉丝透镜 | `src/lens`、`src/popup/lens-settings.ts` | 被动读取已加载数据、中文解释卡片、历史与设置校验；配置合入主弹窗 |
| XpandMax 关注 | `src/lens/xpandmax-follow.js`、`src/lens/follow-control.js` | 以 DOM 变化等待菜单、支持取消及页面离开清理；对接现有成功响应，保留隐藏卡片与准确账号保护；未整合其余功能 |

扩展页面不再显示上游更新日志、问题反馈、商店评分、来源跳转及上游 skill 安装链接。文档中的出处、LICENSE / NOTICE 和第三方代码原有声明继续保留；构建同时复制根 LICENSE 到 `dist` / `dist-firefox`。这项界面精简不修改原文、稿件里的链接，不阻断目标平台编辑器、媒体请求或 API。

## 开发依赖

以下来自 [package.json](../package.json) 的直接开发依赖；完整版本树见 [package-lock.json](../package-lock.json)。这些工具用于构建、类型检查和本地验证，不要求用户另装同名浏览器插件。

| 软件包 | 源仓库 | 用途 |
| --- | --- | --- |
| `esbuild` | [evanw/esbuild](https://github.com/evanw/esbuild) | 打包脚本 |
| `typescript` | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | 类型检查 |
| `vitest` | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) | 本地测试 |
| `jsdom` | [jsdom/jsdom](https://github.com/jsdom/jsdom) | DOM 测试环境 |
| `puppeteer-core`、`@puppeteer/browsers` | [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) | 隔离浏览器验收、截图 |
| `@types/chrome`、`@types/jsdom` | [DefinitelyTyped/DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) | 类型声明 |

本表不是全部传递依赖的许可证清单；再分发依赖时应同时保留对应软件包自带的许可文件。

## 配套设计与改动的归属

智库模板、建库脚本、集中确认协议最初在本项目配套的“搭建 X 智库结构与索引”工作中形成；保存路径和作者归档在“排查保存到 Obsidian 无响应”工作中演进。当前公开仓库把相关可复用结果整理成完整文档和空白资产，不依赖读者访问私人对话，也不发布对话导出、真实素材或用户凭据。

- [obsidian-content-vault](../.agents/skills/obsidian-content-vault/SKILL.md)：本项目配套技能。包含32篇空白结构文档、8个模板、4套任务提示词及Python建库脚本；不是Obsidian官方插件，也不是三项上游项目的一部分。
- [xchajian-dukou](../.agents/skills/xchajian-dukou/SKILL.md)：为当前仓库CLI编写的技能说明，复用本地工具，不是上游Claude Code skill原文复制。上游的终端桥/CLI代码仍保留MIT许可。
- 当前保存链路已由历史URI/剪贴板交接改成文件目录授权、写入关闭后读回验证。旧对话里的“继续保存”“允许唤起Obsidian”步骤仅能解释历史问题，不适用于当前安装。
- 评论相对所连接库下的`09_评论`平铺保存；个性化磁盘路径不是公共部署要求。

根许可证适用于仓库中没有另行许可声明的内容；各上游模块保留自己的声明。本说明不对第三方软件或服务另行授权，不更改根许可的非商业条件。

## 官方安装与使用依据

| 事项 | 文档 |
| --- | --- |
| Obsidian安装 | [下载页](https://obsidian.md/download) |
| 打开文件夹作为Vault | [Manage vaults](https://obsidian.md/help/manage-vaults) |
| 核心模板 | [Templates](https://obsidian.md/help/plugins/templates) |
| 核心搜索与嵌入查询 | [Search](https://obsidian.md/help/plugins/search) |
| 笔记属性 | [Properties](https://obsidian.md/help/properties) |
| Codex安装和登录 | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) |
| Codex仓库级/用户级skills | [Build skills](https://learn.chatgpt.com/docs/build-skills) |
| 飞书应用、接口与权限 | [飞书开放平台文档](https://open.feishu.cn/document/home/index) |

## 设计与文档参考

2.9.0 新 Logo 由本项目使用 OpenAI 图像生成工具制作，以交叠纸片和书签组成抽象 X 标志；原图保存在 [`assets/branding/xchajian-logo.png`](../assets/branding/xchajian-logo.png)，工具栏尺寸图保存在 `src/icons/`。该 Logo 并非上述开源项目提供的品牌资源。版本 2.9.0 是本项目的整合版本号，上游基线版本与来源记录不变。

Obsidian 是外部桌面软件；此项目不捆绑其安装包。官方 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) 只用于参考 README 的“安装 → 使用 → 开发 → 许可”结构，未复用其代码、品牌或截图，也不是本项目必装依赖。它与 XClipper 是不同项目。

弹窗布局和交互参考 Apple Human Interface Guidelines 的[布局](https://developer.apple.com/design/human-interface-guidelines/layout)和[动效](https://developer.apple.com/design/human-interface-guidelines/motion)原则，使用系统字体、圆角、留白与克制的反馈。这是视觉设计参考，不是 Apple 提供的组件或官方认证。

## 文档与验证边界

公开README按本仓库实际实现写作，优先区分“可公开复现的构建/建库步骤”“开发者本地测试记录”“需要安装者实际账户验证的流程”。历史截图标注为界面参考。AI技能文件不是后台守护程序，不会因为放进文件夹就自动执行提炼；只有用户确认的候选才可进入本人观点库。
