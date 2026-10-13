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

v0.2.0 使用 electron-builder 26.15.3（MIT，https://github.com/electron-userland/electron-builder）构建独立 Mac/Windows 应用；安装包同时保留 Node 依赖及其原始通知，包括 Sharp 原生二进制和 libvips 等间接组件的许可；如改为捆绑本机工具，也必须单独核对该构建的分发要求。

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

## 本次新增离线转换依赖

| 依赖 | 锁定版本 | 用途 | 许可 |
| --- | --- | --- | --- |
| @lingo-reader/mobi-parser | 0.4.6 | MOBI/KF8 读取 | MIT |
| @miconvert/ofd-to-pdf | 0.2.3 | OFD→PDF | Apache-2.0 |
| fast-xml-parser | 5.11.2 | XML 解析与验证 | MIT |
| js-yaml | 5.4.3 | YAML 安全结构解析 | MIT |
| mammoth | 1.13.0 | Word→HTML / 文本 | BSD-2-Clause |
| pdf-lib | 1.17.1 | PDF 合并、拆分、图片嵌入 | MIT |
| pdfjs-dist | 6.4.299 | PDF 文字与坐标读取 | Apache-2.0 |
| sanitize-html | 2.18.0 | HTML 清理 | MIT |
| turndown | 7.2.4 | HTML→Markdown | MIT |
| turndown-plugin-gfm | 1.0.2 | Markdown 表格规则 | MIT |
| yauzl | 3.4.0 | 有大小限制的 ZIP 读取 | MIT |
| yazl | 3.3.1 | ZIP 与 EPUB 写入 | MIT |

Pandoc（GPL 系列）、qpdf（Apache-2.0）、JPEG XL（BSD-3-Clause）、LibRaw（LGPL-2.1/CDDL-1.0）、Tesseract（Apache-2.0）和其语言模型均在本机单独安装，不随本仓库打包。Noto Sans CJK 简体常规字体采用 SIL OFL-1.1，字体和完整 OFL 位于 `assets/conversion-fonts/`；并非本项目自制字体。

Word→Markdown 优先调用 Pandoc 保留数学公式与代码；不含 Pandoc 时保留 Mammoth/Turndown 路线并提示复杂对象损失。OFD 转换在独立 Node 子进程运行，避免该依赖的全局字体注册状态影响后续文件。`fast-xml-parser` 全部统一为 5.11.2；Mammoth 仅命令行前端使用的 argparse 升级为 3.0.2，项目调用的是 Mammoth 的库 API。原始依赖通知位于以上许可副本中。

## 可选 Mac 扫描表格引擎

- [PaddlePaddle](https://github.com/PaddlePaddle/Paddle) 3.3.1、[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) 3.7.0、[PaddleX](https://github.com/PaddlePaddle/PaddleX) 3.7.2 的代码使用 Apache-2.0。原始许可副本位于 `licenses/format-dependencies/paddle*/`；独立 Python 环境保留所安装组件各自的许可，不能将其整体视为本项目 MIT。
- `src/pdf-structure.py` 独立调用本机 CPU pipeline；`scripts/setup-pdf-structure.cjs` 安装并验证本机环境，不捆绑或复制其引擎源码。主要组件版本固定，pip 解析的间接依赖由安装环境记录。
- 使用官方 BOS 发布的 PicoDet_layout_1x_table、PP-LCNet_x1_0_table_cls、SLANet_plus、RT-DETR-L 两个表格检测模型和 PP-OCRv5 mobile det/rec。官方地址、长度和 SHA-256 在 `scripts/pdf-structure-models.json`，下载来源见 [PaddleOCR 表格管线说明](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/table_recognition_v2.html)。模型与 Python 环境不随公开仓库分发，也不重标为项目 MIT；未来打包模型时应单独核对其分发条款。
- 本机结构识别是 Mac 替代实现，没有使用 FlyingMouse 的 Windows 结构引擎。验证三列与合并表头不代表所有复杂版式达到同等恢复质量。

Windows 的 HEIC 解码可调用用户单独安装的 ImageMagick（https://github.com/ImageMagick/ImageMagick，ImageMagick 原始许可，及其 libheif 等组件许可），不随本仓库或安装包捆绑。ZIP 与 Word/Office 内容检查改用已有 yauzl/yazl，实现不依赖 Mac unzip/ditto。electron-builder 及间接构建依赖不随应用打包；Windows 快捷方式由 NSIS 安装器生成，未移植 HotKey 的 Mac 代码。
