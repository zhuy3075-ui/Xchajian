# 粉丝透镜集成说明

上游：https://github.com/yaohongan/x-follower-lens
版本：0.2.3，提交 ccb66fbf8fb0d34fa77494d406dcebd72cbb646a（2026-10-10 下载）。
原作者：虹安同学；MIT 许可全文见 LICENSE。

parse.js、content.js、content.css 基于上游修改；新增独立设置页、验证设置、缓存限制、键盘详情、DOM 复用修正、串行后台历史和清理代次。inject.js 重写为有界被动拦截，不主动发起 X 请求。仅启用现有 x.com 权限，Twitter 旧域名请使用 x.com。没有沿用上游品牌图形。

默认关闭历史采样和列表淡化，标签为规则描述，不鉴定真实性。Firefox 构建要求 128+。本许可只适用于上游 MIT 代码，不替代项目根许可。
