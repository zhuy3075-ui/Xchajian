# 保留模块：独立稿件页、终端桥与飞书

[返回当前插件使用教程](../README.md)

主弹窗中的稿件库、收藏当前内容、稿件分发入口已移除。本文仅记录仍随源码保留的独立模块，供需要维护已有稿件的用户查阅；不属于当前主界面教程，也不是安装插件、保存到 Obsidian 的前置步骤。不要在主弹窗中寻找下文的稿件、飞书或桥开关。真实平台登录和适配结果需自行验收。

### 稿件库与平台草稿

主弹窗已移除稿件库和当前 X 内容入库功能入口。已有稿件及可选终端桥仍保留；高级用户可在扩展管理页查看本扩展 ID，然后打开 `chrome-extension://<扩展ID>/dukou/popup.html` 访问独立稿件页，建议收藏该页。以下稿件与桥说明均针对该独立页面。

独立稿件页可粘贴微信/飞书链接采集，或导入Markdown与图片。X内容可先导出Markdown后按需导入。浏览器只能读你选择的文件：多选正文和附件，或选整个目录；图片用独占一行的相对链接。首次来源与目标站访问会申请权限，取消则不继续操作。

| 目标 | 条件 | 操作结果与需要检查的内容 |
| --- | --- | --- |
| X Articles | 登录、有文章编辑资格，点Write新建草稿 | 填入标题正文图片，检查封面与上传结果后自行发布 |
| B站专栏 | 登录并打开可用编辑器 | 检查适配结果和网站提示，自行保存/发布 |
| 公众号排版器 | `editor.huasheng.ai` | 填入Markdown，不等于发布公众号文章 |
| 飞书 | 自己的应用与权限 | 创建云文档，不属于网页草稿填入 |
| ZIP下载 | 稿件已入库 | Markdown及图片备份 |

填入结束面板约1.5秒收起，异常保留提示；收起不证明网站已保存，更不表示发布。相同稿件ID会更新库内版本，需要历史版先导出。复杂表格、嵌套结构和平台附件可能无法完整转换。[稿件说明](dukou.md)

<a id="bridge"></a>
## 可选：终端桥和稿件 skill

本地桥用于终端与浏览器稿件库交接，**Obsidian静默保存不需要它**。CLI和服务在 `tools/dukou/scripts`，只依赖Node标准库，不需单独安装依赖，也不用上游的`.js`路径。

### 启用与验证

1. 在稿件页“更多设置与使用说明”开启本地终端桥，允许访问`127.0.0.1`。
2. 保持浏览器运行。分发前在库内点对应目标按钮，完成站点授权和登录。
3. 在源码根目录运行：

```powershell
node tools/dukou/scripts/dukou.cjs ping
```

没有服务时CLI会自动后台启动，固定地址 `http://127.0.0.1:8787`。**ping只证明服务在线，不证明扩展已开启桥或取到任务。** 首次用无敏感内容的稿件只入库验证。

### 常用命令

替换实际文件、文章链接和输出目录，从源码根目录执行：

```powershell
# 只入库
node tools/dukou/scripts/dukou.cjs send 'D:\稿件\示例.md' --dest none

# 填入草稿，X仍需手动点Write
node tools/dukou/scripts/dukou.cjs send 'D:\稿件\示例.md' --dest x --autofill
node tools/dukou/scripts/dukou.cjs send 'D:\稿件\示例.md' --dest bili --autofill
node tools/dukou/scripts/dukou.cjs send 'D:\稿件\示例.md' --dest editor --autofill

# 仅支持微信fetch；替换为实际文章链接
node tools/dukou/scripts/dukou.cjs fetch 'https://mp.weixin.qq.com/s/实际文章ID' --save-to 'D:\稿件\导出'

# 默认导出最新一篇，可用 --id 指定稿件ID
node tools/dukou/scripts/dukou.cjs export --save-to 'D:\稿件\导出'
```

`send/export`默认等约90秒，`fetch`约240秒，可加`--wait 秒数`。超时先查看库内、目标草稿和输出目录，避免重复发送。启用后约每30秒同步，打开稿件页也会同步。飞书采集使用插件页面，不用fetch CLI。

Markdown首个`# 标题`或frontmatter `title`作为标题；本地图片用相对路径独占一行。可用`--title`、`--cover`覆盖标题与封面：

```markdown
---
title: 示例稿件
author: 你的署名
---

正文第一段。

![示例图片](../images/example.jpg)
```

### 让 AI 操作

在本仓库的本地AI会话中说：

```text
使用 $xchajian-dukou，把 D:\稿件\示例.md 送入稿件库，暂不分发。
```

需要分发时明确指定草稿目标。该技能读取本仓库CLI，不安装原渡口扩展，也不包含最终发布授权。

### 进程、日志与部署边界

- 不用时关闭扩展桥开关停止轮询，后台服务可能仍运行。
- 自动启动日志在系统临时目录 `xclipper-dukou-bridge.log`。
- 若希望自行管理，先手动运行 `node tools/dukou/scripts/server.cjs --dir 'D:\稿件\导出'`，用`Ctrl+C`停止。服务已由CLI启动时，先核对对应`server.cjs`进程再结束，避免关闭其他Node程序。
- 不与原渡口桥同时启用。不要仅改`DUKOU_PORT`，插件固定访问8787，端口占用应先排查。
- 桥信任本机终端和扩展，不提供多用户认证；不部署公网、不映射容器端口、不作为云API。

协议与限制见[本地桥说明](../tools/dukou/README.md)。

<a id="feishu"></a>
## 可选：飞书配置

不用飞书可跳过，其他功能不需要飞书密钥。

1. 在[飞书开放平台](https://open.feishu.cn/)管理自己的应用。
2. 按需要配置文档读写、素材上传下载和协作者权限。上游基础scope为`docx:document`、`drive:drive`、`docs:permission.member:create`；wiki还需核对知识库访问范围与节点接口权限，不能只填密钥就视为齐备。[上游说明](https://github.com/alchaincyf/dukou)
3. 按租户要求发布/启用应用并取得管理员批准，确保应用能访问待采集文档。
4. 在稿件页填写自己的`app_id`、`app_secret`、用于授予编辑权限的`open_id`并保存。
5. 先测试无敏感内容文档的读取，再测试创建，分别检查正文、图片和本人编辑权限。

凭据保存在扩展本地存储，**未加密**。不要在共享浏览器保存高权限密钥，不要提交GitHub或放入截图/笔记；清空保存可移除配置。凭据获取和实际权限以[飞书官方文档](https://open.feishu.cn/document/home/index)为准。

读取主要支持文本类块和图片，表格、画板、附件不保证转换。创建后图片或权限失败可能已留下部分文档，先打开报告链接，重试可能新建另一份。真实租户流程需安装者验收。
