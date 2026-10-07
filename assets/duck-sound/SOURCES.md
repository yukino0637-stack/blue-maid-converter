# 小黄鸭点击音效来源

来源：https://github.com/Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl
固定提交：`24feb651d7991cbefc46666422883635f06f333e`
原文件：`assets/Ya1.mp3`（上游“小黄鸭·按下”预设）
SHA-256：`0ad8f934ae5fa3cbd42745e086a56aa6532766618c6a620b860a795bdc7689f9`

音频原样保存，只复用这一段短音效；每次空闲左键点击人物播放一次，不循环、不播放上游的松开音频。播放器使用浏览器自带 Audio，没有引入上游 DSH 插件或其资源服务。

同目录 LICENSE 保留上游代码的 MIT 许可和作者版权声明，不能据此认定音频采用 MIT。

2026-10-07 发布核对发现，上游 [PROVENANCE.md](https://github.com/Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl/blob/main/PROVENANCE.md) 明确将 `assets/**` 的图片、GIF 和音频排除在代码的 MIT 许可之外；包括 Ya1.mp3 在内的素材仅按原样供该插件运行使用，不授予重新许可。尚未取得独立再分发授权，因此本项目公开仓库不包含 Ya1.mp3，也不包含其他上游音频。`.gitignore` 排除本目录的 MP3/WAV；本机已有文件不删除。

公开版本可在人物菜单的“声音 → 导入音效”中导入自己有权使用的 MP3/WAV。没有本地默认音频时，默认小黄鸭选项不会发声。基础测试使用自行生成的文件字节，不依赖这份素材；涉及默认音效的界面测试需要先准备有权使用的音频。
