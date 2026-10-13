# 本次文件转换验收

日期：2026-10-10；平台：macOS Apple Silicon（M5）。参考固定提交 `a7b9b15d32db80cecedae00e89289088656fb1ae`，不把未来上游新增能力默认为已实现。本次只改文件转换与相应气泡参数，没有发布新 GitHub 版本。

## 规则与实际结果分开记录

参考仓库的 98 个输入扩展名、1,174 个声明组合已接入处理器；保留原来的 3 个 TSV 输出，共 1,177 个白名单组合。**这是规则覆盖数，不是全部实测通过数。**

已用有效自建样例测试 72 个输入扩展名的全部 771 个不同输入→输出组合。其余 26 个特殊输入共 406 个组合缺少样例，不能声称都能处理或已经复刻了各种专有编码。

- 最后一轮矩阵：809 项实际转换检查通过，0 失败。包含重复、参数与往返，因此不是 809 种格式。
- 23 项补充转换通过：DOC、无宏 XLSM、基础无 DRM MOBI；Word→MD→Word 的图片与公式、中文编码 CSV/TXT、动图时序及单页 PDF 图片结果。
- 30 项补充 OCR 转换通过：JPEG/JFIF/JPE/TIF、HEIC/HEIF、AI 的 PDF 兼容子集、SVG、扁平 PSD、J2K 中的已知文字。矩阵内因空白样例未验的 27 项均由这些测试补齐，补充测试还有 3 项重复。
- 独立扫描表格测试通过：三列数据、跨三列合并表头、原文工作表；混合 PDF 的原生页眉与扫描正文同时保留。
- 17 项基础测试通过；原 Word/PDF 双向真实转换通过。原有 65 项格式检查及菜单回归在实施期间已通过。
- 新增参数/批量界面与原有六类界面检查通过：待机→工作→结束一次→待机、取消后回列表、格式与保存扩展名、中文失败提示。启动真实隔离 Electron 窗口；Finder drop 和系统保存对话框由测试替代，不能据此宣称覆盖所有原生系统交互。
- npm 官方审计：锁定 Node 依赖 0 项已知漏洞；不代表本机 Python、系统工具或模型已经做过同等审计。

| 类别 | 规则输入数 | 有样例的输入数 | 已通过的不同组合 |
| --- | --- | --- | --- |
| 图片 / RAW | 42 | 23 | 418 |
| 文档 | 8 | 5 | 26 |
| PDF | 1 | 1 | 9 |
| 表格 | 8 | 6 | 39 |
| 演示文稿 | 5 | 3 | 16 |
| 文本 / 电子书 | 12 | 12 | 77 |
| 字幕 | 4 | 4 | 16 |
| 音频 | 8 | 8 | 56 |
| 视频 | 9 | 9 | 113 |
| ZIP 图片 | 1 | 1 | 1 |

## 内容检查的含义

矩阵执行真实本机工具，检查输出格式、有效内容结构和原文件哈希；重点样例另核对已知中英文文字、页数、表格值、章节顺序、字幕时间轴、图片附件、Word 公式节点、视频编码及实际变化帧。没有逐像素核对每一份输出，也没有验证任意复杂文档的排版一致性。

人物样式、动作清单、声音模块与后台启动器源文件的 SHA-256 和实施前一致；差异审阅确认 main/preload/renderer 的修改仅涉及转换文件列表、格式/参数和转换结果流程，透明、无边框、置顶、人物拖拽逻辑保留。

## 未验证或有限验证

缺少有效输入样例：`CR2`, `CR3`, `CRW`, `NEF`, `ARW`, `DNG`, `RAF`, `RW2`, `ORF`, `PEF`, `SRW`, `3FR`, `ERF`, `FFF`, `IIQ`, `KDC`, `MEF`, `MRW`, `X3F`, `WPS`, `WPT`, `WPD`, `ET`, `ETT`, `DPS`, `DPT`。RAW 通过 LibRaw，WPS/WordPerfect 等通过 LibreOffice 调用，但安装了工具、列出按钮不证明这些特殊输入都转换正确。错误会中文提示并保留原件；不要仅靠这些未经验证的结果处理唯一副本。

已测 OFD 仅覆盖基础中文文字；AI 仅 PDF 兼容内容；PSD 仅扁平 RGB；MOBI 仅基础未加密带 EXTH 文件，早期/复杂 MOBI 或 KF8 仍可能失败。XLSM 测试不含宏，应用禁用文档宏。扫描表格结构推测不能恢复公式，复杂无边框、嵌套、跨页表和整篇版式尚无与上游 Windows 引擎等价的证据。

原件与已有结果保护通过测试；公开说明不包含个人文档、密码或本机测试数据。

## 复测

```bash
npm test
npm run test:integration
npm run test:formats
npm run test:full-matrix
npm run test:full-formats-extra
npm run test:full-formats-ocr
npm run test:pdf-structure   # 需先执行 setup:pdf-structure
```

按此顺序生成前置样例。可选引擎安装命令与工具清单见 [转换说明](CONVERSION-FORMATS.md)。界面测试为 `test:formats-ui` 和 `test:full-formats-ui`，需安装 Playwright 或用 `PLAYWRIGHT_MODULE` 指向已有模块。

自建样例和逐条报告写入被 Git 忽略的 `artifacts/`，主矩阵在 `full-format-tests/report.json`，补充为 `extra-report.json`、`ocr-report.json`，扫描表格文件在 `pdf-structure-tests/`。本机私有 Python 环境与模型位于被忽略的 `.local-tools/`，不随仓库分发。
