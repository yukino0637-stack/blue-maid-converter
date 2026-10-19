const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const petSkins = require('./skins.js');

const FILE = 'pet-skin.json';
const assetsRoot = path.join(__dirname, '..', 'assets');

// 列出每套皮肤目录中实际存在的 WebM 动画名（不含扩展名）。
async function listSkins() {
  const skins = [];
  for (const [id, skin] of Object.entries(petSkins)) {
    let files = [];
    try {
      files = (await fs.readdir(path.join(assetsRoot, skin.dir)))
        .filter(name => name.toLowerCase().endsWith('.webm'))
        .map(name => name.slice(0, -5));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    skins.push({ id, label: skin.label, note: skin.note, dir: skin.dir, files });
  }
  return skins;
}

function validId(id) {
  return typeof id === 'string' && Object.hasOwn(petSkins, id);
}

async function loadSkin(directory) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(directory, FILE), 'utf8'));
    return validId(value?.selected) ? value.selected : 'classic';
  } catch {
    return 'classic';
  }
}

async function saveSkin(directory, id) {
  if (!validId(id)) throw new Error('没有这套皮肤鲸。');
  const temporary = path.join(directory, `.pet-skin-${randomUUID()}.tmp`);
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(temporary, JSON.stringify({ selected: id }), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, path.join(directory, FILE));
  } catch {
    throw new Error('皮肤保存失败，请检查应用数据目录是否可以写入鲸。');
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return id;
}

module.exports = { listSkins, loadSkin, saveSkin };
