# v0.2.0 双平台发布验收

2026-10-13，发布源码提交 `02fd64a6a9da20df789bfe43a48696c60a85e3cf`。

- [完整构建、转换、安装与界面测试日志](https://github.com/yukino0637-stack/blue-maid-converter/actions/runs/38396608873)
- [正式 Release 和安装包](https://github.com/yukino0637-stack/blue-maid-converter/releases/tag/v0.2.0)

## 实际通过的检查

| 检查 | Mac | Windows |
| --- | --- | --- |
| 原生运行环境 | macOS 15.7.9 / arm64 | Windows Server 2025 / x64，GitHub 托管 runner |
| 基础与安全测试 | 19 项通过 | 10 项通过；1 项 POSIX 假工具测试明确跳过，由真实转换检查补充 |
| 原有实际格式转换 | 65 个转换方向通过，验证原件字节不变 | 同样 65 个方向通过，含 HEIC/HEIF、音视频、表格、PPT、文本 |
| 发布专项转换 | Word/Markdown 图片公式、Word/PDF 已知文字、PDF 加解密、批量附件、中文 Excel、原件与已有结果保护 | 同一套真实样例通过 |
| 打包内容 | DMG / ZIP，arm64 原生图片依赖 | NSIS EXE，x64 原生图片依赖 |
| 打包后运行 | 独立应用通过界面检查 | 实际运行 EXE 安装器，安装成功后运行安装目录中的应用，通过界面检查 |

界面检查覆盖 Word→Markdown 附件、PDF→XLSX 参数和保存扩展名、PDF 拆分/加密、批量 Markdown、图片合并、取消回格式列表、结束动画一次播放后回待机，并检查没有页面异常。测试通过应用的真实转换调用保存文件，但系统保存对话框和文件拖放事件由测试驱动替代；不等于在每台 Windows 10/11 电脑上完成了人工鼠标验收。

安装包检查确认 98 个输入扩展名规则、106 份人物视频、对应平台的原生图片依赖和字体许可齐全；不包含测试目录、私人文件、本机模型、构建缓存或无再分发授权的小黄鸭音效。

## 修复和边界

- Windows 图片处理不再保留导致临时目录删除失败的 Sharp 缓存句柄；连续转换回归检查通过。
- 工具定位兼容 Windows 的 `.exe` / LibreOffice `.com`、Program Files 和 PATH；Office ZIP 读取使用现有 Node 依赖。
- Windows HEIC 使用用户单独安装的 ImageMagick，Mac 使用 sips。实际解码后检查尺寸，保留资源和像素上限。极小 HEIC 的编码填充可能被外部解码器安全限制拒绝；样例采用普通尺寸的自生成图片，不关闭解码器保护。
- Windows 安装工具步骤对软件源临时超时进行最多三次重试，安装失败会阻止后续发布。
- 1,177 个规则组合不是 1,177 项 Windows 实测。更完整的 Mac 样例矩阵和未验证 RAW/WPS 等输入见 [转换验收](CONVERSION-VALIDATION.md)。
- 可选 Python/PaddleOCR 表格模型不随安装包分发；Windows 可选结构引擎尚未等价验收。复杂排版、扫描表格和特殊编码需要用户核对结果。
- 转换工具由用户按需安装，文件在本机处理。Mac 临时签名、未公证，Windows 无发布者签名。
- 本次生产依赖审计无已知问题；构建工具依赖链仍有 8 项 moderate 报告，涉及 sprintf-js 的传递依赖。构建工具不随应用分发，未用强制降级掩盖报告。

独立应用未修改现有活动清单、菜单样式、音效模块或 Mac 后台快捷键程序。Windows 使用安装器创建的快捷方式启动。

## 下载包校验

从正式 Release 重新下载三个安装包，与发布的 `SHA256SUMS.txt` 核对，三个文件全部一致：

```text
8d2437bcfed6c9b2e60e571bdf39ac02a2d1e4265b9928ae5cba72428a5e31db  BlueMaid-0.2.0-Windows-x64-Setup.exe
ed856cdd21311e93b89e7fdc43f790fb73278313c1f79619cec7f66a5f30a7db  BlueMaid-0.2.0-macOS-arm64.dmg
98ef6b2523640f1b0a43657a29e34728b5dbe11ac7e7227ae2a2e7cf0842840a  BlueMaid-0.2.0-macOS-arm64.zip
```

EXE 外层是 NSIS 的 32 位安装器，内层应用及原生依赖为 x64；外层 `file` 显示 PE32 不代表应用是 32 位。安装和运行证据在上方 Windows job 中。
