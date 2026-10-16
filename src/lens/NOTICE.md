# 粉丝透镜集成说明

上游：https://github.com/yaohongan/x-follower-lens
版本：0.2.3，提交 ccb66fbf8fb0d34fa77494d406dcebd72cbb646a（2026-10-10 下载）。
原作者：虹安同学；MIT 许可全文见 LICENSE。

parse.js、content.js、content.css 基于上游修改；新增设置校验、缓存限制、键盘详情、DOM 复用修正、串行后台历史和清理代次。设置现已合并到主插件弹窗，旧独立设置页已移除。inject.js 重写为有界被动拦截，不主动发起 X 请求。仅启用现有 x.com 权限，Twitter 旧域名请使用 x.com。没有沿用上游品牌图形。

默认关闭历史采样和列表淡化，标签为规则描述，不鉴定真实性。Firefox 构建要求 128+。本许可只适用于上游 MIT 代码，不替代项目根许可。

## XpandMax 关注模块

`xpandmax-follow.js` 派生自 [yiren-ai/xpandmax](https://github.com/yiren-ai/xpandmax) 0.9.4 的 `extension/follow.js`，固定提交 `c28279214295bdae52b325a07d28c817c1994542`。Copyright (c) 2026 yiren-ai；MIT 全文见 `XPANDMAX-LICENSE`，Chrome/Firefox 构建均附带该文件。

复用 `waitFor` 的 MutationObserver 等待机制，以及 `start` 的原生菜单、AbortController 和页面离开清理流程。为知拾适配为 ES 模块，沿用本项目按钮、单次操作锁及成功响应桥；保留账号列表原生按钮支持。补充展开属性监听、延迟菜单项等待、Esc 取消、可见弹层过滤、隐藏粉丝卡兼容、精确目标及替换菜单保护。粉丝数据刷新时暂时保留同一账号的处理中按钮，避免本插件自己的重绘中断关注。不会仅凭菜单出现“取消关注”就报告成功。

未知关注状态与已屏蔽账号不提供关注操作；已关注/已请求仍保留知拾禁用状态展示。未导入 XpandMax 的完整数据桥、翻译、简介、沉浸浏览、品牌资源或全局对象。
