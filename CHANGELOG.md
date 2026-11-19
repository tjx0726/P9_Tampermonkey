# CHANGELOG

按脚本分别记录版本。脚本的更新判断以其头部的 `@version` 为准。

## 2026-11-19

### tcgpowertools-tracking — 1.1.2

- 将已验证的 P9 Order Tools 收录至独立脚本目录，提供英文菜单、PDF 上传预览、tracking 批量保存和原生操作后的自动刷新设置。
- 兼容旧合并 reference 和新分离 reference/SKU 格式，正确处理 `20x PID (quantity)` 数量前缀。
- 保留脚本名称和 namespace，将主页及更新地址指向本仓库 `main` 分支；原本没有更新来源的本地副本需通过新链接安装一次。
- 添加独立中英文说明、27 项使用虚构数据的单元检查，以及两项通过私有文件运行的 PDF 集成检查。
- 不收录实际面单、订单记录、截图或针对具体账户的测试 PDF 生成器。

### tcgpowertools-block-redirect — 1.0.2

- 从独立仓库 `tjx0726/tcgpowertools-block-redirect` 收录到独立脚本文件夹。
- 将主页、`@updateURL` 和 `@downloadURL` 指向 `P9_Tampermonkey` 中的新位置。
- 将版本从 1.0.1 提高到 1.0.2，保持名称、namespace、执行范围和重定向拦截逻辑一致。
- 在旧仓库原路径保留相同的 1.0.2 迁移脚本：旧安装更新后改为跟随新仓库。
- 补充安装、迁移条件及旧地址保留要求；未配置更新来源的手动副本需一次性安装新版。

### royal-mail-csv — 1.1.1

- 首次发布到公开仓库 `tjx0726/P9_Tampermonkey`，基于已完成的本地版本 1.1.0。
- 添加指向本仓库 `main` 分支的 `@updateURL`、`@downloadURL` 和脚本主页链接。
- 保留现有脚本名称和 namespace，便于更新已有安装。
- 保留 1.1.0 的处理逻辑：订单 reference 使用 Cardmarket `idOrder`，SKU 使用 `PID (articles)`，并保留既有过滤、地址清理和邮寄服务映射。
- 收录原有 41 项回归测试及虚构 CSV 样例。
- 添加仓库总览、安装入口、自动更新说明和独立脚本文档。
