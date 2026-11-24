# Claude 皮肤

可选皮肤。默认仍是蓝毛小女仆，素材和播放路径都不变。

`claude-character.png` 是收到的原始 PNG，字节未改。SHA-256：`c1e376c5fd17281ba57f894a2829f893213d16b6f963fe5d181d8ea1281b262c`。

五段 WebM 只用这张整图：等比放进 640×360 透明画布，不裁切，上下平移不超过 2 像素。没有新姿势，也没有重绘工牌上的「Claude」。编码为 VP9（yuva420p，`alpha_mode=1`，CRF 8，关闭降噪和备用参考帧），画面仍按原来的 256×144 显示。

| 文件 | 播放 |
| --- | --- |
| `idle.webm` | 待机循环 |
| `working.webm` | 转换中循环 |
| `finish.webm` | 成功，播放一次 |
| `interaction.webm` | 点击，播放一次 |
| `drag.webm` | 拖拽循环；松手从 4 秒播放落地，不使用女仆的 8.5 秒 |
