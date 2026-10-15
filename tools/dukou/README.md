# XClipper 本地渡口桥

复用渡口 3.3.0 的零依赖本地服务和 CLI；MIT 许可见 `LICENSE`。文件改为 `.cjs`，兼容本项目的 ESM 包配置，日志改用系统临时目录，Windows 后台进程隐藏窗口。服务拒绝网页 Origin 和异常 Host，结果必须绑定已取出的任务，导出目录以原始任务为准。桥信任本机终端和已安装扩展，不提供跨用户身份验证，使用后可关闭插件开关及服务进程。

主弹窗已移除稿件入口，本桥不是当前主界面或 Obsidian 保存的安装要求。确需使用时，先按[独立稿件页说明](../../docs/optional-integrations.md)打开 `chrome-extension://<扩展ID>/dukou/popup.html`，在该页「更多设置与使用说明」勾选「启用本地终端桥」，确认浏览器对 `127.0.0.1` 的授权。桥默认关闭；关闭开关即停止轮询。目标平台首次使用应先在文章库点对应分发按钮完成该站授权。桥只填入草稿，发布请手动完成。

在本项目根目录执行：

```powershell
node tools/dukou/scripts/dukou.cjs ping
node tools/dukou/scripts/dukou.cjs send '文章.md' --dest none
node tools/dukou/scripts/dukou.cjs send '文章.md' --dest x --autofill
node tools/dukou/scripts/dukou.cjs send '文章.md' --dest bili --autofill
node tools/dukou/scripts/dukou.cjs send '文章.md' --dest editor --autofill
node tools/dukou/scripts/dukou.cjs fetch 'https://mp.weixin.qq.com/s/文章ID' --save-to 'C:\稿件'
node tools/dukou/scripts/dukou.cjs export --save-to 'C:\稿件'
```

CLI 会在调用时自动启动服务，插件启用桥后每30秒同步；打开稿件页面也会立即同步。日志位于系统临时目录的 `xclipper-dukou-bridge.log`。插件固定访问 `http://127.0.0.1:8787`，使用默认端口。

也可手动前台启动：`node tools/dukou/scripts/server.cjs --dir 'C:\稿件'`；按 Ctrl+C 停止。CLI 自动启动的桥需在任务管理器中结束对应 Node 进程。不要同时启用原渡口插件的桥，以免两个插件抢取同一队列。

Markdown：第一条 `# 标题` 或 frontmatter `title` 用作标题；支持段落、标题、列表、引用、代码、粗体、斜体和链接；图片独占一行，用相对路径引用，文件应与 Markdown 位于同一目录树。frontmatter 支持 `title`、`author`、`cover`。表格等复杂 Markdown 沿用渡口原解析限制。

协议：CLI 向 `POST /tasks` 提交 `import/fetch/export`；插件读取 `GET /tasks` 并向 `POST /results` 回传；CLI 用 `GET /result?id=...` 等待结果。
