const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_SOUND_BYTES = 10 * 1024 * 1024;

async function readLimited(filePath, limit) {
  const handle = await fs.open(filePath, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0 || info.size > limit) throw new Error('请选择非空的音频文件，大小不能超过 10 MB。');
    const buffer = Buffer.alloc(Math.min(info.size + 1, limit + 1));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== info.size) throw new Error('音频文件发生变化，请重新导入。');
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}

async function readSound(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.mp3', '.wav'].includes(extension)) throw new Error('目前只支持 MP3 或 WAV 音效喵。');
  try {
    const bytes = await readLimited(filePath, MAX_SOUND_BYTES);
    const mime = extension === '.mp3' ? 'audio/mpeg' : 'audio/wav';
    return { name: path.basename(filePath), src: `data:${mime};base64,${bytes.toString('base64')}` };
  } catch (error) {
    if (error.code) throw new Error('音效文件无法读取，请检查文件是否存在或有读取权限喵。');
    throw error;
  }
}

function validateSettings(value) {
  if (!value || !['duck', 'custom'].includes(value.selected)) throw new Error('保存的音效设置无效，请重新导入。');
  if (value.custom) {
    const { name, src } = value.custom;
    if (typeof name !== 'string' || !name || name.length > 255 || typeof src !== 'string' ||
        !/^data:audio\/(?:mpeg|wav);base64,[A-Za-z0-9+/]+={0,2}$/.test(src) ||
        Buffer.byteLength(src.split(',')[1], 'base64') > MAX_SOUND_BYTES) {
      throw new Error('保存的音效设置无效，请重新导入。');
    }
  }
  if (value.selected === 'custom' && !value.custom) throw new Error('还没有导入自定义音效喵。');
  return { selected: value.selected, custom: value.custom || null };
}

async function loadSoundSettings(directory) {
  try {
    const bytes = await readLimited(path.join(directory, 'click-sound.json'), Math.ceil(MAX_SOUND_BYTES * 4 / 3) + 4096);
    return validateSettings(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { selected: 'duck', custom: null };
    throw new Error('保存的音效无法读取，已使用小黄鸭，请重新导入。');
  }
}

async function saveSoundSettings(directory, value) {
  const settings = validateSettings(value);
  const temporary = path.join(directory, `.click-sound-${randomUUID()}.tmp`);
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(settings), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, path.join(directory, 'click-sound.json'));
  } catch (error) {
    throw new Error('音效保存失败，请检查应用数据目录是否可以写入喵。');
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return settings;
}

module.exports = { readSound, loadSoundSettings, saveSoundSettings };
