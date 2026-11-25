const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const skinDir = path.join(root, 'assets/claude-skin');
const pngHash = 'c1e376c5fd17281ba57f894a2829f893213d16b6f963fe5d181d8ea1281b262c';
const order = ['idle', 'working', 'finish', 'drag', 'fail', 'wave', 'hop', 'shy', 'pout', 'look', 'stretch', 'cube', 'think', 'sort', 'pace', 'tail', 'sidestep', 'squish', 'startle', 'bow', 'mirror', 'sway', 'violin', 'kite', 'kick'];

test('25 段 Claude 透明动画、原图和女仆素材一起打包', () => {
  const png = fs.readFileSync(path.join(skinDir, 'claude-character.png'));
  assert.equal(createHash('sha256').update(png).digest('hex'), pngHash);
  const clips = JSON.parse(fs.readFileSync(path.join(skinDir, 'clips.json'), 'utf8'));
  assert.deepEqual(clips.map(clip => clip.key), order);
  assert.equal(fs.existsSync(path.join(skinDir, 'interaction.webm')), false);
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(yml, /assets\/claude-skin\/\*\*\/\*/);
  assert.match(yml, /assets\/dsh-pet\/\*\*\/\*/);
  const maid = fs.readdirSync(path.join(root, 'assets/dsh-pet')).filter(name => name.endsWith('.webm'));
  assert.equal(maid.length, 106);
  const notes = fs.readFileSync(path.join(skinDir, 'SOURCES.md'), 'utf8');
  assert.match(notes, /整理纸张/);
  assert.match(notes, /抬腿踢出/);
  assert.match(notes, /不是逐帧复刻/);
  for (const clip of clips) {
    const file = path.join(skinDir, `${clip.key}.webm`);
    const bytes = fs.readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
    const probe = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,avg_frame_rate:stream_tags=alpha_mode',
      '-show_entries', 'format=duration', '-of', 'json', file,
    ], { encoding: 'utf8' });
    const info = JSON.parse(probe);
    const video = info.streams.find(stream => stream.codec_type === 'video');
    assert.equal(info.streams.some(stream => stream.codec_type === 'audio'), false, clip.key);
    assert.equal(video.codec_name, 'vp9');
    assert.equal(video.width, 640);
    assert.equal(video.height, 360);
    assert.equal(video.avg_frame_rate, '24/1');
    assert.equal(video.tags.alpha_mode, '1');
    assert.ok(Number(info.format.duration) > 9);
    const raw = execFileSync('ffmpeg', [
      '-v', 'error', '-c:v', 'libvpx-vp9', '-i', file, '-frames:v', '1',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
    ], { maxBuffer: 20 * 1024 * 1024 });
    assert.equal(raw.length, 640 * 360 * 4);
    assert.equal(raw[3], 0, `${clip.key} 左上角应透明`);
    let opaque = 0;
    for (let i = 3; i < raw.length; i += 16) if (raw[i] > 200) opaque++;
    assert.ok(opaque > 100, `${clip.key} 应有不透明的角色像素`);
  }
});
