# 项目来源与 vibe coding 功能归属

这个项目由 [yukino0637-stack](https://github.com/yukino0637-stack) 提出需求、选择方案并通过 AI 辅助的 vibe coding 逐步实现。开发过程中由维护者提出交互和修复要求，AI 辅助编写代码与执行验证。下文将第三方素材、直接复用的代码、设计参考和本项目实现分开记录；不把第三方成果称为本项目原创。

## 直接使用的 GitHub 项目

| 项目 | 实际使用的部分 | 本项目位置与边界 |
| --- | --- | --- |
| [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | “蓝毛小女仆”透明 WebM 动画，共 106 份；上游动作名称和分类 | `assets/dsh-pet/` 保存原始视频；`src/actions.js` 按上游清单整理 105 个动作和 13 个分类。没有复制或运行其 DSH 插件、React 界面、物理引擎、余额查询、AI 对话或素材生成链 |
| [Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl](https://github.com/Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl) | 本机开发版使用 `assets/Ya1.mp3`，即“小黄鸭·按下”短音效；点击发声的交互作为参考 | 播放与导入逻辑由本项目用浏览器原生 `Audio` 实现，没有复制其音效管理模块或插件。**公开仓库不包含该音频**，因上游 PROVENANCE 明确未授予素材再许可 |
| [soffes/HotKey](https://github.com/soffes/HotKey) | `Sources/HotKey/` 六份 Swift 源码，原样复用 | `native-launcher/vendor/HotKey/`；用于注册 macOS 全局 Command+D。上层启动、重复触发保护、登录启动安装与检查脚本由本项目实现 |

小黄鸭项目基于 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 修改，本项目保留该来源链及上游的两位版权声明。未引入余额挂件本身。

### 固定来源记录

- dsh-pet 原有六份素材：提交 `370e8a6bd46d6ae4af76e76af9fd394cff43f2c4` 的 `dsh-pet/assets/webm/`，逐文件哈希见 [SOURCES.md](assets/dsh-pet/SOURCES.md)。
- 其余 100 份素材：作者官方 npm 包 `dsh-pet@0.3.1` 的 `assets/webm/`，包内提交 `ed0bec532f2e02ef9a31293871327c567ad3fdb0`；获取地址、SHA-512 与逐文件 SHA-256 见 [ADDITIONAL-SOURCES.json](assets/dsh-pet/ADDITIONAL-SOURCES.json)。所有视频均未转码或改写。
- 本机小黄鸭音频：提交 `24feb651d7991cbefc46666422883635f06f333e` 的 `assets/Ya1.mp3`；记录见 [音效来源](assets/duck-sound/SOURCES.md)，音频不在公开提交中。
- HotKey：提交 `a3cf605d7a96f6ff50e04fcb6dea6e2613cfcbe4`；原始 MIT 和使用范围见 [HotKey 来源](native-launcher/vendor/HotKey/SOURCES.md)。

## 作为设计参考的 GitHub 项目

[LaoFeng-mouse/flyingmouse-format](https://github.com/LaoFeng-mouse/flyingmouse-format) 是格式扩展的研究参考，检查版本为 0.7.10、提交 `a7b9b15d32db80cecedae00e89289088656fb1ae`。

参考的具体部分包括：输入类别与多个输出目标的组织；按底层工具是否安装启用目标；Sharp 图片转换及透明图转 JPG 白底提示；FFmpeg 音视频处理；LibreOffice 办公文件转换；ExcelJS 与 CSV 解析器配合；PPT 经 PDF 逐页导出图片并打包 ZIP；转换前说明公式、样式等信息损失。

本项目没有复制或重新打包该仓库的源码、界面、品牌素材、CLI 或 HTTP 服务，也没有将它作为运行依赖。具体转换代码在 `src/converter.cjs` 和 `src/formats.cjs` 中独立实现，Mac HEIC 采用系统 `sips`，Markdown→TXT 采用 Marked 解析。底层工具与库是第三方能力，不宣称为自己编写的转换引擎。

## 我通过 vibe coding 增加的功能

以下是本项目维护者提出需求，并通过 AI 辅助独立编写与整合的功能。这描述的是本项目的实现归属，不主张这些交互概念从未在其他项目出现。

| 功能 | 本项目的实现 |
| --- | --- |
| 桌宠文件转换流程 | 把文件拖给人物，文件图标化为粒子，白色气泡显示“要转换为什么格式鲸”，选择输出格式和保存位置，成功后在 Finder 中查看 |
| Mac 本地格式转换接入 | Word/PDF、图片、音频、视频、表格、PPT 和文本七类文件；独立调用本机工具和 npm 库，不上传文件、不启动转换 HTTP 服务 |
| 转换状态联动 | 待机循环、真实转换开始后工作循环、成功动画播放一次后回待机；失败显示中文原因，并保留源文件 |
| 文件与输出保护 | 目标白名单、输入和资源限制、不覆盖已有文件与符号链接、隔离 LibreOffice 配置、失败清理临时目录、验证输出而非仅看进程退出码 |
| 人物悬停菜单 | 仅显示人物；悬停人物出现右侧小气泡，再悬停气泡打开玻璃外观菜单；鼠标在卡片内保留、移开后收起；独立活动列表、声音和退出 |
| 点击与音效管理 | 压扁回弹；点击在转向和点击回应六个动画中随机播放一个；原生 Audio 播放，导入 MP3/WAV、真实解码验证和本地持久保存；忙碌时不抢占动画 |
| 动作与待机调度 | 把上游动画整合为可滚动分类列表及右键菜单；连续空闲一分钟随机播放一个动作，菜单、拖拽、转换等状态暂停计时 |
| 拖拽反馈与落地修复 | 4 像素阈值区分点击与移动；拖拽循环；松手或取消后直接播放同一视频 8.5 秒起的落地段，约 1.5 秒后回待机；保护转换与成功动画 |
| Mac 启动入口 | 项目相对路径 `.app` 入口；独立 Command+D 后台启动器使人物退出后仍可重新打开；HotKey 底层注册代码明确归上游 |
| 本项目测试 | 转换边界测试、真实文件转换检查、Electron 动画/音效/菜单/活动/空闲动作检查；测试替代的系统对话框与未验证项明确记录 |

## 支撑这些功能的第三方库

Electron 提供桌面窗口、IPC 和系统对话框；Node.js 提供文件和子进程能力；LibreOffice 负责办公文件；Sharp 负责图片；FFmpeg/ffprobe 负责音视频；ExcelJS 负责 XLSX；node-csv 负责 CSV/TSV；Marked 负责 Markdown；Poppler 负责 PDF 逐页渲染。macOS 自带 `sips`、`ditto` 和 `unzip` 也参与转换。版本、项目链接、实际调用位置和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 许可边界

本项目独立代码采用 MIT，但人物动画遵循 dsh-pet 的非商用与署名要求，音效缺少再分发授权而被排除。完整边界见 [LICENSE-SCOPE.md](LICENSE-SCOPE.md)。请在介绍或分发含人物素材的版本时保留原作者地址：https://github.com/PC2005-cloud/dsh-pet 。
