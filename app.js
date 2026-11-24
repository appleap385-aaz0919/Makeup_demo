'use strict';

// Sample and uploaded photos share the same on-device analysis and renderer.
const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const initial = {
  foundation: { color: null },
  lip: { color: null, intensity: 50, finish: 'matte' },
  blush: { color: null, intensity: 40, size: 50 },
  eyes: { color: null, intensity: 40, shadowHeight: 50, shadowWidth: 50, liner: false, linerThickness: 50, linerLength: 40, linerIntensity: 60, aegyo: false, aegyoIntensity: 40, aegyoPosition: 0 },
  hair: { color: null, intensity: 60 },
};
let state = clone(initial);
let activeTab = 'foundation';
let eyeTool = 'shadow';
const eyeToolNames = { shadow: '아이섀도', liner: '아이라이너', aegyo: '애교살' };
const eyeToolKeys = { shadow: ['color','intensity','shadowHeight','shadowWidth'], liner: ['liner','linerThickness','linerLength','linerIntensity'], aegyo: ['aegyo','aegyoIntensity','aegyoPosition'] };
let activeTone = 'all';
let hairCategory = '전체';
let history = [];
let sampleMode = true;
let comparisonMode = false;
let originalMode = false;
let photoUrl = 'assets/sample-portrait.png';
let toastTimer;
let livePhoto = null;
let photoAssessment = null;
let photoSequence = 0;
let photoLoadSequence = 0;
let renderedStateKey = '';
let savingImage = false;

const foundations = [
  ['13', '#f5dfd3', '#f5d6d1', '#f2ddbd'], ['17', '#ead0bd', '#edc8c1', '#e9cea8'],
  ['19', '#dfbda5', '#e4b7ae', '#dfbb92'], ['21', '#d2ae92', '#d7a79e', '#d3ad82'],
  ['23', '#c39c7f', '#ca998c', '#c29a6c'], ['25', '#b58b6c', '#bd8a7e', '#b68c5e'],
  ['27', '#a67c5e', '#ac776b', '#a47b50'], ['30', '#8c634c', '#99685b', '#91663f'],
].flatMap(([code, ...colors]) => colors.map((hex, i) => ({ code: `${code}${['N', 'C', 'W'][i]}`, name: `${code}호 ${['뉴트럴', '쿨', '웜'][i]}`, hex, tone: ['N', 'C', 'W'][i] })));

const palette = (rows, prefix) => rows.map(([name, hex], i) => ({ code: `${prefix}${String(i + 1).padStart(2, '0')}`, name, hex }));
const lips = palette([
  ['로즈 누드','#bd7b7a'],['피치 베이지','#d18c79'],['소프트 코랄','#e27d72'],['살몬 핑크','#dc8d8b'],
  ['로즈 핑크','#c3667f'],['더스티 로즈','#a76578'],['모브 핑크','#a6788d'],['라벤더 로즈','#96738e'],
  ['코랄 레드','#dc5551'],['체리 레드','#c7334c'],['클래식 레드','#b72d3d'],['칠리 레드','#a44737'],
  ['브릭 로즈','#ad5b57'],['테라코타','#b66a4d'],['시나몬','#a76e56'],['카카오 누드','#916455'],
  ['베리 핑크','#b34172'],['라즈베리','#a83061'],['푸시아','#c3448b'],['딥 플럼','#763954'],
  ['밀키 핑크','#d69baa'],['살구 코랄','#e6a086'],['루비 레드','#9f2749'],['와인','#7f3145'],
  ['로즈우드','#9f6266'],['말린 장미','#ad7180'],['피그 브라운','#8e5869'],['버건디','#702b3c'],
  ['탠저린','#e97d45'],['레드 오렌지','#d45136'],['로지 브라운','#956153'],['초콜릿','#694735'],
], 'L');
const blushes = palette([
  ['페일 피치','#edbdac'],['피치 코랄','#e69b8b'],['살구','#e9ad85'],['소프트 오렌지','#dc956b'],
  ['베이비 핑크','#e6b0c0'],['로즈 핑크','#d996a8'],['쿨 핑크','#d49ebc'],['라벤더','#bc9bbc'],
  ['더스티 로즈','#bd8290'],['모브','#b48caa'],['베리','#b5728d'],['플럼','#9b718b'],
  ['누드 베이지','#cdab99'],['로즈 베이지','#c19a90'],['테라코타','#c08470'],['브릭','#b6776b'],
], 'B');
const shadows = palette([
  ['샴페인','#d8b99a'],['피치 베이지','#d3ac96'],['샌드 브라운','#b69172'],['카멜','#a77e59'],
  ['로즈 베이지','#c09596'],['모브 로즈','#a77f8d'],['로지 브라운','#9c7373'],['버건디','#855c6e'],
  ['쿨 토프','#9d9391'],['애쉬 브라운','#8a7d71'],['코코아','#806052'],['딥 브라운','#664b44'],
  ['라벤더','#aa94b1'],['플럼','#8c7095'],['올리브','#8b8969'],['스모키 그레이','#777780'],
], 'E');
const hairs = [
  ['소프트 블랙','#292630','내추럴'],['다크 브라운','#47332c','내추럴'],['초콜릿','#654437','브라운'],
  ['체스트넛','#805340','브라운'],['밀크 브라운','#a47d59','브라운'],['허니 브라운','#b28a55','브라운'],
  ['애쉬 브라운','#827a6e','애쉬'],['애쉬 그레이','#92949d','애쉬'],['애쉬 베이지','#b4a291','애쉬'],
  ['로즈 브라운','#a77580','포인트'],['와인 레드','#883e57','포인트'],['코퍼','#b26c47','포인트'],
  ['라벤더','#a294bd','포인트'],['딥 블루','#465d80','포인트'],['딥 그린','#4d7163','포인트'],
  ['실버','#bcbcc0','애쉬'],['밀크티','#bfa68c','브라운'],['핑크 베이지','#c19da1','포인트'],
].map(([name, hex, category], i) => ({ name, hex, category, code: `H${String(i + 1).padStart(2, '0')}` }));
const palettes = { foundation: foundations, lip: lips, blush: blushes, eyes: shadows, hair: hairs };
const colorHeadings = {
  foundation: '파운데이션 컬러',
  lip: '립스틱 컬러',
  blush: '블러셔 컬러',
  eyes: '아이섀도 컬러',
  hair: '헤어 컬러',
};
const partNames = { foundation: '파운데이션', lip: '립스틱', blush: '블러셔', eyes: '아이섀도', hair: '헤어' };

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}
function remember() {
  history.push(clone(state));
  if (history.length > 60) history.shift();
}
function changedPart(part) { return JSON.stringify(state[part]) !== JSON.stringify(initial[part]); }
function hasEffect(part) {
  if (!photoAssessment?.available?.[part]) return false;
  const s = state[part];
  return Boolean((s.color && (part === 'foundation' || s.intensity > 0)) || (part === 'eyes' && ((s.liner && s.linerIntensity > 0) || (s.aegyo && s.aegyoIntensity > 0))));
}
function canEdit() {
  if (livePhoto && photoAssessment?.available?.[activeTab]) return true;
  notify(photoAssessment?.message || '사진을 확인하고 있어요. 잠시 기다려주세요.');
  return false;
}
function mutate(callback, shouldRemember = true) {
  if (!canEdit()) return;
  if (shouldRemember) remember();
  callback();
  render();
}
function chooseColor(color) { mutate(() => { state[activeTab].color = color; }); }

function renderPalette() {
  const grid = $('swatch-grid');
  grid.replaceChildren();
  grid.classList.toggle('hair-grid', activeTab === 'hair');
  let colors = palettes[activeTab];
  if (activeTab === 'foundation' && activeTone !== 'all') colors = colors.filter(c => c.tone === activeTone);
  if (activeTab === 'hair' && hairCategory !== '전체') colors = colors.filter(c => c.category === hairCategory);
  $('color-count').textContent = `${colors.length}가지`;
  // A visible 'none' option makes removing eyeshadow discoverable, without an extra toggle.
  if (activeTab !== 'foundation') {
    const none = makeSwatch({ code: '미적용', name: '미적용', hex: '#fff' }, !state[activeTab].color, () => chooseColor(null));
    none.classList.add('no-color');
    grid.append(none);
  }
  for (const color of colors) grid.append(makeSwatch(color, state[activeTab].color?.code === color.code, () => chooseColor(color)));
  const selected = state[activeTab].color;
  $('selected-chip').style.background = selected?.hex || '';
  $('selected-name').textContent = selected ? `${selected.code === 'CUSTOM' ? '' : selected.code + ' · '}${selected.name}` : (activeTab === 'eyes' ? '아이섀도 미적용' : '아직 선택한 색상이 없어요');
  $('selected-detail').textContent = selected ? `${selected.hex.toUpperCase()} · 가상 색상` : '색상칩을 눌러 시작해보세요.';
  $('custom-color-label').hidden = activeTab === 'foundation';
  if (selected) $('custom-color').value = selected.hex;
}
function makeSwatch(color, selected, handler) {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.type = 'button';
  button.style.setProperty('--swatch', color.hex);
  button.style.setProperty('--check-color', ['foundation','blush'].includes(activeTab) ? '#6c4248' : '#fff');
  button.setAttribute('aria-label', `${color.code} ${color.name}`);
  button.setAttribute('aria-pressed', String(selected));
  button.title = `${color.name} ${color.hex}`;
  const circle = document.createElement('span');
  circle.className = 'swatch-circle';
  const label = document.createElement('span');
  label.textContent = activeTab === 'hair' ? color.name : color.code;
  button.append(circle, label);
  button.addEventListener('click', handler);
  return button;
}
function renderFilters() {
  const container = $('tone-filters');
  container.hidden = !['foundation', 'hair'].includes(activeTab);
  if (container.hidden) return;
  container.replaceChildren();
  const options = activeTab === 'foundation' ? [['all','전체'],['N','뉴트럴'],['C','쿨'],['W','웜']] : ['전체','내추럴','브라운','애쉬','포인트'].map(x => [x,x]);
  container.setAttribute('aria-label', activeTab === 'hair' ? '헤어 색상 계열 필터' : '파운데이션 톤 필터');
  for (const [value, label] of options) {
    const button = document.createElement('button');
    const selected = value === (activeTab === 'foundation' ? activeTone : hairCategory);
    button.textContent = label;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => {
      if (activeTab === 'foundation') activeTone = value;
      else hairCategory = value;
      render();
    });
    container.append(button);
  }
}
function renderEffects() {
  if (livePhoto) {
    const key = JSON.stringify(state);
    if (key !== renderedStateKey) { livePhoto.render($('rendered-photo'),state); renderedStateKey = key; }
  }
  $('rendered-photo').hidden = !livePhoto;
  $('effect-badge').textContent = originalMode ? '원본' : (comparisonMode ? '원본 / 적용 후' : Object.keys(state).some(hasEffect) ? '적용 후' : '원본');
  $('preview-caption').textContent = !sampleMode ? (photoAssessment?.message || '사진을 확인하고 있어요.') : comparisonMode ? '구분선을 움직여 원본과 비교해보세요.' : Object.keys(state).some(hasEffect) ? '샘플 사진에 적용한 메이크업입니다.' : '색상을 선택하면 이 사진에 미리 적용됩니다.';
  $('comparison-original').style.clipPath = originalMode ? 'inset(0)' : comparisonMode ? `inset(0 ${100 - Number($('split-slider').value)}% 0 0)` : 'inset(0 100% 0 0)';
  $('split-line').hidden = !comparisonMode || originalMode;
  $('split-slider').hidden = !comparisonMode || originalMode;
  $('split-line').style.left = `${$('split-slider').value}%`;
}
function render() {
  for (const button of document.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === activeTab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.querySelector('.applied-dot').hidden = !hasEffect(button.dataset.tab);
  }
  $('editor-panel').setAttribute('aria-labelledby', `tab-${activeTab}`);
  $('color-heading').textContent = colorHeadings[activeTab];
  $('reset-part').textContent = '초기화';
  $('reset-part').title = `${partNames[activeTab]} 초기화`;
  $('eye-controls').hidden = activeTab !== 'eyes';
  const eyeDetail = activeTab === 'eyes' && eyeTool !== 'shadow';
  $('color-section').hidden = eyeDetail;
  $('intensity-section').hidden = activeTab === 'foundation' || eyeDetail;
  $('liner-controls').hidden = eyeTool !== 'liner';
  $('aegyo-controls').hidden = eyeTool !== 'aegyo';
  $('liner-toggle').hidden = eyeTool !== 'liner';
  $('aegyo-toggle').hidden = eyeTool !== 'aegyo';
  $('tool-heading').hidden = !eyeDetail;
  $('tool-title').textContent = eyeToolNames[eyeTool];
  for (const button of document.querySelectorAll('[data-eye-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.eyeTool === eyeTool));
    const tool = button.dataset.eyeTool;
    button.querySelector('.tool-dot').hidden = !(tool === 'shadow' ? state.eyes.color && state.eyes.intensity > 0 : tool === 'liner' ? state.eyes.liner && state.eyes.linerIntensity > 0 : state.eyes.aegyo && state.eyes.aegyoIntensity > 0);
  }
  $('liner-settings').hidden = !state.eyes.liner;
  $('blush-settings').hidden = activeTab !== 'blush';
  $('shadow-settings').hidden = activeTab !== 'eyes' || eyeTool !== 'shadow';
  $('reset-eye-tool').disabled = !livePhoto || !photoAssessment?.available?.eyes || !eyeToolKeys[eyeTool].some(key => JSON.stringify(state.eyes[key]) !== JSON.stringify(initial.eyes[key]));
  $('lip-finish').hidden = activeTab !== 'lip';
  $('liner-toggle').setAttribute('aria-checked', String(state.eyes.liner));
  $('aegyo-toggle').setAttribute('aria-checked', String(state.eyes.aegyo));
  $('aegyo-strength').hidden = !state.eyes.aegyo;
  $('aegyo-intensity').value = state.eyes.aegyoIntensity;
  $('aegyo-intensity').style.setProperty('--progress', `${state.eyes.aegyoIntensity}%`);
  $('aegyo-intensity-value').textContent = `${state.eyes.aegyoIntensity}%`;
  for (const [id,value] of [['shadow-height',state.eyes.shadowHeight],['shadow-width',state.eyes.shadowWidth],['liner-thickness',state.eyes.linerThickness],['liner-length',state.eyes.linerLength],['liner-intensity',state.eyes.linerIntensity],['blush-size',state.blush.size],['aegyo-position',state.eyes.aegyoPosition]]) {
    $(id).value = value;
    $(id).style.setProperty('--progress', `${id === 'aegyo-position' ? (value+100)/2 : value}%`);
    $(`${id}-value`).textContent = id === 'aegyo-position' ? (value === 0 ? '자동' : `${value > 0 ? '아래' : '위'} ${Math.abs(value)}%`) : `${value}%`;
  }
  $('aegyo-fit-note').textContent = livePhoto?.aegyoFit?.every(fit=>fit.detected) ? '사진 속 눈 아래 명암으로 위치를 추정했어요. 맞지 않으면 조절해주세요.' : '눈 아래 윤곽을 기준으로 배치했어요. 원래 애교살과 맞지 않으면 위치를 조절해주세요.';
  $('intensity').value = state[activeTab].intensity ?? 50;
  $('intensity').style.setProperty('--progress', `${state[activeTab].intensity ?? 50}%`);
  $('intensity-value').innerHTML = `${state[activeTab].intensity ?? 50}<span>%</span>`;
  document.querySelector('label[for="intensity"]').textContent = activeTab === 'eyes' ? '아이섀도 적용 강도' : '적용 강도';
  $('intensity-hint').textContent = activeTab === 'hair' ? '밝은 색상은 원래 머리색에 따라 표현이 달라질 수 있어요.' : '선택한 색상을 얼마나 진하게 표현할지 조절해요.';
  const editingReady = Boolean(livePhoto);
  $('reset-part').disabled = !changedPart(activeTab) || !editingReady || (!photoAssessment?.available?.[activeTab]);
  if (activeTab === 'eyes') $('reset-part').disabled = !editingReady || !photoAssessment?.available?.eyes || !eyeToolKeys.shadow.some(key => JSON.stringify(state.eyes[key]) !== JSON.stringify(initial.eyes[key]));
  $('reset-all').disabled = !Object.keys(state).some(changedPart) || !editingReady;
  $('undo-button').disabled = history.length === 0 || !editingReady;
  $('save-button').disabled = savingImage || !editingReady;
  for (const button of document.querySelectorAll('[data-finish]')) {
    const selected = button.dataset.finish === state.lip.finish;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const summary = [];
  for (const part of Object.keys(state)) if (state[part].color && (photoAssessment?.available?.[part])) summary.push(`${partNames[part]} ${state[part].color.code}${part === 'foundation' ? '' : ` ${state[part].intensity}%`}`);
  if (state.eyes.liner && (photoAssessment?.available?.eyes)) summary.push('아이라이너');
  if (state.eyes.aegyo && (photoAssessment?.available?.eyes)) summary.push(`애교살 ${state.eyes.aegyoIntensity}%`);
  $('look-summary').textContent = !editingReady ? '사진 확인 후 메이크업을 적용할 수 있어요.' : summary.join(' · ') || '아직 적용한 메이크업이 없어요.';
  renderFilters(); renderPalette(); renderEffects();
  const unavailable = !photoAssessment?.available?.[activeTab];
  for(const control of document.querySelectorAll('.swatch, #intensity, #custom-color, [data-finish]')) control.disabled = unavailable;
  $('liner-toggle').disabled = !photoAssessment?.available?.eyes;
  $('aegyo-toggle').disabled = !photoAssessment?.available?.eyes;
  for (const id of ['aegyo-intensity','aegyo-position','liner-thickness','liner-length','liner-intensity']) $(id).disabled = !photoAssessment?.available?.eyes || !(id.startsWith('liner') ? state.eyes.liner : state.eyes.aegyo);
  $('blush-size').disabled = !photoAssessment?.available?.blush;
  for (const id of ['shadow-height','shadow-width']) $(id).disabled = !photoAssessment?.available?.eyes;
  $('part-unavailable').hidden = !unavailable || photoAssessment?.status === 'loading';
  $('part-unavailable').textContent = unavailable ? (photoAssessment?.message || '사진 확인 중에는 메이크업을 선택할 수 없어요.') : '';
}

function selectTab(tab, focus = false) {
  activeTab = tab;
  render();
  $('editor-panel').scrollTop = 0;
  if (focus) $(`tab-${tab}`).focus();
}
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => selectTab(button.dataset.tab));
  button.addEventListener('keydown', event => {
    const keys = ['ArrowRight','ArrowLeft','Home','End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = Object.keys(state);
    const index = tabs.indexOf(activeTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[next], true);
  });
});
$('liner-toggle').addEventListener('click', () => mutate(() => { state.eyes.liner = !state.eyes.liner; }));
$('aegyo-toggle').addEventListener('click', () => mutate(() => { state.eyes.aegyo = !state.eyes.aegyo; }));
document.querySelectorAll('[data-eye-tool]').forEach(button => button.addEventListener('click', () => { eyeTool = button.dataset.eyeTool; render(); $('editor-panel').scrollTop = 0; }));
$('reset-eye-tool').addEventListener('click', () => mutate(() => { for (const key of eyeToolKeys[eyeTool]) state.eyes[key] = clone(initial.eyes[key]); }));
for (const [id, getter, setter] of [
  ['intensity', () => state[activeTab].intensity, value => { state[activeTab].intensity = value; }],
  ['aegyo-intensity', () => state.eyes.aegyoIntensity, value => { state.eyes.aegyoIntensity = value; }],
  ['aegyo-position', () => state.eyes.aegyoPosition, value => { state.eyes.aegyoPosition = value; }],
  ['liner-thickness', () => state.eyes.linerThickness, value => { state.eyes.linerThickness = value; }],
  ['liner-length', () => state.eyes.linerLength, value => { state.eyes.linerLength = value; }],
  ['liner-intensity', () => state.eyes.linerIntensity, value => { state.eyes.linerIntensity = value; }],
  ['blush-size', () => state.blush.size, value => { state.blush.size = value; }],
  ['shadow-height', () => state.eyes.shadowHeight, value => { state.eyes.shadowHeight = value; }],
  ['shadow-width', () => state.eyes.shadowWidth, value => { state.eyes.shadowWidth = value; }],
]) {
  const input = $(id);
  let started = false;
  input.addEventListener('pointerdown', () => { if (livePhoto) { remember(); started = true; } });
  input.addEventListener('input', () => {
    if (!canEdit()) { input.value = getter(); return; }
    if (!started) { remember(); started = true; }
    setter(Number(input.value));
    render();
  });
  input.addEventListener('change', () => { started = false; });
  input.addEventListener('blur', () => { started = false; });
}
$('custom-color').addEventListener('change', event => chooseColor({ code: 'CUSTOM', name: '직접 고른 색상', hex: event.target.value }));
document.querySelectorAll('[data-finish]').forEach(button => button.addEventListener('click', () => mutate(() => { state.lip.finish = button.dataset.finish; })));
$('undo-button').addEventListener('click', () => { if (history.length && (livePhoto)) { state = history.pop(); render(); notify('직전 변경을 되돌렸어요.'); } });
$('reset-part').addEventListener('click', () => { const name = partNames[activeTab]; mutate(() => { if (activeTab === 'eyes') { for (const key of eyeToolKeys.shadow) state.eyes[key] = clone(initial.eyes[key]); } else state[activeTab] = clone(initial[activeTab]); }); notify(`${name}을 초기화했어요.`); });
$('reset-all').addEventListener('click', () => { if(!livePhoto)return; remember(); state=clone(initial); render(); notify('모든 메이크업을 초기화했어요. 실행 취소로 되돌릴 수 있어요.'); });

function setComparison(value) {
  comparisonMode = value;
  originalMode = false;
  $('original-button').setAttribute('aria-pressed', 'false');
  $('original-button').textContent = '원본 보기';
  $('result-view').classList.toggle('selected', !value);
  $('result-view').setAttribute('aria-pressed', String(!value));
  $('compare-view').classList.toggle('selected', value);
  $('compare-view').setAttribute('aria-pressed', String(value));
  renderEffects();
}
$('result-view').addEventListener('click', () => setComparison(false));
$('compare-view').addEventListener('click', () => setComparison(true));
$('split-slider').addEventListener('input', renderEffects);
$('original-button').addEventListener('click', () => {
  originalMode = !originalMode;
  $('original-button').setAttribute('aria-pressed', String(originalMode));
  $('original-button').textContent = originalMode ? '적용 후 보기' : '원본 보기';
  renderEffects();
});

$('upload-button').addEventListener('click', () => $('photo-input').click());
const previewSection = document.querySelector('.preview-section');
const previewAnchor = document.createComment('Photo preview position');
previewSection.before(previewAnchor);
const photoZoom = createPhotoZoom({
  viewport: previewSection.querySelector('.portrait-viewport'),
  frame: $('portrait-frame'),
  isComparing: () => comparisonMode && !originalMode,
  compare: value => { $('split-slider').value = value; renderEffects(); },
});
$('photo-size-button').addEventListener('click', () => {
  const dialog = $('photo-dialog');
  if (dialog.open) {
    dialog.close();
    return;
  }
  dialog.append(previewSection);
  $('photo-size-button').setAttribute('aria-expanded', 'true');
  $('photo-size-button').querySelector('span').textContent = '축소';
  $('photo-size-button').querySelector('path').setAttribute('d', 'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5');
  dialog.showModal();
  photoZoom.reset();
  $('close-photo-dialog').focus({ preventScroll: true });
});
$('close-photo-dialog').addEventListener('click', () => $('photo-dialog').close());
$('photo-dialog').addEventListener('close', () => {
  photoZoom.clear();
  previewAnchor.after(previewSection);
  $('photo-size-button').setAttribute('aria-expanded', 'false');
  $('photo-size-button').querySelector('span').textContent = '확대';
  $('photo-size-button').querySelector('path').setAttribute('d', 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5');
  $('photo-size-button').focus({ preventScroll: true });
});
function showPhotoStatus(kind,title,message,retry=false) {
  $('photo-status').hidden = false;
  $('photo-status').dataset.state = kind;
  $('photo-status-title').textContent = title;
  $('photo-status-message').textContent = message;
  $('retry-analysis').hidden = !retry;
  $('use-sample-photo').hidden = sampleMode;
}
async function analyzeCurrentPhoto() {
  photoZoom.reset();
  const sequence = ++photoSequence;
  const label = sampleMode ? '샘플 사진' : '내 사진';
  livePhoto = null; renderedStateKey = '';
  photoAssessment = {status:'loading',message:'사진을 확인하고 있어요.',available:{}};
  showPhotoStatus('loading','사진 확인 중',photoAssessment.message);
  $('sample-badge').lastChild.textContent = `${label} · 확인 중`;
  setComparison(false); render();
  try {
    const image = new Image(); image.src = photoUrl; await image.decode();
    const result = await window.ColorMatchPhotoEngine.analyze(image,message=>{
      if(sequence !== photoSequence)return;
      showPhotoStatus('loading','사진 확인 중',message);
    },()=>sequence===photoSequence);
    if(sequence !== photoSequence)return;
    photoAssessment = result.assessment;
    livePhoto = result.renderer || null;
    $('sample-badge').lastChild.textContent = livePhoto ? label : `${label} · 확인 필요`;
    if(photoAssessment.status === 'ready') {
      $('photo-status').hidden = true;
      notify('사진을 확인했어요. 메이크업을 선택해주세요.');
    } else showPhotoStatus(photoAssessment.status,livePhoto?'일부 기능만 사용할 수 있어요':'다른 사진이 필요해요',photoAssessment.message,Boolean(livePhoto));
  } catch(error) {
    if(sequence !== photoSequence)return;
    const unsupported = error.message === 'unsupported-browser';
    const analysisFailed = error.message === 'analysis-error';
    photoAssessment = {status:'error',code:unsupported?'unsupported-browser':analysisFailed?'analysis-error':'model-error',message:unsupported?'이 브라우저에서는 얼굴 분석을 실행할 수 없어요. 최신 Chrome 또는 Safari에서 다시 열어주세요.':analysisFailed?'사진 분석을 완료하지 못했어요. 다시 시도하거나 다른 사진을 선택해주세요.':'얼굴 분석 기능을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요. 사진의 문제는 아니에요.',available:{}};
    showPhotoStatus('error',unsupported?'브라우저를 확인해주세요':analysisFailed?'사진 분석을 완료하지 못했어요':'분석 기능을 준비하지 못했어요',photoAssessment.message,!unsupported);
    $('sample-badge').lastChild.textContent = `${label} · 분석 대기`;
  }
  render();
}
$('retry-analysis').addEventListener('click',analyzeCurrentPhoto);
$('choose-another-photo').addEventListener('click',()=>$('photo-input').click());
$('use-sample-photo').addEventListener('click',()=>$('return-sample').click());
$('photo-input').addEventListener('change', async event => {
  const loadSequence = ++photoLoadSequence;
  const file = event.target.files[0];
  if (!file) return;
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { notify('JPG, PNG, WebP 사진을 선택해주세요.'); event.target.value = ''; return; }
  if (file.size > 20 * 1024 * 1024) { notify('20MB 이하의 사진을 선택해주세요.'); event.target.value = ''; return; }
  const nextUrl = URL.createObjectURL(file);
  const image = new Image();
  image.src = nextUrl;
  try { await image.decode(); } catch { URL.revokeObjectURL(nextUrl); notify('사진을 읽을 수 없어요. 다른 사진을 선택해주세요.'); event.target.value = ''; return; }
  if(loadSequence !== photoLoadSequence) { URL.revokeObjectURL(nextUrl); return; }
  if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl);
  photoUrl = nextUrl;
  sampleMode = false;
  $('portrait').src = photoUrl;
  $('portrait-frame').style.setProperty('--photo-ratio', image.naturalWidth / image.naturalHeight);
  $('portrait').alt = '사용자가 선택한 사진 미리보기';
  $('comparison-original').querySelector('img').src = photoUrl;
  $('portrait-frame').classList.add('photo-mode');
  $('sample-return').hidden = false;
  $('save-button').removeAttribute('title');
  analyzeCurrentPhoto();
  event.target.value = '';
});
$('return-sample').addEventListener('click', () => {
  photoLoadSequence++;
  photoSequence++;
  livePhoto = null; photoAssessment = null; renderedStateKey = '';
  $('photo-status').hidden = true;
  sampleMode = true;
  $('portrait').src = 'assets/sample-portrait.png';
  $('portrait-frame').style.removeProperty('--photo-ratio');
  $('portrait').alt = '메이크업을 체험할 수 있는 정면 샘플 얼굴';
  $('comparison-original').querySelector('img').src = $('portrait').src;
  $('portrait-frame').classList.remove('photo-mode');
  $('sample-badge').lastChild.textContent = '샘플 사진';
  $('sample-return').hidden = true;
  $('save-button').disabled = false;
  $('save-button').removeAttribute('title');
  if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl);
  photoUrl = 'assets/sample-portrait.png';
  analyzeCurrentPhoto();
});

$('save-button').addEventListener('click', async () => {
  if (savingImage || !livePhoto) return;
  const exportRenderer = livePhoto, exportState = clone(state);
  const exportOriginal = originalMode, exportComparison = comparisonMode, exportSplit = Number($('split-slider').value);
  const source = new Image(); source.src = $('portrait').src;
  const button = $('save-button');
  savingImage = true;
  button.disabled = true;
  try {
    await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = exportRenderer ? exportRenderer.base.width : source.naturalWidth;
    canvas.height = exportRenderer ? exportRenderer.base.height : source.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0,canvas.width,canvas.height);
    const overlay = document.createElement('canvas');
    exportRenderer.render(overlay,exportState);
    if (!exportOriginal) {
      ctx.save();
      if (exportComparison) {
        const split = canvas.width * exportSplit / 100;
        ctx.beginPath(); ctx.rect(split, 0, canvas.width - split, canvas.height); ctx.clip();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image encoding failed');
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `colormatch-${Date.now()}.png`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('이미지를 저장했어요.');
  } catch {
    notify('저장하지 못했어요. 로컬 미리보기 서버에서 다시 시도해주세요.');
  } finally {
    savingImage = false;
    button.disabled = !livePhoto;
  }
});
analyzeCurrentPhoto();
