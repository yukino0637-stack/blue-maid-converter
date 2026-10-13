# 蓝毛小女仆 v0.2.0

桌面上的蓝毛小女仆，也是本地文件转换助手。把文件拖给人物，在气泡里选择格式并保存结果。

- 支持文档、图片、音视频、表格、PPT、文本、电子书、字幕和 ZIP 图片转换。
- Word/PDF→Markdown、扫描文字 OCR、PDF→Excel、批量转换、图片/PDF 合并、PDF 拆分与加解密。
- 保留悬停菜单、活动列表、空闲随机动作、点击回应、拖拽/落地动画和自定义音效。
- 提供 macOS Apple Silicon 的 DMG/ZIP，以及 Windows 10/11 x64 的 EXE 安装包，附 SHA256SUMS.txt。
- 文件在本机处理；转换引擎仍需按需安装，缺少工具时中文提示。

98 个输入扩展名、1,177 个规则组合包含别名和实验格式；转换扩展的 Mac 样例验收覆盖 72 个输入、771 个不同组合，不意味着所有特殊编码或复杂排版均正确。Windows 安装包经过 Windows runner 的真实转换和安装后界面检查，不能替代每台 Windows 电脑的人工验收；可选 Python 表格引擎不随包分发，Windows 版该可选引擎尚未等价验收。

本版没有开发者签名证书；Mac 使用临时签名，未公证；Windows 未进行发布者签名。详细安装步骤与工具来源见 [安装说明](https://github.com/yukino0637-stack/blue-maid-converter/blob/main/docs/INSTALL.md)。

人物动画来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，保留非商用与署名要求。格式规则参考 [FlyingMouse Format](https://github.com/LaoFeng-mouse/flyingmouse-format)，转换接入、保护机制与桌宠交互由本项目通过 vibe coding 独立编写和整合；底层转换能力由各第三方工具提供。完整来源见 ATTRIBUTION.md 和 THIRD_PARTY_NOTICES.md。

公开版不分发缺少授权的小黄鸭音频，请通过菜单导入自有或有适用授权的 MP3/WAV。

本版 Mac / Windows 的真实转换、安装后界面检查及下载校验详见 [双平台验收记录](https://github.com/yukino0637-stack/blue-maid-converter/blob/main/docs/RELEASE-VALIDATION-v0.2.0.md)；[构建与测试日志](https://github.com/yukino0637-stack/blue-maid-converter/actions/runs/38396608873)全部通过。
