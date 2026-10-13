# 文件转换方式

本机离线处理，人物、动作、声音、菜单和快捷键沿用原行为。本次只扩展转换气泡里的格式与参数。

参考 FlyingMouse Format 固定提交 `a7b9b15d32db80cecedae00e89289088656fb1ae` 的公开格式规则，独立接入底层工具；没有复制其源码、界面或品牌。98 个输入扩展名对应 1,174 个参考仓库声明的转换组合；另保留本项目原有的 3 个 TSV 输出组合。格式清单包含别名和实验输入，不能视为每条路线均已实测。

## 使用

拖入一个文件选择格式；拖入多个文件会显示共同目标，分别转换的结果放入 ZIP。全部为图片或 PDF 时，可以选择按列表顺序合并 PDF。顺序以拖入的文件列表为准。

选择 PDF→PDF 后，可选逐页拆分、每 N 页拆分、AES-256 加密或用原密码解密。拆分结果放入 ZIP，加解密结果是 PDF；密码仅在本机临时目录短暂使用，不写日志或设置文件。

Word→Markdown 会输出 `.md`，图片放入同名 `.md.assets` 文件夹。两者一起移动才能继续显示图片；两者都不会覆盖已有文件。PDF→Markdown 按页保留文字，扫描页使用中英文 OCR，插图、复杂排版和公式不会完整还原。

视频可选 H.264、H.265 或 AV1（MP4/MOV/MKV）；WebM 使用 VP9。文本提供 UTF-8、GB18030 和 UTF-16 编码选择。格式之间的样式、图层、透明度、轨道等损失会在结果提示中说明。

## 安装工具

```bash
brew install --cask libreoffice
brew install ffmpeg poppler pandoc qpdf jpeg-xl libraw tesseract tesseract-lang
npm ci
npm start
```

高级扫描表格是可选本机引擎，本机已安装并通过已知行列与合并表头测试。新安装者需 Python 3.9–3.13，按需运行：

```bash
brew install python@3.13   # 已有兼容版本时无需安装
npm run setup:pdf-structure
```

脚本在 `.local-tools/pdf-structure` 创建独立环境，固定 PaddlePaddle 3.3.1、PaddleOCR 3.7.0、PaddleX 3.7.2，下载约 290 MB 官方模型并校验 SHA-256，通过自建表格识别后才启用；需预留约 2 GB 空间。程序启动不自动安装或下载。转换时在本机 CPU 运行，模型和文档不上传。PDF→Excel 可选“自动”“文字位置推测”“本机表格结构识别”：自动模式只对扫描页使用已安装的结构引擎；明确选择未安装引擎会提示安装或改用位置推测。

中文 OCR 需要 `chi_sim` 和 `eng` 语言数据，运行 `tesseract --list-langs` 核对。本机另安装了官方 `tessdata_best` 中文模型，存在 `chi_sim_best` 时优先采用；不替换系统已有模型。模型是本机数据，不随仓库分发。OFD 使用随项目保留 OFL 许可的 `assets/conversion-fonts/NotoSansCJKsc-Regular.otf`。

## 验收边界

- 输入单文件不超过 100 MB，多文件最多 100 个、总计不超过 256 MB；输出不超过 512 MB。ZIP/Office 解压内容不超过 256 MB，禁止路径穿越与外部 XML 实体。
- PDF 文本提取、图片导出和合并/拆分最多 200 页。扫描页识别失败会报错，不以空文件报成功。OCR 低置信度会提示核对；识别文字不保证全对。
- PDF→Excel 的位置方式一页一张工作表；本机结构方式给识别到的表格单独建工作表，尝试保留合并区域，并另存逐页文字。已通过三列表格和跨三列合并表头样例，但复杂无边框表、嵌套表、跨页表及版式恢复没有等价质量证据；不宣称与上游 Windows 专用引擎相同，公式、结构和文字需核对。
- RAW、OFD、AI/PSD、MOBI 和 WPS/WordPerfect 等为实验输入；具体相机压缩、专有编码、加密/DRM、签章和复杂对象可能不支持。AI 只处理包含 PDF 兼容内容的文件，PSD 合并图层；没有真实样例的扩展名会单独列为未验证。
- Markdown/HTML 仅读取所在文件夹内的本地图片，不下载远程资源。EPUB 按章节顺序读取，保留文字和可处理的图片，不保留原书全部样式；MOBI 转换不移除 DRM。
- 原有表格路线保留第一工作表、字符串和已计算的值。CSV/TSV 不保留公式与样式；缺少缓存计算结果的公式需先在表格软件中计算保存。
- 音视频保留第一条对应轨道；GIF 无声音。OGG 原生 Vorbis 编码器输出双声道。静态图片转视频为 3 秒；动图转视频保留一次播放周期（最多 500 帧 / 总计 4000 万像素）。
- PDF 文件加解密不恢复旧数字签名；合并不保留原书签。原文件与已有结果始终保留。

## 格式清单

下表是已接入的路线白名单；实际按钮还会检查相应工具。实验与未验证项见 [验收记录](CONVERSION-VALIDATION.md)，不以白名单代替运行证据。

| 输入 | 类别 | 可选输出 |
| --- | --- | --- |
| JPG | 图片 / RAW | PNG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| JPEG | 图片 / RAW | PNG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| JFIF | 图片 / RAW | PNG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| JPE | 图片 / RAW | PNG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| PNG | 图片 / RAW | JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| WEBP | 图片 / RAW | JPG, PNG, GIF, AVIF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| GIF | 图片 / RAW | PNG, JPG, WEBP, AVIF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| AVIF | 图片 / RAW | PNG, JPG, WEBP, GIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| TIF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| TIFF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| BMP | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| HEIC | 图片 / RAW | JPG, PNG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| HEIF | 图片 / RAW | JPG, PNG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| ICO | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| TGA | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| SVG | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| JP2 | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| J2K | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| JXL | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| QOI | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| PPM | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PDF, MP4, WEBM, TXT, DOCX, MD |
| AI | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| PSD | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| CR2 | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| CR3 | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| CRW | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| NEF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| ARW | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| DNG | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| RAF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| RW2 | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| ORF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| PEF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| SRW | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| 3FR | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| ERF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| FFF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| IIQ | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| KDC | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| MEF | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| MRW | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| X3F | 图片 / RAW | PNG, JPG, WEBP, GIF, AVIF, TIFF, ICO, BMP, TGA, JP2, JXL, QOI, PPM, PDF, MP4, WEBM, TXT, DOCX, MD |
| PDF | PDF | DOCX, XLSX, TXT, HTML, MD, PNG, JPG, WEBP, PDF |
| SRT | 字幕 | VTT, ASS, SSA, TXT |
| VTT | 字幕 | SRT, ASS, SSA, TXT |
| ASS | 字幕 | SRT, VTT, SSA, TXT |
| SSA | 字幕 | SRT, VTT, ASS, TXT |
| DOC | 文档 | PDF, DOCX, ODT, RTF, TXT, HTML, MD |
| DOCX | 文档 | PDF, ODT, RTF, TXT, HTML, MD |
| ODT | 文档 | PDF, DOCX, RTF, TXT, HTML, MD |
| RTF | 文档 | PDF, DOCX, ODT, TXT, HTML, MD |
| WPS | 文档 | PDF, DOCX, ODT, RTF, TXT, HTML, MD |
| WPT | 文档 | PDF, DOCX, ODT, RTF, TXT, HTML, MD |
| WPD | 文档 | PDF, DOCX, ODT, RTF, TXT, HTML, MD |
| OFD | 文档 | PDF |
| XLS | 表格 | XLSX, CSV, TSV, PDF, ODS, HTML |
| XLSX | 表格 | CSV, TSV, PDF, XLS, ODS, HTML |
| XLSM | 表格 | PDF, XLSX, XLS, ODS, CSV, HTML |
| ODS | 表格 | PDF, XLSX, XLS, CSV, HTML |
| CSV | 表格 | XLSX, TSV, PDF, HTML, TXT, MD, JSON, EPUB |
| TSV | 表格 | XLSX, CSV, PDF, HTML, TXT, MD, JSON, EPUB |
| ET | 表格 | PDF, XLSX, XLS, ODS, CSV, HTML |
| ETT | 表格 | PDF, XLSX, XLS, ODS, CSV, HTML |
| PPT | 演示文稿 | PDF, JPG, PNG, PPTX, ODP, HTML |
| PPTX | 演示文稿 | PDF, JPG, PNG, ODP, HTML |
| ODP | 演示文稿 | PDF, PPTX, HTML, PNG, JPG |
| DPS | 演示文稿 | PDF, PPTX, ODP, HTML, PNG, JPG |
| DPT | 演示文稿 | PDF, PPTX, ODP, HTML, PNG, JPG |
| TXT | 文本 / 电子书 | MD, HTML, JSON, CSV, EPUB, PDF, DOCX |
| MD | 文本 / 电子书 | TXT, HTML, JSON, CSV, EPUB, PDF, DOCX |
| MARKDOWN | 文本 / 电子书 | TXT, HTML, JSON, CSV, EPUB, PDF, DOCX |
| HTML | 文本 / 电子书 | TXT, MD, JSON, CSV, EPUB, PDF, DOCX |
| HTM | 文本 / 电子书 | TXT, MD, JSON, CSV, EPUB, PDF, DOCX |
| JSON | 文本 / 电子书 | TXT, MD, HTML, CSV, EPUB, PDF |
| LOG | 文本 / 电子书 | TXT, MD, HTML, JSON, CSV, EPUB, PDF |
| XML | 文本 / 电子书 | TXT, MD, HTML, JSON, CSV, EPUB, PDF |
| YAML | 文本 / 电子书 | TXT, MD, HTML, JSON, CSV, EPUB, PDF |
| YML | 文本 / 电子书 | TXT, MD, HTML, JSON, CSV, EPUB, PDF |
| EPUB | 文本 / 电子书 | TXT, MD, HTML, PDF, DOCX |
| MOBI | 文本 / 电子书 | TXT, MD, EPUB |
| MP3 | 音频 | WAV, FLAC, AAC, M4A, OGG, OPUS, WMA |
| WAV | 音频 | MP3, FLAC, AAC, M4A, OGG, OPUS, WMA |
| FLAC | 音频 | MP3, WAV, AAC, M4A, OGG, OPUS, WMA |
| M4A | 音频 | MP3, WAV, FLAC, AAC, OGG, OPUS, WMA |
| AAC | 音频 | MP3, WAV, FLAC, M4A, OGG, OPUS, WMA |
| OGG | 音频 | MP3, WAV, FLAC, M4A, AAC, OPUS, WMA |
| OPUS | 音频 | MP3, WAV, FLAC, M4A, OGG, AAC, WMA |
| WMA | 音频 | MP3, WAV, FLAC, M4A, OGG, AAC, OPUS |
| MP4 | 视频 | MP3, WAV, GIF, WEBM, MKV, MOV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| MOV | 视频 | MP4, MP3, WAV, GIF, WEBM, MKV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| MKV | 视频 | MP4, MP3, WAV, GIF, WEBM, MOV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| WEBM | 视频 | MP4, MP3, WAV, GIF, MKV, MOV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| AVI | 视频 | MP4, WEBM, MKV, MOV, GIF, MP3, WAV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| M4V | 视频 | MP4, WEBM, MKV, MOV, GIF, MP3, WAV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| M4S | 视频 | MP4, WEBM, MKV, MOV, GIF, MP3, WAV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| WMV | 视频 | MP4, WEBM, MKV, MOV, GIF, MP3, WAV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| FLV | 视频 | MP4, WEBM, MKV, MOV, GIF, MP3, WAV, FLAC, M4A, OGG, AAC, OPUS, WMA |
| ZIP | 图片压缩包 | PDF |
