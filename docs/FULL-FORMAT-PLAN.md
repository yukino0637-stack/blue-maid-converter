# 全量文件转换覆盖计划（已实施，含未验证特殊输入）

检查日期：2026-10-09；实施与验收更新：2026-10-10。目标：在现有 Mac 桌宠中覆盖 FlyingMouse Format 的全部转换路线与文件转换操作。人物、活动、声音和 Command+D 保持现有行为；仅转换气泡按需要增加参数、文件列表和合并入口。

## 来源与证据

参考仓库：[LaoFeng-mouse/flyingmouse-format](https://github.com/LaoFeng-mouse/flyingmouse-format)，当前 HEAD 经 `git ls-remote` 核对为 `a7b9b15d32db80cecedae00e89289088656fb1ae`。

已读取固定提交的 [config.js](https://github.com/LaoFeng-mouse/flyingmouse-format/blob/a7b9b15d32db80cecedae00e89289088656fb1ae/config.js)、[utils.js](https://github.com/LaoFeng-mouse/flyingmouse-format/blob/a7b9b15d32db80cecedae00e89289088656fb1ae/utils.js)、[server.js](https://github.com/LaoFeng-mouse/flyingmouse-format/blob/a7b9b15d32db80cecedae00e89289088656fb1ae/server.js)、转换模块、资源限制与引擎锁文件；没有执行参考仓库代码。

按全部工具启用时的 `targetsForExt` 规则整理：98 个不同输入扩展名、1,174 个源码声明的输入/输出组合，其中本机现有转换表缺少 1,107 个组合。数字包含别名与实验路线，不代表 1,174 种独立格式，也不代表全部已在 Mac 运行。桌宠现有额外的 XLS/XLSX/CSV→TSV 保留。

普通转换能力、结构恢复质量和平台可用性分别验收，不能把“按钮已增加”算作转换完成。上游部分文本目标只是包装或保留原文，不据此宣称自动推断出结构。

## 实施路线

沿用此前的独立接入底层工具路线，参考上游的格式组织、处理策略和损失提示；保持本项目的 IPC、窗口与原文件保护。上游自定义非商用许可及来源见 [LICENSE](https://github.com/LaoFeng-mouse/flyingmouse-format/blob/a7b9b15d32db80cecedae00e89289088656fb1ae/LICENSE)。不把上游源码重标为 MIT；每个实际引入依赖另行记录版本、用途和许可。

| 顺序 | 组件 | 依赖 | 拟用工具与验收重点 |
|---|---|---|---|
| 1，关键 | 固定转换矩阵、按路线检查引擎、参数校验、多文件结果保存 | 已有转换流程 | 明确每个目标的实际扩展名、工具和损失说明；单文件、多页 ZIP、Markdown 附件文件夹都不可覆盖原文件或已有文件 |
| 2，关键 | Mac 高级能力可行性验证 | 1 | 验证 OCR、扫描表格结构识别、RAW、JXL、OFD 的 arm64 工具；先做真实样例，不先添加可点击的假目标；无法等价时报告具体路线和替代方案 |
| 3 | 文档与 Markdown 全部路线 | 1，所需引擎通过 2 | LibreOffice、Mammoth、Turndown、Pandoc；DOC/DOCX/ODT/RTF/WPS/WPT/WPD；Word→MD 文字结构和图片附件、MD→Word/PDF 的标题、表格、代码、公式及本地图片 |
| 4 | 图片和音视频全目标 | 1，特殊编码通过 2 | 已有 Sharp、FFmpeg、Poppler；补齐图片格式、图片→视频、音频八种格式、视频五种格式与音轨提取；编码选择 H.264/H.265/AV1；透明、动画帧、音轨丢失需提示 |
| 5 | 表格、演示文稿、结构化文本、电子书和字幕 | 1、3；依赖图片附件保存 | 已有 ExcelJS、CSV 工具、Marked，加按需 YAML/XML/EPUB/字幕解析库；字段/类型、页数、章节顺序、时间轴和图片附件必须核对；不把改后缀算转换 |
| 6，关键 | PDF 文字、图片、OCR、Word 与表格恢复 | 1、2、3、4、5 | PDF.js、Poppler、Tesseract/经验证的结构引擎、ExcelJS；电子/扫描/混合页逐页检查，低置信度与布局损失提示，不能丢页后报成功 |
| 7 | RAW、AI/PSD、OFD 等特殊输入 | 1、2、4、6 | LibRaw、Poppler、经验证的设计稿/OFD 解码库；实验格式保留实验提示，真实样本验证颜色、尺寸、文字与页数 |
| 8 | 多文件操作和 PDF 工具 | 1、4、6 | 图片合并 PDF、ZIP 内图片→PDF、PDF 合并、按页/每 N 页拆分、AES-256 加密及凭原密码解密；相关批量转换、顺序选择、密码和编码参数只出现在转换流程中 |
| 9，关键 | 全量验收、原功能回归和归因更新 | 所有组件 | 每条路线记录真实结果、失败或未验证；检查原文件哈希、输出内容、工作/结束动画与中文错误；原有活动、声音、拖拽及启动行为回归；更新 README、来源和验证记录 |

阶段 2 先处理后续组件依赖的引擎可行性；各组件自身完成检查后再交付。目标是完整覆盖，分阶段不意味着删掉复杂格式或把它们默认为完成。

已在 GitHub 核对的可复用候选：

- [Mammoth](https://github.com/mwilliamson/mammoth.js)、[Turndown](https://github.com/mixmark-io/turndown)：Word 结构提取与 HTML→Markdown。
- [Pandoc](https://github.com/jgm/pandoc)：Markdown→Word 与中间文档结构。
- [PDF.js](https://github.com/mozilla/pdf.js)、[Tesseract.js](https://github.com/naptha/tesseract.js)：PDF 文字/坐标与本地 OCR，PDF OCR 需先渲染图片。
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)：独立本机 CPU 表格结构引擎，已安装并通过行列、合并表头和混合页样例；不能承诺与 Windows 引擎等价质量。
- [LibRaw](https://github.com/LibRaw/LibRaw)、[JPEG XL](https://github.com/libjxl/libjxl)、[qpdf](https://github.com/qpdf/qpdf)：RAW、JXL、PDF 加解密候选。
- 已有 Sharp、FFmpeg、LibreOffice、Poppler、ExcelJS 和 node-csv 按需复用。

## 当前关键缺项

1. 本机正式路径存在 LibreOffice、FFmpeg/ffprobe、Poppler；这只是存在性检查，不是新路线验收。现已安装 Pandoc、qpdf、Tesseract、LibRaw、JPEG XL、中英文 OCR 数据与必要 Node 依赖；对应真实检查与未验证项汇总在 [验收记录](CONVERSION-VALIDATION.md)，不以工具安装证明路线成功。
2. 当前 FFmpeg 编码器列表有 H.264、H.265、SVT-AV1、JPEG2000、QOI、PPM、WMA 和 Opus；未列出 `libjxl`，JXL 已用本机 cjxl/djxl 完成真实往返，H.265/AV1 编码也已验证。
3. 上游 `docstructure-engine-lock.json` 指定 `win32-x64`，所列引擎与模型总计约 1.85 GB；不能直接运行在 Mac M5。已独立接入 Mac PaddleOCR CPU 表格引擎（项目私有 Python 环境），恢复已知三列与合并表头。跨页/嵌套/复杂无边框表及版式质量仍缺等价证据。
4. FlyingMouse Skill 的连接目标不存在，尚未获得该程序运行时能力；本计划以固定源码及本机检查为证据。需要对照上游实际程序时，应在其应用内重新“接入 Agent”。
5. 部分特殊输入必须有合法、有效的真实样本，尤其 CR3/X3F、WPS/WPD、OFD、AI/PSD、MOBI。OFD、AI 的 PDF 兼容子集、扁平 PSD、无宏 XLSM、DOC 与无 DRM 的基础 MOBI 已用自建有效文件验证；其他特殊编码仍有限制。样本不足的扩展名见 [验收记录](CONVERSION-VALIDATION.md)。

## 转换相关特殊操作

- 图片与扫描 PDF OCR→TXT/DOCX/MD；PDF→XLSX；PDF/PPT→逐页图片；多页结果的 ZIP 保存。
- 多张图片排序合并 PDF、ZIP 内图片合并 PDF、多个 PDF 合并、PDF 按页或每 N 页拆分。
- PDF AES-256 加密与凭原密码解密；密码不进入公开日志、测试记录或进程诊断。
- 批量独立转换；视频编码 H.264/H.265/AV1；文本转 EPUB 的 UTF-8、GB18030、UTF-16 编码选择。
- Word→MD 的图片附件、Markdown 本地图片、EPUB 章节与资源的完整保存。

具体转换路线按下表固定；PDF→PDF 包含拆分、加密和解密，合并与多输入操作另行验收。同格式普通转换不重复列出。

## 源码声明路线逐扩展名清单

以下为规划时固定的上游规则与改动前桌宠目标对照。现在的处理器与按钮清单见 [转换说明](CONVERSION-FORMATS.md)，真实结果见 [验收记录](CONVERSION-VALIDATION.md)；规则覆盖不能替代实测。保持上游针对 GIF/WebP→TIFF、CSV/TSV→XLS/ODS 等路线的实际排除规则。

| 分类 | 输入扩展名 | 上游目标 | 现有桌宠已列目标 |
|---|---|---|---|
| image | jpg | png, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | png, webp |
| image | jpeg | png, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | png, webp |
| image | jfif | png, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | jpe | png, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | png | jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | jpg, webp |
| image | webp | png, jpg, gif, avif, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | jpg, png |
| image | gif | png, jpg, webp, avif, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | avif | png, jpg, webp, gif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | tif | png, jpg, webp, gif, avif, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | tiff | png, jpg, webp, gif, avif, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | bmp | png, jpg, webp, gif, avif, tiff, ico, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | heic | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | jpg, png, webp |
| image | heif | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | jpg, png, webp |
| image | ico | png, jpg, webp, gif, avif, tiff, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | tga | png, jpg, webp, gif, avif, tiff, ico, bmp, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | svg | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | jp2 | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | j2k | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | jxl | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | qoi | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | ppm | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, pdf, mp4, webm, txt, docx, md | 无 |
| image | ai | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | psd | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | cr2 | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | cr3 | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | crw | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | nef | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | arw | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | dng | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | raf | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | rw2 | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | orf | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | pef | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | srw | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | 3fr | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | erf | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | fff | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | iiq | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | kdc | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | mef | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | mrw | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| image | x3f | png, jpg, webp, gif, avif, tiff, ico, bmp, tga, jp2, jxl, qoi, ppm, pdf, mp4, webm, txt, docx, md | 无 |
| pdf | pdf | xlsx, txt, html, docx, md, png, jpg, webp, pdf | docx |
| subtitle | srt | vtt, ass, ssa, txt | 无 |
| subtitle | vtt | srt, ass, ssa, txt | 无 |
| subtitle | ass | srt, vtt, ssa, txt | 无 |
| subtitle | ssa | srt, vtt, ass, txt | 无 |
| document | doc | pdf, docx, odt, rtf, txt, html, md | pdf |
| document | docx | pdf, odt, rtf, txt, html, md | pdf |
| document | odt | pdf, docx, rtf, txt, html, md | 无 |
| document | rtf | pdf, docx, odt, txt, html, md | 无 |
| document | wps | pdf, docx, odt, rtf, txt, html, md | 无 |
| document | wpt | pdf, docx, odt, rtf, txt, html, md | 无 |
| document | wpd | pdf, docx, odt, rtf, txt, html, md | 无 |
| document | ofd | pdf | 无 |
| spreadsheet | xls | pdf, xlsx, ods, csv, html | xlsx, csv, tsv |
| spreadsheet | xlsx | pdf, xls, ods, csv, html | csv, tsv |
| spreadsheet | xlsm | pdf, xlsx, xls, ods, csv, html | 无 |
| spreadsheet | ods | pdf, xlsx, xls, csv, html | 无 |
| spreadsheet | csv | pdf, xlsx, html, txt, md, json, epub | xlsx, tsv |
| spreadsheet | tsv | pdf, xlsx, csv, html, txt, md, json, epub | xlsx, csv |
| spreadsheet | et | pdf, xlsx, xls, ods, csv, html | 无 |
| spreadsheet | ett | pdf, xlsx, xls, ods, csv, html | 无 |
| presentation | ppt | pdf, pptx, odp, html, png, jpg | pdf, jpg, png |
| presentation | pptx | pdf, odp, html, png, jpg | pdf, jpg, png |
| presentation | odp | pdf, pptx, html, png, jpg | 无 |
| presentation | dps | pdf, pptx, odp, html, png, jpg | 无 |
| presentation | dpt | pdf, pptx, odp, html, png, jpg | 无 |
| text | txt | md, html, json, csv, epub, pdf, docx | md |
| text | md | txt, html, json, csv, epub, pdf, docx | txt |
| text | markdown | txt, html, json, csv, epub, pdf, docx | txt |
| text | html | txt, md, json, csv, epub, pdf, docx | 无 |
| text | htm | txt, md, json, csv, epub, pdf, docx | 无 |
| text | json | txt, md, html, csv, epub, pdf | 无 |
| text | log | txt, md, html, json, csv, epub, pdf | 无 |
| text | xml | txt, md, html, json, csv, epub, pdf | 无 |
| text | yaml | txt, md, html, json, csv, epub, pdf | 无 |
| text | yml | txt, md, html, json, csv, epub, pdf | 无 |
| text | epub | txt, md, html, pdf, docx | 无 |
| text | mobi | txt, md, epub | 无 |
| audio | mp3 | wav, flac, m4a, ogg, aac, opus, wma | wav, flac, aac, m4a |
| audio | wav | mp3, flac, m4a, ogg, aac, opus, wma | mp3, flac, aac, m4a |
| audio | flac | mp3, wav, m4a, ogg, aac, opus, wma | mp3, wav, aac, m4a |
| audio | m4a | mp3, wav, flac, ogg, aac, opus, wma | mp3, wav, flac, aac |
| audio | aac | mp3, wav, flac, m4a, ogg, opus, wma | mp3, wav, flac, m4a |
| audio | ogg | mp3, wav, flac, m4a, aac, opus, wma | 无 |
| audio | opus | mp3, wav, flac, m4a, ogg, aac, wma | 无 |
| audio | wma | mp3, wav, flac, m4a, ogg, aac, opus | 无 |
| video | mp4 | webm, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | mp3, wav, gif |
| video | mov | mp4, webm, mkv, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | mp4, mp3, wav, gif |
| video | mkv | mp4, webm, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | mp4, mp3, wav, gif |
| video | webm | mp4, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | mp4, mp3, wav, gif |
| video | avi | mp4, webm, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | 无 |
| video | m4v | mp4, webm, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | 无 |
| video | m4s | mp4, webm, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | 无 |
| video | wmv | mp4, webm, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | 无 |
| video | flv | mp4, webm, mkv, mov, gif, mp3, wav, flac, m4a, ogg, aac, opus, wma | 无 |
| zip | zip | pdf | 无 |
