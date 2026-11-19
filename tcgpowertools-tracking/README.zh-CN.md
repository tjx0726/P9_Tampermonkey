# P9 TCGPowerTools

[English](README.md) · [中文](README.zh-CN.md)

适用于 TCG PowerTools 的英文 Tampermonkey 工具。在旧版应用中导入 Royal Mail PDF 的 tracking，原生保存后刷新订单，并可解除库存刷新的冷却限制。已包含旧版跳转保护，且默认开启。

| 域名 | 可用功能 |
| --- | --- |
| `app.tcgpowertools.com` | Tracking 导入、库存冷却控制、原生订单刷新和旧版跳转保护 |
| `new.tcgpowertools.com` | 仅插件入口和共享设置；库存及 tracking 操作禁用 |

## 安装与更新

1. 安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开[安装脚本](https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/tcgpowertools-tracking/tcgpowertools-royal-mail-tracking.user.js)，确认安装或更新。
3. 刷新任一支持的域名，点击右下角 **P9 TCGPowerTools**。

当前版本：**1.2.0**。名称由 **P9 TCG PowerTools - Royal Mail Tracking Import** 改为现名，namespace 和更新地址保持稳定。安装改名后的脚本后，停用仍存在的旧名称 tracking 副本和独立 **TCG PowerTools - Stay on Legacy App** 脚本，只保留一个合并插件启用。没有更新来源的粘贴或本地副本需通过上方链接安装一次，之后按 Tampermonkey 本地设置从 `main` 检查更新。

## 菜单与使用

- **Add Tracking Number** 打开 PDF 导入视图。
- **Placeholder** 禁用，预留给后续功能。
- **Force Refresh Stock** 在旧版 **Your Stock** 页面调用一次站点原生刷新，冷却期内同样可用；位于其他旧版页面时会提示先打开库存页。
- **Settings** 包含共享的跳转、冷却和订单刷新设置。

选择邮寄面单 PDF，检查 PID、Cardmarket order ID、PDF tracking、当前 tracking 和匹配结果，然后勾选需要更新的订单。覆盖已有的不同 tracking 时启用 **Allow overwriting different tracking numbers**；相同值自动跳过。点击 **Add tracking to N selected orders**，按顺序保存并重新读取服务器记录验证。

**Back to Menu** 返回菜单并保留 PDF 预览；读取 PDF 或保存批次时暂时禁止切换视图和关闭窗口。

```mermaid
flowchart TD
    A[选择面单 PDF] --> B[逐页提取 reference、SKU 和 tracking]
    B --> C[匹配 Cardmarket ID 和 PID]
    C --> D[检查并选择允许更新的订单]
    D --> E[通过原生操作保存 tracking]
    E --> F[重新读取保存记录并刷新列表]
```

PDF 在本地读取。Mozilla PDF.js 5.6.205 及其 worker 按需从 jsDelivr 加载，PDF 不上传至该 CDN。保存时仅将选中订单的 ID 和 tracking number 发送至当前 TCG PowerTools 账户。

## 设置

| 设置 | 默认值 | 行为 |
| --- | --- | --- |
| **Stay on Legacy App** | 开启 | 取消旧版应用前往新版精确 `/login-redirect` 路径且可取消的导航，其他目标仍可访问。 |
| **Allow stock refresh during cooldown** | 关闭 | 旧版 **Your Stock** 页面的本地一小时计时仍有效时，解锁原生 **Refresh Stock** 控件；关闭后恢复原生禁用状态。 |
| **Automatically refresh the order list after native tracking, packed, or sent changes** | 开启 | 原生保存成功后重读订单，保留 workflow、筛选和搜索条件。 |

设置使用 Tampermonkey 的 `GM_getValue`/`GM_setValue` 保存，并在已打开的新旧域名标签页间同步。可在新版域名修改 **Stay on Legacy App**，旧版立即生效。已有本地偏好会迁移；用户脚本存储不可用时回退到本地存储。设置不会自动迁移至其他浏览器安装。

冷却开关和菜单手动操作均只调用一次原生按钮已有的 React 事件处理器，保留站点的库存转换、本地修改确认、加载视图和错误提示。不会定时刷新，也不会自动重试。请求成功不代表 Cardmarket 生成了新导出，仍可能复用缓存。按钮适配同时支持 disabled 按钮和 `aria-disabled` 菜单项；站点事件绑定发生变化时停止操作。

脚本观察成功的原生 XHR/fetch 保存操作，读取 `GET /api/user/order`，通过现有 Zustand store 的公开接口更新列表，保留当前 workflow、筛选和搜索条件。

## 匹配与保存

以下标识符均为虚构示例。

- 支持每页一个面单，兼容旧合并格式 `Customer Ref: 90001 / A17 (20) 9900000017`。
- 新分离格式从 `Customer Ref: 90001 / 9900000017`（或单独订单号）读取 Cardmarket ID，从独立 SKU `A17 (20)` 读取 PID。Royal Mail 自动添加的前缀，例如 `20x A17 (20)`，不会拼入订单号。无需打印 `SKU` 标题，PDF 内部字段绘制顺序不影响配对。
- SKU 缺失、PID/数量标记冲突或多个 reference 标题会阻止处理；不同页面之间不会交叉配对字段。
- `QM 9000 0001 9GB` 等 tracking 会规范为 `QM900000019GB`。标识符保持字符串形式，PID 的前导零会保留。
- Cardmarket ID 必须唯一匹配订单，且订单的 `pt.picking.pickingId` 必须与 PDF PID 相同；不会仅凭可能复用的 PID 查找订单。
- 缺少订单或字段、PID 不符、无文字层扫描件、多候选页面、冲突面单，以及不同订单共用 tracking 等情况会被阻止。完全重复的面单只处理第一次。
- 保存前再次检查选中订单；预览后 tracking 发生变化的订单会跳过，等待人工检查。

保存沿用原生 tracking 对话框的两个请求：

1. `PUT /api/user/order/setTrackingNumber`，内容为 `{ idOrder, trackingNumber }`。
2. `PUT /api/user/order/changeOrderProp`，内容为 `{ idOrder, prop: "trackingNumber", value }`。

第一个响应必须确认准确的订单 ID 和 tracking 后，才更新本地属性；最后通过 GET 确认本地 tracking 已保存。失败、部分成功或结果不确定时停止批次，不自动重试。导入 tracking 不更改 packed 或 sent 状态。

Cardmarket 缓存可能在保存成功后仍包含旧 tracking。脚本分别验证上游响应和本地记录，然后显示已保存的本地值，不改写服务器的 Cardmarket 缓存。

脚本在已加载的 webpack 模块中查找 store，不依赖固定模块 ID 或 React fiber。网站架构变化可能需要调整适配；找不到 store 时会在写入前停止。

## 验证

```sh
npm run check
npm test
```

测试包含 41 项无需依赖的检查和两项可选 PDF 集成检查，覆盖新旧 reference、匹配与安全保存、原生订单刷新、默认跳转保护、跨域名设置、冷却解锁及恢复、原生刷新防重复、脚本隔离、不可访问的第三方导出对象，以及与独立拦截脚本共存。

实际 PDF 和独立核对的预期记录保留在此公开仓库之外。每份预期文件为 JSON 数组，元素包含 `{ page, orderCode, cardmarketOrderId, trackingNumber, error }`。提供两份 PDF 及对应的私有预期文件，可执行全部 43 项检查：

```sh
LABEL_PDF='/private/path/combined-label.pdf' LABEL_EXPECTATIONS='/private/path/combined-expected.json' SPLIT_LABEL_PDF='/private/path/split-label.pdf' SPLIT_LABEL_EXPECTATIONS='/private/path/split-expected.json' PDFJS_MODULE='/absolute/path/to/pdfjs-dist/legacy/build/pdf.mjs' npm test
```

未提供对应 PDF 变量时跳过该集成检查。公开单元测试使用虚构标识符，不收录实际面单、账户记录、截图或针对具体账户的测试 PDF 生成器。

2026-11-19，原始五页面单和新生成的分离格式 Royal Mail 面单均通过本地 PDF.js 提取验证；在 Tabbit 和 Tampermonkey 中上传 PDF，确认英文菜单和提取字段。此前五笔订单的保存及重新读取测试结束后，已恢复原有 tracking。packed/sent 刷新通过模拟请求验证，未修改邮寄状态。

## 停用

在 Tampermonkey 中禁用或移除此脚本，再刷新页面即可移除界面和刷新钩子。

参考：[Mozilla PDF.js](https://mozilla.github.io/pdf.js/examples/)、[Tampermonkey 文档](https://www.tampermonkey.net/documentation.php)。
