# 本地转换工具与第三方依赖

本次扩展独立调用下列工具和库，未复制 FlyingMouse Format 的源码、界面或品牌素材。其模块设计作为研究参考：
[LaoFeng-mouse/flyingmouse-format](https://github.com/LaoFeng-mouse/flyingmouse-format)，检查提交 `a7b9b15d32db80cecedae00e89289088656fb1ae`。
该仓库使用自定义非商用许可，本项目没有把该仓库作为运行依赖或重新打包。

| 依赖 | 本机版本 / 锁定版本 | 原始项目 | 许可 |
| --- | --- | --- | --- |
| Electron | 44.5.1 | https://github.com/electron/electron | MIT；安装包自带 Electron 及 Chromium 等组件的许可通知 |
| Node.js | 要求 22 或更新版本 | https://github.com/nodejs/node | MIT 与所包含组件的原始许可；开发者单独安装 |
| Sharp | 0.35.5 | https://github.com/lovell/sharp | Apache-2.0；含原始许可于 node_modules/sharp/LICENSE |
| ExcelJS | 4.4.0 | https://github.com/exceljs/exceljs | MIT；node_modules/exceljs/LICENSE |
| csv-parse | 7.0.3 | https://github.com/adaltas/node-csv | MIT；node_modules/csv-parse/LICENSE |
| csv-stringify | 6.9.0 | https://github.com/adaltas/node-csv | MIT；node_modules/csv-stringify/LICENSE |
| Marked | 18.0.14 | https://github.com/markedjs/marked | MIT；node_modules/marked/LICENSE |
| uuid（ExcelJS 间接依赖） | 11.1.1 | https://github.com/uuidjs/uuid | MIT；仅通过包级 override 修复已知问题，ExcelJS 使用其 v4 API |
| FFmpeg / ffprobe | Homebrew 9.0.2 | https://github.com/FFmpeg/FFmpeg | 构建许可取决于启用组件；本机安装、不随桌宠分发。当前构建许可证见 ffmpeg -L |
| Poppler | Homebrew 26.09.0 | https://poppler.freedesktop.org/ | GPL 系列许可；本机安装、不随桌宠分发 |
| LibreOffice | 本机 26.8.0.3 | https://www.libreoffice.org/ | MPL-2.0 等原始许可；沿用本机安装、不随桌宠分发 |
| sips / ditto / unzip | macOS 自带 | Apple macOS | 本机系统工具、不随桌宠分发 |

本期是读取现有项目的开发版启动入口，不生成独立安装包。未来打包时，必须同时保留 Node 依赖及其原始通知，包括 Sharp 原生二进制和 libvips 等间接组件的许可；如改为捆绑本机工具，也必须单独核对该构建的分发要求。

本次新增依赖的许可副本已另存到 licenses/format-dependencies/，包括 uuid 和 Sharp 的 darwin-arm64 二进制通知。

## 实际调用位置

| 功能 | 依赖与代码位置 |
| --- | --- |
| 窗口、IPC、系统对话框 | Electron，`src/main.cjs`、`src/preload.cjs`；Node.js 文件与子进程 API 用于主进程、转换模块和测试 |
| Word/PDF 与 Office 文件 | LibreOffice，`src/converter.cjs`、`src/formats.cjs` |
| 图片转换 | Sharp，`src/formats.cjs`；HEIC/HEIF 先调用 macOS sips |
| 音视频转换与检测 | FFmpeg / ffprobe，`src/formats.cjs` |
| 表格读取与生成 | ExcelJS、csv-parse、csv-stringify，`src/formats.cjs`；旧 XLS 经 LibreOffice 中转 |
| Markdown 转纯文本 | Marked，`src/formats.cjs` |
| PPT 逐页图片 ZIP | LibreOffice → PDF → Poppler 渲染 → macOS ditto 打包，`src/formats.cjs` |
| Office 压缩结构验证 | macOS unzip，`src/converter.cjs`、`src/formats.cjs` |

角色、点击音效和启动器的来源记录分别在 assets/dsh-pet/、assets/duck-sound/ 和 native-launcher/vendor/ 中。公开仓库不包含小黄鸭音频，音效不适用上游代码 MIT。完整功能归属见 [ATTRIBUTION.md](ATTRIBUTION.md)，许可范围见 [LICENSE-SCOPE.md](LICENSE-SCOPE.md)。
