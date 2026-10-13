# 安装蓝毛小女仆

从 [GitHub Releases](https://github.com/yukino0637-stack/blue-maid-converter/releases) 下载适合系统的安装包。安装包包含 Electron、Node.js、人物动画和程序依赖，不需要另装 Node.js，也不依赖源码目录。

## macOS Apple Silicon

下载 `BlueMaid-0.2.0-macOS-arm64.dmg`，打开后将「蓝毛小女仆」拖入应用程序目录；ZIP 是同一独立应用的压缩版。适用于 Apple Silicon，包括 M 系列芯片。本版使用临时签名，没有 Apple 开发者签名或公证；系统可能要求在系统设置的「隐私与安全性」中确认打开。

现有 Command+D 后台启动器仍打开 `/Applications/蓝毛小女仆.app`。安装新版到同名路径后即可继续使用；如果那里还是旧源码入口的符号链接，请先在 Finder 核对并移走旧入口，再安装新版，不要删除项目目录。安装包不会自动修改登录启动项。

转换工具按需安装：

```bash
brew install --cask libreoffice
brew install ffmpeg poppler pandoc qpdf jpeg-xl libraw tesseract tesseract-lang
```

## Windows 10/11 x64

下载 `BlueMaid-0.2.0-Windows-x64-Setup.exe`，按安装向导选择目录，使用桌面或开始菜单快捷方式打开。本版没有 Windows 发布者签名，系统可能显示未验证发布者提示。Windows 版通过桌面快捷方式启动，不安装 Mac 的 Command+D 后台程序。

以下工具需要自行安装。安装后重启桌宠，或在转换气泡中重新检查：

| 用途 | 工具 / 官方来源 | 可选环境变量 |
| --- | --- | --- |
| Word、PDF、Excel、PPT | [LibreOffice](https://www.libreoffice.org/download/download-libreoffice/) | `SOFFICE_PATH` 指向 `soffice.com`（控制台入口） |
| 音视频、部分图片 | [FFmpeg](https://ffmpeg.org/download.html)（Windows 构建链接在官方页面） | `FFMPEG_PATH`、`FFPROBE_PATH` |
| PDF/PPT 图片导出与 OCR 渲染 | Poppler（可通过 Chocolatey 或 Scoop 安装） | `PDFTOPPM_PATH`；同目录需有 `pdfinfo.exe` |
| Markdown / Word / 电子书 | [Pandoc](https://pandoc.org/installing.html) | `PANDOC_PATH` |
| PDF 拆分与密码 | [qpdf](https://github.com/qpdf/qpdf/releases) | `QPDF_PATH` |
| 扫描文字识别 | [Tesseract](https://tesseract-ocr.github.io/tessdoc/Installation.html)，另装 `eng`、`chi_sim` 数据 | `TESSERACT_PATH`；数据位置可设 `TESSDATA_PREFIX` |
| HEIC/HEIF | [ImageMagick Windows 版](https://imagemagick.org/download/)；必须含 HEIC 读取能力 | `IMAGEMAGICK_PATH` 指向 `magick.exe` |
| JPEG XL | [libjxl](https://github.com/libjxl/libjxl/releases) 的 `cjxl.exe`、`djxl.exe` | `CJXL_PATH`、`DJXL_PATH` |
| 相机 RAW（未验收） | [LibRaw](https://www.libraw.org/download) 的 `dcraw_emu.exe` | `LIBRAW_PATH` |

变量使用完整绝对路径。程序查找 LibreOffice 常规安装目录、工具的 PATH 和指定环境变量；不要求把工具复制进应用目录。ImageMagick 通过 `magick -list format` 检查 HEIC 解码支持，缺失时对应格式按钮不可用。

## 可选扫描表格引擎

模型与 Python 环境不放入安装包。需要时下载源码并安装 Node.js、Python 3.9–3.13、Poppler，在源码目录执行：

```bash
npm ci
npm run setup:pdf-structure -- --user
```

这会安装到用户目录的 `.blue-maid-converter/pdf-structure`，独立安装包自动检查此位置。也可设置 `PDF_STRUCTURE_HOME` 指向已验证的引擎目录。安装时下载模型并核对校验值，实际转换只读取本地模型。此能力有 Mac 自建表格验证；Windows 可选结构引擎尚未进行等价验收。

## 声音与转换限制

公开安装包不提供缺少再分发授权的小黄鸭音频，首次点击可能无声音。可从人物菜单导入自己有权使用的 MP3/WAV。已有自定义音效保存在用户配置中，不随包上传。

文件全部本机处理，原件和已有结果不覆盖。特殊 RAW/WPS 等输入、OCR 和复杂排版仍有限制，见 [格式清单](CONVERSION-FORMATS.md) 与 [转换验收](CONVERSION-VALIDATION.md)。
