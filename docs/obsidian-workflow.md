# 可选：Obsidian 建库与 AI 整理

[返回当前插件使用教程](../README.md)

这是配套文件工作流，不是插件弹窗内置功能。已有 Obsidian 仓库可直接在插件中连接，无需运行建库脚本。只有需要空白模板或 AI 整理时才按本文配置。命令从 Xchajian 源码根目录执行。

<a id="vault"></a>
## 创建空白智库

### 1. 安装 Obsidian

从[官方下载页](https://obsidian.md/download)安装桌面版。Vault 本质是本地文件夹，不是 GitHub 仓库，也不是浏览器稿件库。[官方说明](https://obsidian.md/help/manage-vaults)

### 2. 用随仓脚本建立空白结构

从 Xchajian 源码根目录运行，先修改路径和库名，首次建议选一个新目录：

```powershell
$vaultPath = 'D:\Knowledge\我的智库'
$vaultName = '我的智库'
$createdDate = Get-Date -Format 'yyyy-MM-dd'
$initScript = '.agents/skills/obsidian-content-vault/scripts/init_vault.py'

# 只预览，不写入
python $initScript --vault $vaultPath --name $vaultName --date $createdDate
if ($LASTEXITCODE -ne 0) { throw '预览发现错误或冲突，停止创建' }

# 创建并预设模板目录
python $initScript --vault $vaultPath --name $vaultName --date $createdDate --apply --configure-templates
if ($LASTEXITCODE -ne 0) { throw '建库未完成，请检查报告' }

# 只验证结构与双链
python $initScript --vault $vaultPath --verify
if ($LASTEXITCODE -ne 0) { throw '结构检查未通过，请检查报告' }
```

Windows 若只提供 `py`，将 `python` 改为 `py -3`，先确认版本至少 3.10。脚本不安装 Obsidian、AI 工具或社区插件。

默认生成14个功能目录、收件箱的两个子目录、32篇 Markdown、8个模板、4套任务提示词及可选模板配置。以实际报告为准；成功时 `verification.errors` 为空，退出码为0。

已有库可先预览。脚本不覆盖同名不同内容，遇到冲突在写入前以退出码2停止；不要清空原库，先读差异再按需合并。重复创建用相同名称与日期；日常检查使用 `--verify`，不要每天重新初始化。

### 3. 打开仓库与核心功能

在 Obsidian 选择“打开文件夹作为仓库 / Open folder as vault”，指向上面的目录，打开 `VAULT_INDEX.md` 并加入书签。在“设置 → 核心插件”确认搜索与模板可用，模板目录设为 `90_模板`。[模板说明](https://obsidian.md/help/plugins/templates)

**无需 Dataview、Templater 或 Local REST API，也不必为此关闭受限模式。** `--configure-templates` 只新增缺失的 `.obsidian/templates.json`，不会启用插件或覆盖现有设置；已有配置保留时手动核对模板目录。

### 4. 目录用途

```text
我的智库/
├─ VAULT_INDEX.md                 首页
├─ 00_导航/                      使用规则、集中确认清单、处理台账
├─ 01_收件箱/
│  ├─ 原始素材/                  其他待整理来源
│  └─ AI待确认/                  AI提炼与候选观点
├─ 02_X素材/                     主帖和文章，可按作者分目录
├─ 03_提炼卡片/                  已确认采用的摘要、案例和方法
├─ 04_观点库/                    本人明确认同的判断
├─ 05_思考日志/                  疑问、联想和判断变化
├─ 06_主题地图/                  跨素材双链组织
├─ 07_创作工作台/                选题、提纲与草稿
├─ 08_博主档案/                  有实际样本依据的作者观察
├─ 09_评论/                      单条评论平铺保存
├─ 90_模板/                      8种笔记模板
├─ 91_AI工作流/                  归档协议、4套任务提示词
├─ 98_附件/                      自己整理的附件
└─ 99_归档/                      暂不使用的资料
```

**检查点：** 首页能进入 X 素材、评论和集中确认清单。空库显示空列表正常；模板不会预填真实素材或虚构个人观点。

<a id="skills"></a>
## 安装与使用 AI skills

### 1. 配套技能与安装位置

| Skill | 仓库资源 | 用途 |
| --- | --- | --- |
| `obsidian-content-vault` | [SKILL.md](../.agents/skills/obsidian-content-vault/SKILL.md) | 建库、处理新增素材、集中确认、正式入档 |
| `xchajian-dukou` | [SKILL.md](../.agents/skills/xchajian-dukou/SKILL.md) | 通过本仓库CLI送稿/取稿，按请求填入草稿 |

第一个来自配套智库搭建工作；第二个是本仓库 `.cjs` CLI 的使用适配。开发时使用过的代码审查、Git管理等技能不是最终用户依赖，不必全部安装。粉丝透镜不需要AI；本方案不要求Scweet/MCP或额外X抓取服务。

先按[Codex官方指引](https://learn.chatgpt.com/docs/codex/cli)安装并登录。桌面用户将 **Xchajian源码目录**作为本地项目打开；CLI用户在该目录运行 `codex`。不用把模型Key填到扩展里。

Codex支持仓库 `.agents/skills` 与用户 `~/.agents/skills`。本仓库已放置前者，新建本地会话后查看技能列表或直接用 `$obsidian-content-vault` 调用。[官方技能目录说明](https://learn.chatgpt.com/docs/build-skills)

第一次这样说，替换路径：

```text
使用 $obsidian-content-vault。
目标库是 D:\Knowledge\我的智库，已经建好结构。
读取首页、归档协议和集中确认清单，检查能否读取与写入。
不要重新建库、移动原文或安装其他插件。
```

库在代码目录外时，按AI工具自身流程把它加入可访问范围。**发现skill不等于拥有文件权限**，不要全局关闭权限控制来排错。

### 2. 需要跨项目使用时（可选）

默认仓库级方式已够用。若要从素材库目录启动Codex，可以把自包含的素材库技能复制到用户技能目录。从源码根目录运行；已有同名技能会停止，保留你的定制版本：

```powershell
$skillSource = Join-Path (Get-Location) '.agents/skills/obsidian-content-vault'
$skillHome = Join-Path $HOME '.agents/skills'
$skillTarget = Join-Path $skillHome 'obsidian-content-vault'
if (Test-Path -LiteralPath $skillTarget) { throw '同名技能已存在，请先比较版本' }
New-Item -ItemType Directory -Path $skillHome -Force | Out-Null
Copy-Item -LiteralPath $skillSource -Destination $skillTarget -Recurse
```

重新打开会话。避免同一项目同时维护多个同名skill；旧环境已有 `~/.codex/skills` 版本时，先核对实际发现位置。`xchajian-dukou`依赖仓库工具，推荐留在仓库；全局使用须明确源码实际路径。

其他AI工具可按自身官方技能机制加载，或要求它读取 `SKILL.md`。只有聊天、没有文件工具的AI无法自动落盘、计算真实文件哈希或移动卡片。本项目未预装Obsidian Copilot/Text Generator，也未提供其专用适配。

### 3. 日常使用：两句话与一次集中确认

**第一句：处理新增素材。**

```text
使用 $obsidian-content-vault，处理 D:\Knowledge\我的智库 中的新增素材。
先处理最多10篇；提炼结果自动保存到AI待确认，更新集中确认清单。
保留原文，不把AI候选标为我的观点。
```

AI扫描 `02_X素材`、`09_评论`、`01_收件箱/原始素材`，排除索引，按来源和实际内容去重，默认每批最多10篇。结果保存到 `01_收件箱/AI待确认`；清单附摘要、来源、缺口、候选及来源的真实SHA-256。没有新增或可复用点时不制造空卡片。

**在Obsidian打开 `00_导航/集中确认清单.md`，集中审阅：**

| 操作 | 批准的含义 | 目标 |
| --- | --- | --- |
| 保留提炼并入档 | 卡片有保留价值，不表示认同作者全部主张 | `03_提炼卡片` |
| 认同此观点并入档 | 明确认同这一条判断，可作为本人观点 | `04_观点库` |
| 写修改意见或不勾选 | 暂不批准 | 保持待确认 |
| 标为退回 | 不采用，保留理由 | 不自动删除 |

**第二句：处理已确认项。**

```text
使用 $obsidian-content-vault，处理 D:\Knowledge\我的智库 中已确认的项目。
核对候选和来源版本，仅将我在集中确认清单批准的内容入档。
更新属性、受影响的双链与台账，不移动或删除原文。
```

确认后文件变化会暂停该项，不能用旧勾选批准新内容。实际落盘和链接更新成功才算完成；“采用卡片”与“事实已经外部核验”是不同状态。

**当前是“发指令后批量执行”。** 导入文件、打开Obsidian或勾选清单不会启动后台任务；没有默认计划任务、监听器或自动发布。要接其他执行器需单独验证文件权限、触发方式和确认边界。

### 4. 模板和工作流

8种模板是X素材、X评论、提炼卡片、个人观点、思考日志、主题地图、创作选题、博主档案。原始剪藏无需逐篇套中文模板。

4套任务提示词在 `91_AI工作流`：单篇提炼、确认后入档、跨素材综合、批量新增处理。先读 `AI归档协议.md`。有文件读写能力的Obsidian AI插件可复用协议，但需要自己配置模型与读取范围；文件存在不等于插件已接入。
