<!-- readme-skill:begin hero -->
# P9_Tampermonkey

[English](README.md) · [简体中文](README.zh-CN.md)

供 P9 内部使用的 Tampermonkey 用户脚本集合。每个脚本放在独立文件夹中，分别安装、启用和更新。默认英文文档为 `README.md`，简体中文版为 `README.zh-CN.md`。
<!-- readme-skill:end hero -->

<!-- readme-skill:begin scripts -->
## 脚本目录

| 脚本 | 版本 | 用途 | 安装 | 说明 |
| --- | --- | --- | --- | --- |
| P9 Royal Mail CSV Processor | 1.1.1 | 在 Royal Mail Click & Drop 页面处理 Cardmarket CSV，生成邮寄服务、订单 reference 和 SKU | [安装脚本](https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/royal-mail-csv/royal-mail-csv.user.js) | [English](royal-mail-csv/README.md) · [简体中文](royal-mail-csv/README.zh-CN.md) |
| P9 Order Tools for TCG PowerTools | 1.1.2 | 读取 Royal Mail 面单 PDF，通过 Cardmarket ID 和 PID 匹配并填写 tracking，原生保存后自动刷新订单 | [安装脚本](https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/tcgpowertools-tracking/tcgpowertools-royal-mail-tracking.user.js) | [English](tcgpowertools-tracking/README.md) · [简体中文](tcgpowertools-tracking/README.zh-CN.md) |
| TCG PowerTools - Stay on Legacy App | 1.0.2 | 阻止旧版 TCG PowerTools 页面跳转到新版的 login-redirect 入口 | [安装脚本](https://raw.githubusercontent.com/tjx0726/P9_Tampermonkey/main/tcgpowertools-block-redirect/tcgpowertools-stay-on-legacy.user.js) | [English](tcgpowertools-block-redirect/README.md) · [简体中文](tcgpowertools-block-redirect/README.zh-CN.md) |
<!-- readme-skill:end scripts -->

<!-- readme-skill:begin installation -->
## 安装与更新

1. 在浏览器中安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击上方对应脚本的「安装脚本」链接，在 Tampermonkey 页面确认安装。
3. 刷新脚本适用的网页，按该脚本的使用说明操作。

已有手动粘贴或从本地地址安装、没有更新来源的脚本时，需要通过上方对应链接安装一次本仓库版本，以保存更新地址。若提示更新现有脚本，确认更新；安装后检查每个脚本只保留一个启用的副本。

每个脚本的 `@updateURL` 和 `@downloadURL` 指向本仓库 `main` 分支中自己的文件。Tampermonkey 按本地检查周期比较 `@version`，并根据「自动安装」设置处理新版。请在 Tampermonkey 中启用更新检查，并按需要启用自动安装。

```mermaid
flowchart TD
    A[选择所需脚本] --> B[通过 Raw 链接安装]
    B --> C[刷新适用网页并使用]
    C --> D[Tampermonkey 定期检查版本]
    D --> E[按本地设置安装新版]
```
<!-- readme-skill:end installation -->

<!-- readme-skill:begin migration -->
## 从旧仓库迁移 TCG PowerTools 脚本

[旧仓库](https://github.com/tjx0726/tcgpowertools-block-redirect) 保留原始文件路径，并提供迁移版本 **1.0.2**。旧安装仍可从旧地址检查更新；安装新版后，更新地址会切换到本仓库，之后只需维护这里的脚本。

脚本名称和 namespace 保持不变。迁移要求旧安装具有有效的更新来源，且 Tampermonkey 允许更新；自动安装还取决于本地设置。没有更新来源的手动副本，需要点击上方链接安装一次。可在 Tampermonkey 中手动检查更新，安装后确认版本至少为 `1.0.2`，更新地址包含 `P9_Tampermonkey/main/tcgpowertools-block-redirect/`。
<!-- readme-skill:end migration -->

<!-- readme-skill:begin structure -->
## 文件结构

```text
P9_Tampermonkey/
├── .agents/
│   └── .gitkeep
├── AGENTS.md
├── README.md
├── README.zh-CN.md
├── CHANGELOG.md
├── royal-mail-csv/
│   ├── README.md
│   ├── README.zh-CN.md
│   ├── royal-mail-csv.user.js
│   ├── package.json
│   └── test/
│       ├── rules.test.cjs
│       └── fixtures/
│           └── orders.csv
├── tcgpowertools-block-redirect/
│   ├── README.md
│   ├── README.zh-CN.md
│   └── tcgpowertools-stay-on-legacy.user.js
└── tcgpowertools-tracking/
    ├── README.md
    ├── README.zh-CN.md
    ├── tcgpowertools-royal-mail-tracking.user.js
    ├── package.json
    └── test/
        ├── importer.test.cjs
        ├── refresh.test.cjs
        └── pdf-sample.test.cjs
```

`orders.csv` 是虚构的测试数据。实际订单、处理结果、浏览器截图和凭据不应提交到此公开仓库。
<!-- readme-skill:end structure -->

<!-- readme-skill:begin maintenance -->
## 维护与新增脚本

- 每个脚本使用独立文件夹，包含自己的 `.user.js`、英文 `README.md` 和所需配套文件。中文 `README.zh-CN.md` 可选；提供时应与英文说明同步维护。
- 发布改动时提高该脚本的 `@version`；有 `package.json` 时同步版本号。
- 保持更新地址中的文件路径稳定，并指向 `main` 分支。
- 提交前执行该脚本的本地检查，更新上方目录和根目录 [CHANGELOG](CHANGELOG.md)。
- 新增到仓库的脚本需要用户单独安装一次。

Royal Mail CSV 脚本的本地检查：

```sh
cd royal-mail-csv
npm run check
npm test
```

Tracking 脚本的本地检查：

```sh
cd tcgpowertools-tracking
npm run check
npm test
```

单元测试使用 Node.js 内置测试运行器，无需安装 npm 依赖。Tracking 脚本的可选 PDF 集成检查需要本地 PDF.js 模块和私有 PDF/预期结果文件，详见其说明。安装和使用脚本本身无需 Node.js 或构建步骤。
<!-- readme-skill:end maintenance -->
