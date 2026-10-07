# 蓝毛小女仆文件转换器

用 Electron + Node.js 编写的 macOS 桌宠。支持文档、图片、音频、视频、表格、PPT 和文本转换，文件全部在本机处理，不上传文件、不连接远程服务。

由 [yukino0637-stack](https://github.com/yukino0637-stack) 提出需求并通过 AI 辅助的 **vibe coding** 逐步实现。人物形象和动画来自 **[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**，不是本项目自行绘制。

**本项目独立代码采用 MIT；人物动画保留上游非商用与署名要求。包含这些素材的作品不能因代码采用 MIT 就被视为可自由商用。** 详见 [LICENSE-SCOPE.md](LICENSE-SCOPE.md)。

## 使用了哪些项目，哪些功能是我做的

| 来源 | 用了哪些部分 | 我在本项目中实现的部分 |
| --- | --- | --- |
| [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | 106 份蓝毛小女仆透明 WebM、动作名称及分类 | 自己的 Electron 播放器、转换状态联动、活动列表、六个随机点击回应、空闲一分钟随机动作、拖拽与快速落地逻辑；未引入 DSH 插件运行代码 |
| [Whale Widget Bowl](https://github.com/Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl) | 本机开发版的小黄鸭 Ya1.mp3；点击发声的交互参考 | 用原生 Audio 独立实现点击播放、MP3/WAV 导入和本地记忆；公开仓库不分发该音频，未复制音效管理模块 |
| [FlyingMouse Format](https://github.com/LaoFeng-mouse/flyingmouse-format) | 格式类别、工具选择、图片/PPT/表格信息损失提示等设计参考 | 自己实现 Mac 转换接入、格式选择气泡和输出保护；未复制或重新打包其源码、UI、CLI 或 HTTP 服务 |
| [soffes/HotKey](https://github.com/soffes/HotKey) | 六份 Swift 全局快捷键注册源码 | 自己实现 Command+D 启动器、登录启动安装和防重复触发 |

拖文件给人物、粒子消失、中文格式气泡、悬停玻璃菜单、动画调度、自定义音效、文件保护和测试，是我提出需求后通过 vibe coding 编写与整合的本项目功能。真正的格式转换能力由 LibreOffice、FFmpeg、Sharp、ExcelJS 等第三方工具提供，不宣称为自制转换引擎。

固定版本、逐文件哈希、复用边界和详细功能归属见 [ATTRIBUTION.md](ATTRIBUTION.md)；底层依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 第一次启动

目标平台为 macOS Apple Silicon，Node.js 22 或更新版本。先安装 Node.js、Git 和 Homebrew，再执行：

```bash
brew install --cask libreoffice
brew install ffmpeg poppler
git clone https://github.com/yukino0637-stack/blue-maid-converter.git
cd blue-maid-converter
npm ci
npm start
```

LibreOffice 负责办公文档，FFmpeg 负责音视频，Poppler 负责逐页导出图片；已经安装时可跳过对应安装行。npm ci 按锁文件安装依赖；npm start 启动桌宠，关闭终端进程也会关闭桌宠。

锁定 Electron 44.5.1，Apple Silicon 默认安装 arm64 版本。当前为源码开发版，没有签名、公证或独立安装包；Windows/Linux 未验收。

也可以双击仓库中的「蓝毛小女仆.app」启动。它读取同目录的现有项目，需先 npm ci，并保留与 src、assets、node_modules 的相对位置；重复启动会使用已有实例。

**公开版音效说明：** 上游现将 Ya1.mp3 等音效排除在 MIT 之外，未授予再许可，因此仓库不含小黄鸭音频。首次启动可正常显示人物、转换文件和播放动作，点击暂时无声音；通过人物菜单「声音 → 导入音效」选择自己拥有或有权使用的 MP3/WAV，即可启用并记住音效。界面保留「小黄鸭」入口，但没有本地对应素材时无法播放。来源与处理见 [音效来源](assets/duck-sound/SOURCES.md)。

## 可选：Command+D 启动

基础启动不需要这一步。独立 Swift 启动器在登录后常驻，人物退出后仍能用 Command+D 打开，可能占用其他应用的同键功能。需要 Xcode Command Line Tools（xcrun swiftc）并自行安装；npm ci 不会自动修改登录启动项。

启动器固定打开 /Applications/蓝毛小女仆.app。在项目目录建立到仓库内入口的符号链接，再安装后台程序：

```bash
ln -s "$PWD/蓝毛小女仆.app" "/Applications/蓝毛小女仆.app"
node native-launcher/install.cjs
node native-launcher/check.cjs
```

如果应用程序目录已有同名入口，先检查并自行处理；以上命令不会强制覆盖。不要直接把相对路径入口复制到应用程序目录，否则找不到项目。移动项目后需更新链接并重新安装。需要 macOS 快捷指令时，可自行新建「打开文件」动作并选择该入口；快捷指令不随 Git 仓库自动安装。

真实按 Command+D 后，可运行 node native-launcher/check.cjs --expect-trigger 检查触发记录。停止后台监听：

```bash
launchctl bootout gui/$(id -u)/local.blue-maid-converter.hotkey
```

永久停止登录启动还需移走 ~/Library/LaunchAgents/local.blue-maid-converter.hotkey.plist。源码及 HotKey 许可在 native-launcher/；本仓库不分发编译缓存、后台日志或本机 LaunchAgent 配置。

## 怎么用

1. 从 Finder 把一个支持的文件拖到桌宠身上。
2. 文件图标化为粒子消失，桌宠继续播放待机动画。**原文件不受影响**。
3. 桌宠左上方出现白色气泡，顶部显示「要转换为什么格式鲸」。
4. 气泡根据文件类型显示可转换格式。多个格式用两列按钮排列；较长说明可在卡片内滚动。点击格式，再选择保存位置。Word 文件仍可选 PDF，PDF 仍可选 Word（`.docx`）。
5. 确认保存位置后，桌宠切换为循环工作动画；成功后播放一次结束动画，播完自动回到待机。失败则回到待机并显示中文原因。
6. 成功后点击「在 Finder 中查看」。取消保存则回到格式选择，可重试。

转换卡片的底部固定在人物上方，格式选择、转换中和成功提示保持同样的距离；较长说明在卡片内滚动。转换提示与系统保存窗口中的语气词统一使用「鲸」。

默认只显示人物。鼠标移到人物上时，头部右侧出现 `⋯` 小气泡；再移到气泡上即可打开半透明毛玻璃外观菜单，可选活动、声音和退出，无需点击。鼠标停留在卡片上时菜单保留，移开后收起；离开人物后小气泡也隐藏，恢复只有人物。从气泡移向菜单有 180ms 缓冲，避免穿过间隙时闪退。键盘聚焦人物也可显示入口，入口支持 Enter 打开菜单。

按住人物拖动位置；拖入文件后显示格式气泡，点击气泡的 × 或按 Esc 收起。菜单在右侧气泡上方，避开人物，打开时暂时隐藏转换卡片，关闭后恢复。点击菜单外的人物、关闭按钮或按 Esc 也可收起菜单。导入音效时会保留菜单，处理完后恢复悬停收起行为。玻璃外观由 CSS 绘制，不会模糊窗口背后的桌面。

人物响应区为 118×134 像素的矩形，按六份动画的可见边界留少量余量，覆盖动作伸出的手臂。视频仍按原来的 256×144 像素显示；两侧透明空白允许点击下方应用，菜单入口和卡片有独立响应区。

点击菜单中的「活动」后打开竖向活动列表卡片，保留挥手、伸懒腰和玩魔方，补齐上游其余 100 份动画。列表共 106 个入口（105 个动画及「回到待机」），按常用、转向、拖拽、点击回应、移动、小动作、玩耍、吃什么、时节、文字、钱包动画、说话动画和工作状态动画分组，可以滚动；点击「返回」回到声音和退出所在的主菜单。卡片与右键菜单共用 `src/actions.js` 的本地动作清单。转换时菜单仍可查看，但活动、声音切换及退出禁用；通过应用菜单或 Command+Q 退出时同样保护正在进行的转换。

普通点击人物保留压扁回弹和音效，并从「转向」及「点击回应」全部 6 个动画中等概率随机播放一个：东张西望、元气挥手、开心跃动、害羞惊讶、傲娇生气、挠痒咯咯笑。元气挥手在活动列表中仍归于「常用」。右键可按分类选择全部活动或「回到待机」。每个动作只播放一次，结束后回待机，互动不会增加常驻文字。移动、拖拽、钱包和说话等类别仅点播动画，不改变窗口位置，也不接入余额或 AI 服务。拖动超过 4 像素不算点击；接收文件、检查工具、转换及成功结束动画期间，互动不会抢占动画。人物获得键盘焦点后，Enter／空格仍触发挥手回应，Shift+F10 可打开动作菜单。尊重系统“减少动态效果”设置，开启时跳过回弹。

连续空闲待机 1 分钟后，随机点播一个现有动作，不播放点击音效；动作结束回到待机，再等待 1 分钟。打开菜单或转换卡片、拖动人物、接收文件、检查工具及转换时暂停自动动作，重新空闲后从头计时。

拖动人物超过 4 像素后循环播放「被鼠标拖拽悬空反馈」。松手、取消拖动、失去鼠标捕获或窗口失焦后立即停止窗口移动及循环，直接播放同一素材从 8.5 秒开始的末尾落地段，约 1.5 秒完成后回待机，再重新计时；拖拽开始和拖拽中保持原样，落地过程中重新拖动仍按原有方式恢复循环。普通点击保留随机回应和音效；检查工具、文件接收、转换及成功结束动画期间，拖动不会抢占这些动画。

有可用本地音效时，空闲左键点击人物会同时播放一次短音效，默认音量 50%；连续点击从头播放，不叠加。拖动、右键菜单和键盘回应不发声，接收文件、检查工具、转换和成功结束动画期间静音，进入这些状态会停止正在播放的音效。开发版的默认声音路径是本地 `assets/duck-sound/Ya1.mp3`，公开仓库不包含该音频；用户可导入自有音效，视频仍保持静音，详见 [音效记录](assets/duck-sound/SOURCES.md)。

在菜单「声音 → 导入音效」选择一个 MP3 或 WAV 文件（非空，最大 10 MB）。音频能解码后才切换并保存；取消、文件损坏或保存失败会显示中文提示并保留原音效。菜单保留默认小黄鸭及最近一次成功导入的音效两个选项，可随时切换。音频副本和当前选择保存在 Electron 的应用数据目录 `click-sound.json` 中，重启后继续使用，移动或删除原音频不影响已保存的副本。导入新音效会替换之前的自定义选项，不修改原文件，也不上传文件。

应用启动时在后台分别检查 LibreOffice、FFmpeg/ffprobe 和 Poppler，Finder 启动时也会检查 Homebrew 的正式安装路径。拖入文件后，缺少工具的目标按钮禁用，并显示安装命令；其他可用格式仍可转换。安装完成后点击「已安装，重新检查」。PDF 导入还会使用一个有已知文字的样例进行能力检测，未通过时禁用 PDF→Word，避免生成乱码还报成功。

## 角色素材

当前形象为 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 中的“蓝毛小女仆”。保留原有六份动画，另外从作者官方 `dsh-pet@0.3.1` 发布包提取 100 份活动动画，未增加运行依赖。来源版本和文件校验见 [素材记录](assets/dsh-pet/SOURCES.md)；原始 MIT 文本见 [LICENSE](assets/dsh-pet/LICENSE)。上游当前对动画素材另注明允许开源使用、禁止商用，衍生作品介绍、展示及分发时须附原作者 GitHub 地址。

视频按 16:9 比例显示，保留透明留白，不拉伸、不裁切。未使用的旧小猫素材不随公开仓库分发。

## 支持格式与限制

| 输入 | 可选输出 |
| --- | --- |
| DOC / DOCX | PDF |
| PDF | DOCX（实验功能） |
| JPG / JPEG / PNG / WebP | JPG / PNG / WebP，排除与输入相同的格式 |
| HEIC / HEIF | JPG / PNG / WebP |
| MP3 / WAV / FLAC / AAC / M4A | 这五种音频格式互转，排除相同格式 |
| MOV / MKV / WebM | MP4 / MP3 / WAV / GIF |
| MP4 | MP3 / WAV / GIF |
| XLSX / XLS / CSV / TSV | XLSX / CSV / TSV，排除相同格式 |
| PPT / PPTX | PDF，或逐页 JPG / PNG（保存为 ZIP） |
| TXT | MD（原文字保留，不自动生成标题） |
| MD / Markdown | TXT（解析并去除排版标记，保留代码和链接文字） |

- 单次一个文件，输入上限 100 MB；未加入批量队列、OCR、字幕、电子书或 RAW 转换。
- 文档及幻灯片图片转换最多两分钟；音视频最多 30 分钟。音视频及图片 ZIP 输出上限 512 MB，超过限制会失败并清理，不能把截短结果算成功。
- 图片最多 4000 万像素；JPG 不支持透明，转换时填白底并提示。JPEG 的 EXIF 方向在转换时校正。动画 WebP 转静态图片只保留第一帧并提示。
- MP4 默认 H.264 视频＋AAC 音频；GIF 宽度不超过 720 像素、12 帧/秒、无声音，不自动截短。提取声音时没有音轨会中文报错。
- CSV/TSV 只导出第一张工作表的值，不保留公式、样式或其他工作表；未保存计算结果的公式会失败，需先在 Excel 计算并保存。分隔文本导入保留字符串，避免把 `00123` 自动变成 `123`。表格上限 10 万行／100 万单元格。
- PPT 图片每页一张，按页码保存到 ZIP 中的 `slides/`；最多 200 页，最长边不超过 2048 像素。图片和 PDF 不保留演示动画。
- TXT/MD/CSV/TSV 接受 UTF-8 或带 BOM 的 UTF-16；其他编码请先另存为 UTF-8。
- PDF→Word 为实验功能，排版可能变化，扫描件不会自动识别文字。复杂 Office 文件也可能因字体或兼容性改变排版，请核对结果。
- 不覆盖原文件或任何已有目标文件；默认名为 `原名-转换.目标扩展名`，多页图片使用 `.zip`。
- Office 压缩文件的解压内容上限 256 MB；损坏、加密、超限或无法保存都会显示中文原因。
- 窗口继续透明、无边框、置顶、可拖动；只有人物、气泡和菜单附近接收鼠标。

## 代码在做什么

| 文件 | 用新手能理解的话解释 |
| --- | --- |
| `src/main.cjs` | 管理 Mac 窗口、系统保存对话框以及真正的文件操作。 |
| `src/preload.cjs` | 界面和 Node.js 之间的一座小桥，只开放需要的操作。 |
| `src/converter.cjs` | 检查文件、保留 Word/PDF 转换、验证输出、保护保存和清理。 |
| `src/formats.cjs` | 列出可选格式、检查媒体工具，并处理图片、音视频、表格、PPT 图片和文本。 |
| `src/index.html` / `style.css` | 人物、白色气泡和按钮的外观。 |
| `src/renderer.js` | 拖入、粒子、视频切换、格式选择和结果反馈的流程。 |
| `src/sound.cjs` | 检查导入音效的格式和大小，并把音效副本与选择保存在本机。 |

沿用现有界面，没有引入前端框架或转换 HTTP 服务。Sharp、ExcelJS、CSV 解析/生成工具和 Marked 各自承担一个实际转换任务；来源和许可见 [第三方说明](THIRD_PARTY_NOTICES.md)。调用本机工具使用 Node.js 自带的 `execFile`，参数单独传递，文件名不会被当作终端命令执行。每次转换都在临时目录使用独立 LibreOffice 配置，禁用宏和自动更新链接，转换完成或失败后清理；界面启用隔离与沙箱，仅加载本地内容。

无界面转换会显式使用 Mac 的系统字体、用户字体和 LibreOffice 字体，并把字体缓存放入临时目录，避免中文因字体未加载变成空白。若你已设置 `FONTCONFIG_FILE`，会保留你的配置。

## 验证

```bash
npm test
npm run test:integration
npm run test:formats
```

第一个命令检查无效输入、特殊文件名、原文件保护、已有目标保护、失败结果和临时文件清理。它使用假转换程序验证文件保护逻辑，不能替代真实转换检查。

第二个命令需要安装 LibreOffice，实际生成 Word、转成 PDF、再转回 Word，检查文字与原文件是否保留。样例输出保存在 `artifacts/`，方便打开检查排版。能力检测失败会报错，不会跳过检查后宣称成功。

`npm run test:formats` 使用自建样例验证 65 条新格式转换方向及中文失败，结果和方向清单保存到 `artifacts/format-expansion/`。`npm run test:formats-ui` 检查六类文件的多个按钮、非默认目标、保存扩展名、取消、失败和结束回待机；也需要同样的 Playwright 设置。

如果 LibreOffice 安装在非标准位置，可用 `SOFFICE_PATH` 指定完整的 soffice 路径。正常安装到 `/Applications/LibreOffice.app` 时不需要配置。

另有可选的桌面界面检查 `npm run test:ui`，需要本机已有 Playwright，或通过 `PLAYWRIGHT_MODULE` 指定其模块路径。Playwright 只用于开发检查，不是应用依赖。此检查启动真实 Electron 窗口，用真实磁盘文件触发接收流程并保存截图；它替代系统保存对话框，不能替代 Finder 拖拽与原生保存对话框的检查。

默认音效相关的界面检查（test:ui、test:menu）需自行准备有适用授权的有效 MP3，放到 Git 忽略的 assets/duck-sound/Ya1.mp3；本仓库不提供上游音频，也不自动下载。基础 npm test 不依赖这个文件。公开发布核查和历史验证边界见 [docs/VALIDATION.md](docs/VALIDATION.md)。

`npm run test:menu` 使用同样的 Playwright 设置，检查菜单、MP3/WAV 导入、损坏音频保护、重启保存、默认音效恢复和退出。使用隔离的临时配置，不修改日常使用的音效；原生文件选择对话框在测试中被替代。

FFmpeg、ffprobe、Poppler 位于非标准位置时，可分别设置 `FFMPEG_PATH`、`FFPROBE_PATH`、`PDFTOPPM_PATH` 为完整可执行文件路径。Poppler 的 `pdfinfo` 必须在 `pdftoppm` 同一目录。
