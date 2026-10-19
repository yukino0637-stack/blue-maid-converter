// 皮肤清单；渲染页与主进程共用。每套皮肤是 assets 下的一个目录，文件名与 dsh-pet 原动画一致。
// 皮肤目录缺少的动画自动沿用原装 dsh-pet 动画，因此新皮肤天然继承全部动作。
const petSkins = {
  classic: { label: '蓝毛女仆', note: '原装', dir: 'dsh-pet' },
  hoodie: { label: '奶油卫衣', note: '卫衣 · 百褶裙', dir: 'skins/hoodie' },
};

if (typeof module !== 'undefined') module.exports = petSkins;
