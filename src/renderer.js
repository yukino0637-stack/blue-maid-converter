const $ = id => document.getElementById(id);
const bubble = $('bubble');
const formatTemplate = $('format').cloneNode(true);
const petArea = $('pet-area');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let state = 'idle';
let file;
let tool;
let toolError;
let moving;
let dragDepth = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const videos = { idle: $('cat-idle'), working: $('cat-working'), finish: $('cat-finish'), interaction: $('cat-interaction'), drag: $('cat-drag') };
const dragLandingStart = 8.5; // 拖拽素材末尾的落地段起点（秒）。
const actions = petActions;
const idleActions = Object.keys(actions);
const clickActions = Object.keys(actions).filter(action => ['转向', '点击回应'].includes(actions[action].category) || actions[action].video.startsWith('点击回应-'));
const idleActionDelay = 60_000;
let idleActionTimer;
let actionMenuOpen = false;
let animation;
let bounce;
const clickSound = new Audio(new URL('../assets/duck-sound/Ya1.mp3', location.href).href);
clickSound.preload = 'auto';
clickSound.volume = .5;
const defaultSoundSrc = clickSound.src;
const petMenu = $('pet-menu');
let soundSettings = { selected: 'duck', custom: null };
let soundChanging = true;
let hoverCloseTimer;
let activityCategory;
// 皮肤：目录内存在的动画用皮肤版本，缺少的回落到原装 dsh-pet。
let skinState = { selected: 'classic', skins: [] };
let skinChanging = false;
const coreVideos = { idle: '待机呼吸休闲', working: '工作状态-忙碌点按', finish: '工作状态-雀跃庆祝', drag: '被鼠标拖拽悬空反馈' };
function videoUrl(name) {
  const skin = skinState.skins.find(item => item.id === skinState.selected);
  const dir = skin && skin.files.includes(name) ? skin.dir : 'dsh-pet';
  return new URL(`../assets/${dir}/${name}.webm`, location.href).href;
}
for (const [action, { label, category }] of [...Object.entries(actions), ['idle', { label: '回到待机' }]]) {
  if (category && category !== activityCategory) {
    const heading = document.createElement('h2');
    heading.textContent = category;
    $('activity-list').append(heading);
    activityCategory = category;
  }
  const button = document.createElement('button');
  button.dataset.action = action;
  button.textContent = label;
  $('activity-list').append(button);
}

function showMenuCard(card) {
  $('menu-home').hidden = Boolean(card);
  $('activity-card').hidden = card !== 'activity';
  $('skin-card').hidden = card !== 'skin';
  $('activity-toggle').setAttribute('aria-expanded', String(card === 'activity'));
  $('skin-toggle').setAttribute('aria-expanded', String(card === 'skin'));
  petMenu.scrollTop = 0;
  updateRegions();
}
function showActivityList(show) { showMenuCard(show ? 'activity' : null); }

function renderSkins() {
  const list = $('skin-list');
  list.replaceChildren(...skinState.skins.map(skin => {
    const button = document.createElement('button');
    button.dataset.skin = skin.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(skin.id === skinState.selected));
    const swatch = document.createElement('i');
    swatch.className = `skin-swatch ${skin.id}`;
    swatch.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    const name = document.createElement('b');
    name.textContent = skin.label;
    const note = document.createElement('small');
    const all = [...new Set([...Object.values(coreVideos), ...Object.values(actions).map(action => action.video)])];
    const own = all.filter(video => skin.files.includes(video)).length;
    note.textContent = skin.note;
    text.append(name, note);
    if (skin.id !== 'classic') {
      const progress = document.createElement('small');
      progress.textContent = `已换好 ${own}/${all.length} 个动作`;
      text.append(progress);
    }
    button.append(swatch, text);
    button.addEventListener('click', () => changeSkin(skin.id));
    return button;
  }));
  updateMenu();
}

function applySkinVideos() {
  for (const [name, video] of Object.entries(coreVideos)) {
    const src = videoUrl(video);
    if (videos[name].src !== src) videos[name].src = src;
  }
  if (animation && animation !== 'interaction') playAnimation(animation, true);
}

async function changeSkin(id) {
  if (skinChanging || !canInteract() || id === skinState.selected) return;
  skinChanging = true;
  updateMenu();
  try {
    skinState.selected = await window.cat.selectSkin(id);
    applySkinVideos();
    renderSkins();
    $('menu-status').textContent = '换好啦，下次打开还穿这套。';
    interact('wave');
  } catch (error) { $('menu-status').textContent = error.message; }
  finally { skinChanging = false; updateMenu(); }
}

function updateMenu() {
  $('activity-toggle').disabled = !canInteract();
  for (const button of petMenu.querySelectorAll('[data-action]')) button.disabled = !canInteract();
  for (const id of ['sound-duck', 'sound-custom', 'sound-import']) $(id).disabled = soundChanging || !canInteract();
  $('skin-toggle').disabled = !canInteract();
  for (const button of petMenu.querySelectorAll('[data-skin]')) button.disabled = skinChanging || !canInteract();
  $('sound-duck').setAttribute('aria-pressed', String(soundSettings.selected === 'duck'));
  $('sound-custom').setAttribute('aria-pressed', String(soundSettings.selected === 'custom'));
  $('sound-custom').hidden = !soundSettings.custom;
  $('sound-custom').textContent = soundSettings.custom?.name || '';
  $('sound-custom').title = soundSettings.custom?.name || '';
  $('menu-quit').disabled = state === 'converting';
  scheduleIdleAction();
}

function canAutoAct() {
  return state === 'idle' && animation === 'idle' && !moving && !dragDepth &&
    petMenu.hidden && bubble.hidden && !actionMenuOpen && !soundChanging && !skinChanging;
}

function scheduleIdleAction() {
  clearTimeout(idleActionTimer);
  idleActionTimer = undefined;
  if (!canAutoAct()) return;
  idleActionTimer = setTimeout(() => {
    idleActionTimer = undefined;
    if (canAutoAct()) interact(idleActions[Math.floor(Math.random() * idleActions.length)]);
  }, idleActionDelay);
}

function closeMenu() {
  clearTimeout(hoverCloseTimer);
  petMenu.hidden = true;
  showActivityList(false);
  $('menu-toggle').setAttribute('aria-expanded', 'false');
  $('menu-toggle').hidden = !petArea.matches(':hover');
  bubble.style.visibility = '';
  updateRegions();
}

function openMenu() {
  clearTimeout(hoverCloseTimer);
  if (!petMenu.hidden) return;
  updateMenu();
  if (state === 'converting') $('menu-status').textContent = '正在转换，完成后可退出鲸。';
  else if ($('menu-status').textContent === '正在转换，完成后可退出鲸。') $('menu-status').textContent = '';
  $('menu-toggle').hidden = false;
  petMenu.hidden = false;
  bubble.style.visibility = 'hidden';
  $('menu-toggle').setAttribute('aria-expanded', 'true');
  updateRegions();
}

function scheduleHoverClose() {
  clearTimeout(hoverCloseTimer);
  hoverCloseTimer = setTimeout(() => {
    if (soundChanging || petMenu.matches(':hover') || $('menu-toggle').matches(':hover')) return;
    closeMenu();
  }, 180);
}

async function validateSound(src) {
  const preview = new Audio();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('音效读取超时，请换一个 MP3 或 WAV 文件喵。')), 10_000);
      function finish(error) {
        clearTimeout(timer);
        preview.onloadeddata = preview.onerror = null;
        error ? reject(error) : resolve();
      }
      preview.onloadeddata = () => finish(Number.isFinite(preview.duration) && preview.duration > 0 ? null : new Error('音频没有有效时长，请换一个文件喵。'));
      preview.onerror = () => finish(new Error('这个音频无法播放，请选择有效的 MP3 或 WAV 文件喵。'));
      preview.preload = 'auto';
      preview.src = src;
    });
  } finally {
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
  }
}

function applySound(settings) {
  stopClickSound();
  clickSound.src = settings.selected === 'custom' ? settings.custom.src : defaultSoundSrc;
  soundSettings = settings;
  updateMenu();
}

async function changeSound(selection) {
  if (soundChanging || !canInteract()) return;
  soundChanging = true;
  updateMenu();
  $('menu-status').textContent = selection === 'import' ? '请选择音效文件…' : '正在切换音效…';
  try {
    let src = selection === 'duck' ? defaultSoundSrc : soundSettings.custom?.src;
    if (selection === 'import') {
      const candidate = await window.cat.importSound();
      if (!candidate) {
        $('menu-status').textContent = '已取消，原音效保留。';
        return;
      }
      src = candidate.src;
    }
    if (!canInteract()) throw new Error('正在处理文件，请稍后切换音效喵。');
    await validateSound(src);
    applySound(await window.cat.selectSound(selection));
    $('menu-status').textContent = '已切换音效，下次启动继续使用。';
  } catch (error) { $('menu-status').textContent = error.message; }
  finally { soundChanging = false; updateMenu(); updateRegions(); scheduleHoverClose(); }
}

petArea.addEventListener('pointerenter', () => { $('menu-toggle').hidden = false; updateRegions(); });
petArea.addEventListener('pointerleave', scheduleHoverClose);
$('pet').addEventListener('focus', () => {
  if ($('pet').matches(':focus-visible')) { $('menu-toggle').hidden = false; updateRegions(); }
});
$('menu-toggle').addEventListener('pointerenter', openMenu);
$('menu-toggle').addEventListener('pointerleave', scheduleHoverClose);
petMenu.addEventListener('pointerenter', () => clearTimeout(hoverCloseTimer));
petMenu.addEventListener('pointerleave', scheduleHoverClose);
$('menu-toggle').addEventListener('click', openMenu);
$('menu-close').addEventListener('click', closeMenu);
$('activity-toggle').addEventListener('click', () => { if (canInteract()) showActivityList(true); });
$('activity-back').addEventListener('click', () => showActivityList(false));
$('skin-toggle').addEventListener('click', () => { if (canInteract()) showMenuCard('skin'); });
$('skin-back').addEventListener('click', () => showMenuCard(null));
for (const button of petMenu.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => { interact(button.dataset.action); closeMenu(); });
}
$('sound-duck').addEventListener('click', () => changeSound('duck'));
$('sound-custom').addEventListener('click', () => changeSound('custom'));
$('sound-import').addEventListener('click', () => changeSound('import'));
$('menu-quit').addEventListener('click', () => { if (state !== 'converting') window.cat.quit(); });
document.addEventListener('pointerdown', event => {
  if (!petMenu.hidden && !petMenu.contains(event.target) && !$('menu-toggle').contains(event.target)) closeMenu();
});

function stopClickSound() {
  clickSound.pause();
  clickSound.currentTime = 0;
}

function playClickSound() {
  if (!canInteract()) return;
  stopClickSound();
  clickSound.play().catch(error => {
    if (error.name !== 'AbortError') console.warn('点击音效播放失败。', error);
  });
}

function playAnimation(next, restart = false) {
  if (next === 'drag') videos.drag.loop = true;
  if (animation === next && !restart) return;
  bounce?.cancel();
  animation = next;
  for (const [name, video] of Object.entries(videos)) {
    video.pause();
    video.hidden = name !== next;
  }
  const video = videos[next];
  updateMenu();
  video.currentTime = 0;
  video.play().catch(error => {
    if (error.name !== 'AbortError' && animation === next) {
      $('message').textContent = '桌宠动画播放失败，请检查 assets 文件夹中的 WebM 文件。';
    }
  });
}

videos.finish.addEventListener('ended', () => {
  if (animation === 'finish') playAnimation('idle');
});
videos.interaction.addEventListener('ended', () => {
  if (animation === 'interaction') playAnimation('idle');
});
videos.drag.addEventListener('ended', () => {
  if (animation === 'drag') playAnimation('idle');
});

function canInteract() {
  return !['receiving', 'checking', 'converting'].includes(state) && !['finish', 'drag'].includes(animation);
}

function interact(action = 'wave') {
  if (!canInteract()) return;
  if (action === 'idle') return playAnimation('idle');
  if (!Object.hasOwn(actions, action)) return;
  const src = videoUrl(actions[action].video);
  if (videos.interaction.src !== src) videos.interaction.src = src;
  playAnimation('interaction', true);
  if (!reducedMotion) bounce = $('pet').animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.06, .88)', offset: .4 },
    { transform: 'scale(.98, 1.04)', offset: .75 },
    { transform: 'scale(1)' },
  ], { duration: 260, easing: 'ease-out' });
}

async function showActions() {
  if (!canInteract()) return;
  actionMenuOpen = true;
  scheduleIdleAction();
  try {
    const action = await window.cat.actionMenu();
    if (action) interact(action);
  } catch (error) {
    showBubble('动作菜单打不开喵', error.message);
  } finally { actionMenuOpen = false; scheduleIdleAction(); }
}
window.cat.onConversionStarted(() => {
  if (state === 'converting') {
    playAnimation('working');
    $('message').textContent = '正在本机转换，请稍等鲸。';
  }
});
playAnimation('idle');

function updateRegions() {
  const elements = [petArea];
  if (!$('menu-toggle').hidden) elements.push($('menu-toggle'));
  if (!petMenu.hidden) elements.push(petMenu);
  else if (!bubble.hidden) elements.push(bubble);
  window.cat.setRegions(elements.map(element => {
    const rect = element.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height];
  }));
  scheduleIdleAction();
}

function setState(next) {
  state = next;
  if (['receiving', 'checking', 'converting'].includes(next)) closeMenu();
  playAnimation(next === 'success' ? 'finish' : 'idle');
  if (!canInteract()) stopClickSound();
  $('dismiss').disabled = ['checking', 'converting'].includes(next);
  $('pet').setAttribute('aria-label', next === 'converting' ? '正在转换文件的蓝毛小女仆' : '等待文件的蓝毛小女仆');
  updateMenu();
}

function showBubble(title, message = '') {
  bubble.hidden = false;
  $('bubble-title').textContent = title;
  $('message').textContent = message;
  for (const id of ['formats', 'format', 'file-name', 'pdf-warning', 'install', 'recheck', 'reveal']) $(id).hidden = true;
  updateRegions();
}

function toolNotice() {
  const missing = file?.options.filter(option => !option.enabled) || [];
  if (missing.length || (!file && !tool?.available)) {
    const commands = [...new Set(missing.map(option => option.installCommand))];
    $('install').textContent = commands.join('\n') || tool?.installCommand || '请安装缺少的转换工具后重新检查。';
    $('install').hidden = false;
    $('recheck').hidden = false;
    if (!$('message').textContent) $('message').textContent = toolError || (missing.length ? missing.map(option => option.reason).filter((reason, i, all) => all.indexOf(reason) === i).join('；') + '鲸。' : '请先安装本机 LibreOffice 鲸。');
  }
  updateRegions();
}

function showFormats(message = '') {
  setState('choosing');
  showBubble('要转换为什么格式鲸', message);
  $('file-name').textContent = file.name;
  $('file-name').title = file.name;
  $('file-name').hidden = false;
  const first = $('format') || formatTemplate.cloneNode(true);
  $('formats').replaceChildren(first);
  for (const [index, option] of file.options.entries()) {
    const button = index === 0 ? first : first.cloneNode(true);
    if (index > 0) {
      button.removeAttribute('id');
      for (const element of button.querySelectorAll('[id]')) element.removeAttribute('id');
      $('formats').append(button);
    }
    button.dataset.target = option.target;
    button.querySelector('.format-symbol').textContent = option.target.toUpperCase();
    button.querySelector('strong').textContent = option.label;
    button.querySelector('small').textContent = option.reason || option.note || `.${option.extension} · 点击转换`;
    button.disabled = !option.enabled;
    button.hidden = false;
  }
  $('formats').hidden = false;
  $('pdf-warning').textContent = '排版可能变化；扫描页使用中英文 OCR，识别文字和表格请核对。';
  $('pdf-warning').hidden = file.category !== 'pdf';
  toolNotice();
}

async function receiveAnimation() {
  bubble.hidden = true;
  petArea.classList.add('receiving');
  const token = $('file-token');
  token.querySelector('b').textContent = file.ext.toUpperCase();
  token.hidden = false;
  token.style.opacity = '1';
  updateRegions();
  try {
    if (reducedMotion) return;
    await sleep(420);
    const fade = token.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.7)' },
    ], { duration: 280, fill: 'forwards', easing: 'ease-out' });
    const particles = [];
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement('i');
      dot.className = 'particle';
      $('particles').append(dot);
      const angle = i / 18 * Math.PI * 2;
      const distance = 24 + Math.random() * 32;
      const animation = dot.animate([
        { opacity: 0, transform: 'translate(0, 0) scale(.3)' },
        { opacity: 1, offset: .15 },
        { opacity: 0, transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance - 12}px) scale(.2)` },
      ], { duration: 550, easing: 'ease-out', fill: 'forwards' });
      particles.push(animation.finished.catch(() => {}));
    }
    await Promise.all([fade.finished, ...particles]);
    fade.cancel();
    await sleep(130);
  } finally {
    token.hidden = true;
    $('particles').replaceChildren();
    petArea.classList.remove('receiving');
  }
}

document.addEventListener('dragover', event => {
  event.preventDefault();
  event.dataTransfer.dropEffect = ['receiving', 'converting', 'checking'].includes(state) ? 'none' : 'copy';
});
document.addEventListener('drop', event => event.preventDefault());
petArea.addEventListener('dragenter', event => {
  event.preventDefault();
  if (['receiving', 'converting', 'checking'].includes(state)) return;
  dragDepth++;
  petArea.classList.add('drag-over');
  scheduleIdleAction();
});
petArea.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    petArea.classList.remove('drag-over');
  }
  scheduleIdleAction();
});
petArea.addEventListener('drop', async event => {
  event.preventDefault();
  dragDepth = 0;
  petArea.classList.remove('drag-over');
  if (['receiving', 'converting', 'checking'].includes(state)) return;
  const files = [...event.dataTransfer.files];
  if (!files.length || files.length > 100) {
    showBubble('文件数量超出范围鲸', '一次可转换 1–100 个文件。');
    return;
  }
  setState('receiving');
  try {
    file = files.length === 1 ? await window.cat.prepareFile(files[0]) : await window.cat.prepareFiles(files);
    await receiveAnimation();
    showFormats();
    $('format').focus({ preventScroll: true });
  } catch (error) {
    file = undefined;
    await window.cat.clear();
    setState('error');
    showBubble('这个文件接不住鲸', error.message);
  }
});

// These controls belong only to the file-conversion bubble.
function conversionParameters(target) {
  const specs = [];
  if (file.batch && file.mergeable && target === 'pdf') specs.push(['combineMode', '多文件处理', ['batch:分别转换（ZIP）', 'merge:按列表顺序合并 PDF']]);
  if (file.category === 'pdf' && target === 'pdf') {
    specs.push(['pdfMode', 'PDF 操作', ['split:每页拆分（ZIP）', 'group:每 N 页拆分（ZIP）', 'encrypt:AES-256 加密（PDF）', 'decrypt:原密码解密（PDF）']]);
    specs.push(['groupPages', '每组页数（分组拆分时使用）', 'number']);
    specs.push(['password', '密码（加解密时使用）', 'password']);
  } else if (file.category === 'pdf' && !file.batch) {
    specs.push(['password', '原 PDF 密码（未加密可留空）', 'password']);
    if (['txt', 'md', 'html', 'docx', 'xlsx'].includes(target)) specs.push(['forceOcr', '文字提取', ['auto:自动识别扫描页', 'yes:全部页面使用 OCR']]);
  }
  if (file.category === 'pdf' && target === 'xlsx') specs.push(['tableMode', '表格提取', ['auto:自动（扫描页优先结构识别）', 'position:文字位置推测', 'structure:本机表格结构识别']]);
  if (file.category === 'video' && ['mp4', 'mov', 'mkv'].includes(target)) specs.push(['encoding', '视频编码', ['h264:H.264（兼容优先）', 'h265:H.265', 'av1:AV1（较慢）']]);
  if (file.category === 'text' && !['epub', 'mobi'].includes(file.ext)) specs.push(['textEncoding', '原文编码', ['auto:自动检测', 'utf-8:UTF-8', 'gb18030:GB18030', 'utf-16le:UTF-16 LE', 'utf-16be:UTF-16 BE']]);
  if (!specs.length) return startConversion(target, {});
  showBubble('转换参数鲸', file.batch ? '文件顺序：' + file.names.join(' → ') : '填写后选择保存位置。');
  $('file-name').textContent = file.name; $('file-name').hidden = false;
  const form = document.createElement('form');
  form.style.cssText = 'display:grid;gap:10px;padding:8px;grid-column:1 / -1;';
  const fields = new Map();
  for (const [name, title, type] of specs) {
    const label = document.createElement('label'); label.textContent = title; label.style.cssText = 'display:grid;gap:4px;font-size:12px';
    const field = document.createElement(Array.isArray(type) ? 'select' : 'input');
    field.name = name; field.style.cssText = 'width:100%;box-sizing:border-box;padding:7px;border:1px solid #bac6d6;border-radius:8px;background:#fff;color:#243044';
    if (Array.isArray(type)) for (const value of type) { const index = value.indexOf(':'); const option = document.createElement('option'); option.value = value.slice(0, index); option.textContent = value.slice(index + 1); field.append(option); }
    else { field.type = type; if (type === 'number') { field.min = '1'; field.max = '200'; field.value = '2'; } if (type === 'password') { field.maxLength = 256; field.autocomplete = 'off'; } }
    fields.set(name, field); label.append(field); form.append(label);
  }
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = '选择位置并转换';
  const back = document.createElement('button'); back.type = 'button'; back.textContent = '返回格式列表'; back.addEventListener('click', () => showFormats());
  form.append(submit, back);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const params = Object.fromEntries([...fields].map(([name, field]) => [name, name === 'forceOcr' ? field.value === 'yes' : name === 'groupPages' ? Number(field.value) : field.value]));
    if (!params.password) delete params.password;
    if (params.pdfMode && ['encrypt', 'decrypt'].includes(params.pdfMode) && !params.password && params.combineMode !== 'merge') { $('message').textContent = '加解密需要填写密码鲸。'; return; }
    startConversion(target, params);
  });
  const template = $('format') || formatTemplate.cloneNode(true); template.hidden = true;
  $('formats').replaceChildren(form, template); $('formats').hidden = false;
  updateRegions();
}
async function startConversion(target, params) {
  setState('converting');
  showBubble('正在转换鲸', '选择保存位置后，我会在本机完成转换。');
  try {
    const result = await window.cat.convert(target, params);
    if (result.canceled) { showFormats('已取消保存，可以重新选择鲸。'); return; }
    file = undefined;
    setState('success');
    showBubble('转换好啦鲸', [result.name, ...(result.warnings || [])].join('\n'));
    $('reveal').hidden = false; updateRegions();
  } catch (error) { showFormats(error.message); }
}
$('formats').addEventListener('click', event => {
  const button = event.target.closest('[data-target]');
  if (!button || state !== 'choosing' || button.disabled) return;
  conversionParameters(button.dataset.target);
});
$('reveal').addEventListener('click', async () => {
  try { await window.cat.reveal(); } catch (error) { $('message').textContent = error.message; }
});
$('dismiss').addEventListener('click', async () => {
  if (['receiving', 'checking', 'converting'].includes(state)) return;
  await window.cat.clear();
  file = undefined;
  setState('idle');
  bubble.hidden = true;
  updateRegions();
});

async function checkTool(silent = false) {
  const previous = state;
  setState('checking');
  if (!silent) showBubble('检查转换工具鲸', '正在检查本机图片、办公与音视频转换工具…');
  try {
    tool = await window.cat.checkTool();
    if (file && tool.options) file.options = tool.options;
    toolError = undefined;
    if (file) showFormats();
    else if (silent) {
      setState('idle');
      bubble.hidden = true;
    } else if (!tool.available) {
      setState('idle');
      showBubble('先准备转换工具鲸');
      toolNotice();
    } else if (previous === 'idle') {
      setState('idle');
      bubble.hidden = true;
    } else {
      setState('idle');
      showBubble('转换工具准备好啦鲸', '把文件拖给我，选择可用的格式就可以啦。');
    }
  } catch (error) {
    setState('error');
    toolError = error.message;
    if (!silent) {
      showBubble('检查失败鲸', error.message);
      $('recheck').hidden = false;
    }
  }
  updateRegions();
}
$('recheck').addEventListener('click', () => checkTool());

function startMove(event) {
  // 鼠标操作清除已有键盘焦点，避免点击同一人物后残留绿色轮廓。
  event.preventDefault();
  event.currentTarget.blur();
  if (event.button !== 0 || state === 'receiving') return;
  moving = { element: event.currentTarget, x: event.screenX, y: event.screenY, dragged: false };
  scheduleIdleAction();
  moving.element.setPointerCapture(event.pointerId);
  petArea.classList.add('moving');
  window.cat.startMove();
}

function finishMove(event) {
  if (!moving) return;
  const clicked = event.type === 'pointerup' && moving && !moving.dragged;
  const wasDragAnimation = animation === 'drag' && moving.dragged;
  moving = undefined;
  petArea.classList.remove('moving');
  window.cat.endMove();
  if (wasDragAnimation) {
    videos.drag.loop = false;
    videos.drag.currentTime = dragLandingStart;
  }
  if (clicked) {
    interact(clickActions[Math.floor(Math.random() * clickActions.length)]);
    playClickSound();
  }
  scheduleIdleAction();
}
{
  const element = $('pet');
  element.addEventListener('pointerdown', startMove);
  element.addEventListener('pointermove', event => {
    if (!moving) return;
    if (!moving.dragged && Math.hypot(event.screenX - moving.x, event.screenY - moving.y) > 4) {
      moving.dragged = true;
      if (canInteract() || animation === 'drag') {
        stopClickSound();
        playAnimation('drag');
      }
    }
    if (moving.dragged) window.cat.move();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(event, finishMove);
  }
  element.addEventListener('contextmenu', event => { event.preventDefault(); showActions(); });
  element.addEventListener('keydown', event => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); interact(); }
    if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); showActions(); }
  });
}
window.addEventListener('blur', event => { if (moving) finishMove(event); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!petMenu.hidden) { closeMenu(); $('pet').focus({ preventScroll: true }); }
  else if (!$('dismiss').disabled) $('dismiss').click();
});
new ResizeObserver(updateRegions).observe(bubble);
new ResizeObserver(updateRegions).observe(petMenu);
updateRegions();
const soundReady = (async () => {
  try {
    const settings = await window.cat.soundSettings();
    if (settings.selected === 'custom') await validateSound(settings.custom.src);
    applySound(settings);
    if (settings.warning) $('menu-status').textContent = settings.warning;
  } catch (error) { $('menu-status').textContent = error.message; }
  finally { soundChanging = false; updateMenu(); scheduleHoverClose(); }
})();
const skinReady = (async () => {
  try {
    skinState = await window.cat.skinSettings();
    applySkinVideos();
  } catch (error) { $('menu-status').textContent = error.message; }
  renderSkins();
})();
checkTool(true);
