# 建库脚本

要求 Python 3.10 或以上，仅使用标准库。命令从技能根目录执行，或将脚本路径换成绝对路径。

```text
python scripts/init_vault.py --vault <绝对路径> --name <名称> --date YYYY-MM-DD
python scripts/init_vault.py --vault <绝对路径> --name <名称> --date YYYY-MM-DD --apply --configure-templates
python scripts/init_vault.py --vault <绝对路径> --verify
```

- 默认只预览，不创建目录或文件。路径必须为绝对路径。
- `--apply` 才执行排他创建；已有同内容文件不重复写入，不同内容先报告冲突并以状态码 2 退出，整个预检阶段不写文件。
- `--date` 是当前会话日期，创建时必填；再次执行相同命令可验证幂等性。日期或名称变动造成的冲突必须按已有库维护处理，不强行重建。
- `--configure-templates` 仅新增 `.obsidian/templates.json`。已有配置一律保留，结果报告是否指向本技能的模板目录。不会写 core-plugins.json、workspace.json、账号信息。
- `--verify` 不写入、不需要名称或日期；只验证随附资产对应的文档及其目标链接，不审计全库或外部网页。它不能证明原文件未经其他程序修改。
- 脚本报告包括已创建文件、保留的相同文件、冲突、配置状态、检查错误和未验证项目。创建期间出现竞争或写入错误时返回非零并报告已写入清单，不自动删除它们。
- 遇到目标目录内的符号链接或重解析点时拒绝写入，避免目录跳转到预期范围之外。仓库根路径可由调用者明确选定并解析。
- 双链验证依赖资产和实际目标，默认不使用模糊文件名查找；接入已有资料时优先填写库内完整相对路径。

## 文档适配后的检查

运行 `--verify`；除此以外复核查询中的路径与属性、提示词中的入档目录和主题链接。模板日期变量由 Obsidian 插入时替换，生成的普通文档不应含构建占位符。没有界面访问能力时说明界面未测试。

官方功能依据：[模板](https://obsidian.md/help/plugins/templates)、[搜索](https://obsidian.md/help/plugins/search)、[属性](https://obsidian.md/help/properties)。
