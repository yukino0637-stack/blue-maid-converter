const sharp = require('sharp');
const { fs, path, command, checkOutput } = require('./conversion-utils.cjs');
const RAW = new Set('cr2 cr3 crw nef arw dng raf rw2 orf pef srw 3fr erf fff iiq kdc mef mrw x3f'.split(' '));
const AUDIO = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wma'];
async function preparedImage(input, source, workspace, tools) {
  let prepared = input;
  const png = path.join(workspace.dir, 'decoded.png');
  if (RAW.has(source.ext)) {
    await command(tools.rawPath, ['-T', '-w', '-6', input], 180_000, { cwd: workspace.dir });
    prepared = input.replace(/\.[^.]+$/, '.tiff');
  } else if (source.ext === 'jxl') {
    const ppm = path.join(workspace.dir, 'decoded.ppm');
    await command(tools.djxlPath, [input, ppm]);
    await command(tools.ffmpegPath, ['-v', 'error', '-i', ppm, '-frames:v', '1', png]); prepared = png;
  } else if (['heic', 'heif'].includes(source.ext)) {
    if (process.platform === 'darwin') await command('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', png]);
    else {
      if (!tools.heif || !tools.magickPath) throw new Error('HEIC 解码工具未安装鲸。' + require('./platform-tools.cjs').installHint('heif'));
      await command(tools.magickPath, ['-limit', 'memory', '256MiB', '-limit', 'map', '256MiB', input + '[0]', png]);
    }
    prepared = png;
  } else if (source.ext === 'ai') {
    const head = (await fs.readFile(input)).subarray(0, 1024).toString('latin1');
    if (!head.includes('%PDF-')) throw new Error('仅支持含 PDF 兼容内容的 AI 文件鲸。请在 Illustrator 中启用 PDF 兼容后另存。');
    await command(tools.pdftoppmPath, ['-f', '1', '-singlefile', '-png', '-scale-to', '4096', input, png.slice(0, -4)]); prepared = png;
  } else if (source.ext === 'svg') {
    const text = await fs.readFile(input, 'utf8');
    require('./conversion-utils.cjs').xml(text);
    if (/(?:href\s*=\s*["'](?!#|data:)|url\s*\(\s*(?!#)|<script|<foreignObject)/i.test(text)) throw new Error('SVG 包含外部资源或脚本鲸，请先移除后重试。');
  } else if (['psd', 'bmp', 'ico', 'tga', 'jp2', 'j2k', 'qoi', 'ppm'].includes(source.ext)) {
    await command(tools.ffmpegPath, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input, '-frames:v', '1', png]); prepared = png;
  }
  const info = await sharp(prepared, { limitInputPixels: 40_000_000 }).metadata();
  if (!info.width || !info.height || info.width * info.height > 40_000_000) throw new Error('图片无效或超过 4000 万像素鲸。');
  return { prepared, info };
}
async function image(input, target, workspace, source, tools) {
  const { prepared, info } = await preparedImage(input, source, workspace, tools);
  const output = path.join(workspace.dir, 'result.' + target), warnings = [];
  const animated = (info.pages || 1) > 1;
  if (['mp4', 'webm'].includes(target)) {
    const args = ['-v', 'error', '-nostdin'];
    let duration = 3;
    if (animated && ['gif', 'webp', 'avif'].includes(source.ext)) {
      const { data, info: frames } = await sharp(prepared, { animated: true, limitInputPixels: 40_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const height = info.pageHeight || info.height, count = Math.floor(frames.height / height);
      if (count > 500 || frames.width * frames.height > 40_000_000) throw new Error('动画超过 500 帧或总计 4000 万像素鲸。');
      const listing = [], frameBytes = frames.width * height * frames.channels; duration = 0;
      for (let index = 0; index < count; index++) {
        const name = 'frame-' + String(index).padStart(4, '0') + '.png';
        let frame = sharp(data.subarray(index * frameBytes, (index + 1) * frameBytes), { raw: { width: frames.width, height, channels: frames.channels } });
        if (target === 'mp4') frame = frame.flatten({ background: 'white' });
        await frame.png().toFile(path.join(workspace.dir, name));
        const seconds = Math.max(.01, Math.min(60, (info.delay?.[index] || 100) / 1000)); duration += seconds;
        listing.push("file '" + name + "'", 'duration ' + seconds);
      }
      listing.push("file 'frame-" + String(count - 1).padStart(4, '0') + ".png'");
      const concat = path.join(workspace.dir, 'animation-frames.txt'); await fs.writeFile(concat, listing.join('\n'));
      args.push('-f', 'concat', '-safe', '1', '-protocol_whitelist', 'file,pipe', '-i', concat, '-fps_mode', 'vfr');
      warnings.push('按帧保留动画时序，导出一次播放周期，不含声音鲸。');
    } else {
      const png = path.join(workspace.dir, 'still.png');
      let frame = sharp(prepared, { limitInputPixels: 40_000_000 }).rotate();
      if (target === 'mp4') frame = frame.flatten({ background: 'white' });
      await frame.png().toFile(png); args.push('-loop', '1', '-i', png);
      warnings.push('已生成 3 秒静态视频，不含声音鲸。');
    }
    args.push('-t', String(duration), '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', target === 'mp4' ? 'libx264' : 'libvpx-vp9',
      '-pix_fmt', target === 'webm' ? 'yuva420p' : 'yuv420p', '-an', output);
    await command(tools.ffmpegPath, args, 300_000);
    if (target === 'mp4' && info.hasAlpha) warnings.push('MP4 不保存透明通道，背景已变为白色鲸。');
  } else if (['png', 'jpg', 'webp', 'gif', 'avif', 'tiff'].includes(target)) {
    let pipeline = sharp(prepared, { animated: animated && ['gif', 'webp'].includes(target), limitInputPixels: 40_000_000 }).rotate();
    if (target === 'jpg') pipeline = pipeline.flatten({ background: '#ffffff' });
    await pipeline.toFormat(target === 'jpg' ? 'jpeg' : target, { quality: 90 }).toFile(output);
    if (animated && !['gif', 'webp'].includes(target)) warnings.push('目标格式只导出第一帧鲸。');
  } else {
    const png = path.join(workspace.dir, 'encode.png');
    await sharp(prepared, { limitInputPixels: 40_000_000 }).rotate().png().toFile(png);
    if (target === 'jxl') await command(tools.cjxlPath, [png, output, '-d', '1']);
    else {
      const codecs = { bmp: 'bmp', tga: 'targa', jp2: 'jpeg2000', qoi: 'qoi', ppm: 'ppm', ico: 'bmp' };
      await command(tools.ffmpegPath, ['-v', 'error', '-i', png, '-frames:v', '1', ...(target === 'ico' ? ['-vf', 'scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-f', 'ico'] : []), '-c:v', codecs[target], output]);
    }
    if (animated) warnings.push('此格式仅导出第一帧鲸。');
    if (target === 'ppm') warnings.push('PPM 不保存透明通道鲸。');
  }
  if (source.ext === 'psd') warnings.push('PSD 已合并为单张图片，不保留图层鲸。');
  if (source.ext === 'ai') warnings.push('仅导出 AI 的第一页，矢量内容栅格化鲸。');
  await checkOutput(output);
  return { output, warnings };
}
async function media(input, target, workspace, source, tools, params = {}) {
  const { probeMedia } = require('./formats.cjs');
  const original = await probeMedia(input, tools);
  if (!original.streams?.some(s => s.codec_type === source.category)) throw new Error('文件中没有对应的音频或视频轨道鲸。');
  const output = path.join(workspace.dir, 'result.' + target);
  const args = ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe', '-i', input];
  const warnings = [];
  if (AUDIO.includes(target)) {
    if (!original.streams.some(s => s.codec_type === 'audio')) throw new Error('这个视频没有音轨鲸。');
    const codecs = { mp3: ['libmp3lame', '-q:a', '2'], wav: ['pcm_s16le'], flac: ['flac'], m4a: ['aac', '-b:a', '192k'], aac: ['aac', '-b:a', '192k'],
      ogg: ['vorbis', '-strict', 'experimental', '-ac', '2', '-b:a', '192k'], opus: ['libopus', '-b:a', '128k'], wma: ['wmav2', '-b:a', '192k'] };
    args.push('-map', '0:a:0', '-vn', '-c:a', ...codecs[target]);
    if (source.category === 'video') warnings.push('只提取第一条音轨，不保留画面鲸。');
    if (target === 'ogg') warnings.push('OGG 使用本机 Vorbis 编码器，输出为双声道鲸。');
  } else if (target === 'gif') {
    args.push('-filter_complex', 'fps=12,scale=min(720\\,iw):-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-an', '-loop', '0');
    warnings.push('GIF 无声音，12 帧/秒，宽度不超过 720 像素鲸。');
  } else {
    const encoding = params.encoding || 'h264';
    if (!['h264', 'h265', 'av1'].includes(encoding)) throw new Error('不支持的视频编码鲸。');
    const encoder = target === 'webm' ? 'libvpx-vp9' : { h264: 'libx264', h265: 'libx265', av1: 'libsvtav1' }[encoding];
    args.push('-map', '0:v:0', '-map', '0:a:0?', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', encoder, '-pix_fmt', 'yuv420p', '-c:a', target === 'webm' ? 'libopus' : 'aac');
    if (['mp4', 'mov'].includes(target)) args.push('-movflags', '+faststart');
    if (encoding === 'h265' && ['mp4', 'mov'].includes(target)) args.push('-tag:v', 'hvc1');
    warnings.push('保留第一条视频和音轨，不保留字幕、章节及其他轨道鲸。');
  }
  args.push('-fs', String(512 * 1024 * 1024), output); await command(tools.ffmpegPath, args, 30 * 60_000); await checkOutput(output);
  if ((await fs.stat(output)).size >= 512 * 1024 * 1024) throw new Error('音视频结果达到 512 MB 限制，已停止鲸。');
  const converted = await probeMedia(output, tools);
  const kind = AUDIO.includes(target) ? 'audio' : 'video';
  if (!converted.streams?.some(s => s.codec_type === kind)) throw new Error('转换结果缺少对应轨道鲸。');
  const before = Number(original.format?.duration), after = Number(converted.format?.duration);
  if (Number.isFinite(before) && Number.isFinite(after) && Math.abs(before - after) > Math.max(1, before * 0.02)) throw new Error('转换结果时长不完整鲸。');
  return { output, warnings };
}
module.exports = { RAW, AUDIO, preparedImage, image, media };
