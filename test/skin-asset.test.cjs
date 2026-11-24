const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const skinDir = path.join(root, 'assets/claude-skin');
const pngHash = 'c1e376c5fd17281ba57f894a2829f893213d16b6f963fe5d181d8ea1281b262c';

test('Claude 原图按字节保存，打包名单同时包含新皮肤和全部女仆 WebM', () => {
  const png = fs.readFileSync(path.join(skinDir, 'claude-character.png'));
  assert.equal(createHash('sha256').update(png).digest('hex'), pngHash);
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.match(yml, /assets\/claude-skin\/\*\*\/\*/);
  assert.match(yml, /assets\/dsh-pet\/\*\*\/\*/);
  const maid = fs.readdirSync(path.join(root, 'assets/dsh-pet')).filter(name => name.endsWith('.webm'));
  assert.equal(maid.length, 106);
  for (const name of ['idle.webm', 'working.webm', 'finish.webm', 'interaction.webm', 'drag.webm']) {
    const file = path.join(skinDir, name);
    const probe = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:stream_tags=alpha_mode',
      '-of', 'default=nw=1', file,
    ], { encoding: 'utf8' });
    assert.match(probe, /width=640/);
    assert.match(probe, /height=360/);
    assert.match(probe, /alpha_mode=1/);
    assert.ok(fs.statSync(file).size > 1000);
  }
});
