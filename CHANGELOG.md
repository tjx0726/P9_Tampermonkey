# CHANGELOG

按脚本分别记录版本。脚本的更新判断以其头部的 `@version` 为准。

## 2026-11-19

### royal-mail-csv — 1.1.1

- 首次发布到公开仓库 `tjx0726/P9_Tampermonkey`，基于已完成的本地版本 1.1.0。
- 添加指向本仓库 `main` 分支的 `@updateURL`、`@downloadURL` 和脚本主页链接。
- 保留现有脚本名称和 namespace，便于更新已有安装。
- 保留 1.1.0 的处理逻辑：订单 reference 使用 Cardmarket `idOrder`，SKU 使用 `PID (articles)`，并保留既有过滤、地址清理和邮寄服务映射。
- 收录原有 41 项回归测试及虚构 CSV 样例。
- 添加仓库总览、安装入口、自动更新说明和独立脚本文档。
