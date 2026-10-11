# 来源与配套资源

本文记录 Xchajian 的来源关系与安装依据。核对日期：2026-10-11。上游后续变化不自动等于本仓库已升级。

## 代码来源

| 项目 | 本地基线与范围 | 可核对的材料 |
| --- | --- | --- |
| XClipper | package/manifest基础版本2.8.4；X解析、导出、批量、媒体、基础Obsidian接口 | [上游](https://github.com/zendegani/XClipper)、[本地根许可](../LICENSE.md) |
| 渡口 dukou | 3.3.0，提交`9c530a3c5f469349e45641456fe8b4bf9a257219`；稿件库、适配器、飞书、Node桥 | [固定提交](https://github.com/alchaincyf/dukou/tree/9c530a3c5f469349e45641456fe8b4bf9a257219)、[本地NOTICE](../src/dukou/NOTICE.md)、[MIT](../src/dukou/LICENSE)、[桥MIT](../tools/dukou/LICENSE) |
| x-follower-lens | 0.2.3，提交`ccb66fbf8fb0d34fa77494d406dcebd72cbb646a`；统计解析与徽标基础 | [固定提交](https://github.com/yaohongan/x-follower-lens/tree/ccb66fbf8fb0d34fa77494d406dcebd72cbb646a)、[本地NOTICE](../src/lens/NOTICE.md)、[MIT](../src/lens/LICENSE) |
| JSZip | 渡口随附3.10.1，按MIT使用 | [保留文件头声明的源码](../src/dukou/jszip.min.js) |

上游渡口README的状态字段与整合时扩展版本字段可能不一致，此处按本地NOTICE记录整合基线；不把上游当前README中的能力一概当成已合入。

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

Obsidian是外部桌面软件；此项目不捆绑其安装包。官方[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)只用于参考README的“安装→使用→开发→许可”结构，未复用其代码、品牌或截图，也不是本项目必装依赖。它与XClipper是不同项目。

## 文档与验证边界

公开README按本仓库实际实现写作，优先区分“可公开复现的构建/建库步骤”“开发者本地测试记录”“需要安装者实际账户验证的流程”。历史截图标注为界面参考。AI技能文件不是后台守护程序，不会因为放进文件夹就自动执行提炼；只有用户确认的候选才可进入本人观点库。
