'use strict';

// Sample and uploaded photos share the same on-device analysis and renderer.
const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const initial = {
  foundation: { color: null, moles: [] },
  lip: { color: null, intensity: 50, finish: 'matte' },
  blush: { color: null, intensity: 40, size: 50 },
  eyes: { color: null, intensity: 55, shadowFinish: 'matte', shadowHeight: 50, shadowWidth: 50, liner: false, linerThickness: 50, linerLength: 40, linerIntensity: 75, linerAngle: 15, aegyo: false, aegyoIntensity: 40, aegyoPosition: 0, lensColor: null, lensIntensity: 60, lensRing: 30 },
  hair: { color: null, intensity: 60, style: null, styleX: 0, styleY: 0, styleWidth: 100, styleHeight: 100 },
};
let state = clone(initial);
let activeTab = 'foundation';
let eyeTool = 'shadow';
let skinTool = 'foundation';
let hairTool = 'color', hairStyleRequest = 0, hairStyleLoading = null, hairStyleError = '';
const hairStyleKeys = ['style','styleX','styleY','styleWidth','styleHeight'];
let selectedMole = -1, moleArmed = false;
let moleOverlay = null;
const colorFamilies = {lip:'전체',blush:'전체',eyes:'전체'};
const eyeToolNames = { shadow: '아이섀도', liner: '아이라이너', aegyo: '애교살', lens: '컬러 렌즈' };
const eyeToolKeys = { shadow: ['color','intensity','shadowFinish','shadowHeight','shadowWidth'], liner: ['liner','linerThickness','linerLength','linerIntensity','linerAngle'], aegyo: ['aegyo','aegyoIntensity','aegyoPosition'], lens: ['lensColor','lensIntensity','lensRing'] };
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

const {lip:lips,blush:blushes,eyes:shadows}=MakeupPalettes;
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
  if(part==='foundation'&&livePhoto&&state.foundation.moles.length)return true;
  if(part==='hair'&&livePhoto&&ColorMatchHairStyles.isLoaded(state.hair.style))return true;
  if (!photoAssessment?.available?.[part]) return false;
  const s = state[part];
  return Boolean((s.color && (part === 'foundation' || s.intensity > 0)) || (part === 'eyes' && ((s.liner && s.linerIntensity > 0) || (s.aegyo && s.aegyoIntensity > 0) || (s.lensColor&&s.lensIntensity>0&&livePhoto?.lensAvailable))));
}
function partAvailable(){return activeTab==='hair'&&(hairTool==='style'||ColorMatchHairStyles.isLoaded(state.hair.style))?Boolean(livePhoto):activeTab==='foundation'&&skinTool==='moles'?Boolean(livePhoto):activeTab==='eyes'&&eyeTool==='lens'?Boolean(livePhoto?.lensAvailable):Boolean(photoAssessment?.available?.[activeTab]);}
function canEdit() {
  if (livePhoto && partAvailable()) return true;
  notify(photoAssessment?.message || '사진을 확인하고 있어요. 잠시 기다려주세요.');
  return false;
}
function mutate(callback, shouldRemember = true) {
  if (!canEdit()) return;
  if (shouldRemember) remember();
  callback();
  render();
}
function chooseColor(color) { mutate(() => { if(activeTab==='eyes'&&eyeTool==='lens')state.eyes.lensColor=color;else state[activeTab].color = color; }); }

async function chooseHairStyle(id){
  if(!canEdit())return;
  const request=++hairStyleRequest,photo=photoSequence;
  hairStyleLoading=id;hairStyleError='';renderHairStyles();
  try{
    if(id)await ColorMatchHairStyles.load(id);
    if(request!==hairStyleRequest||photo!==photoSequence||!livePhoto)return;
    remember();state.hair.style=id;
    for(const key of hairStyleKeys.slice(1))state.hair[key]=initial.hair[key];
  }catch{
    if(request===hairStyleRequest)hairStyleError='스타일 이미지를 불러오지 못했어요. 연결을 확인하고 스타일을 다시 눌러주세요.';
  }finally{
    if(request===hairStyleRequest){hairStyleLoading=null;render();}
  }
}
function cancelHairStyleLoad(){hairStyleRequest++;hairStyleLoading=null;hairStyleError='';}
function renderHairStyles(){
  const styleView=activeTab==='hair'&&hairTool==='style';
  $('hair-menu').hidden=activeTab!=='hair';$('hair-style-controls').hidden=!styleView;
  $('reset-hair-style').hidden=!styleView;
  for(const button of document.querySelectorAll('[data-hair-tool]')){
    const tool=button.dataset.hairTool;button.setAttribute('aria-pressed',String(tool===hairTool));
    button.querySelector('.tool-dot').hidden=!(tool==='color'?state.hair.color&&state.hair.intensity>0:state.hair.style);
  }
  if(!styleView)return;
  const list=$('hair-style-list');
  if(!list.children.length){
    for(const style of [{id:null,name:'원본 머리'},...ColorMatchHairStyles.styles]){
      const button=document.createElement('button');button.type='button';button.className='hair-style-card';button.dataset.hairStyle=style.id||'';
      if(style.id){const image=new Image();image.src=ColorMatchHairStyles.url(style);image.alt='';image.setAttribute('aria-hidden','true');button.append(image);}
      else{const original=document.createElement('span');original.className='hair-original';original.textContent='미적용';button.append(original);}
      const label=document.createElement('span');label.textContent=style.label||style.name;button.append(label);button.setAttribute('aria-label',style.name);
      button.addEventListener('click',()=>chooseHairStyle(style.id));list.append(button);
    }
  }
  for(const button of list.children){
    button.disabled=!livePhoto;button.setAttribute('aria-pressed',String((button.dataset.hairStyle||null)===state.hair.style));
    button.setAttribute('aria-busy',String(Boolean(hairStyleLoading)&&button.dataset.hairStyle===hairStyleLoading));
  }
  $('hair-style-status').hidden=!hairStyleLoading&&!hairStyleError;
  $('hair-style-status').textContent=hairStyleError||(hairStyleLoading?'스타일 이미지를 준비하고 있어요.':'');
  $('reset-hair-style').disabled=!livePhoto||!hairStyleKeys.some(key=>state.hair[key]!==initial.hair[key]);
  $('hair-style-settings').hidden=!state.hair.style;
  for(const [id,key] of [['x','styleX'],['y','styleY'],['width','styleWidth'],['height','styleHeight']]){
    const input=$(`hair-style-${id}`),value=state.hair[key];input.value=value;input.disabled=!livePhoto;
    input.style.setProperty('--progress',`${id==='x'||id==='y'?(value+100)/2:(value-75)/65*100}%`);
    $(`hair-style-${id}-value`).textContent=id==='x'||id==='y'?(value===0?'자동':`${id==='x'?(value>0?'오른쪽':'왼쪽'):(value>0?'아래':'위')} ${Math.abs(value)}%`):`${value}%`;
  }
  $('align-hair-style').disabled=!livePhoto;
}

function moleImageRect(){
  if(!livePhoto)return null;
  const rect=$('rendered-photo').getBoundingClientRect(),ratio=Math.min(rect.width/livePhoto.base.width,rect.height/livePhoto.base.height);
  const width=livePhoto.base.width*ratio,height=livePhoto.base.height*ratio;
  return {left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height};
}
function moleEditing(){return activeTab==='foundation'&&skinTool==='moles'&&Boolean(livePhoto)&&!originalMode&&!comparisonMode;}
function renderMoleHandles(){
  if(!moleOverlay)return;
  moleOverlay.hidden=!moleEditing();
  if(moleOverlay.hidden)return;
  const image=moleImageRect(),viewport=moleOverlay.getBoundingClientRect();
  if(!image)return;
  state.foundation.moles.forEach((mole,i)=>{
    const x=image.left+mole.x*image.width-viewport.left,y=image.top+mole.y*image.height-viewport.top;
    let button=moleOverlay.querySelector(`[data-mole-index="${i}"]`);
    if(!button){button=document.createElement('button');button.className='mole-handle';button.dataset.moleIndex=i;button.innerHTML='<span></span>';button.addEventListener('click',()=>{selectedMole=i;moleArmed=false;render();});moleOverlay.append(button);}
    button.hidden=x<0||y<0||x>viewport.width||y>viewport.height;
    button.setAttribute('aria-label',`점 ${i+1} 선택 및 이동`);button.setAttribute('aria-pressed',String(i===selectedMole));button.style.left=`${x}px`;button.style.top=`${y}px`;
  });
  for(const button of moleOverlay.querySelectorAll('[data-mole-index]'))if(Number(button.dataset.moleIndex)>=state.foundation.moles.length)button.remove();
}
function renderMoleControls(){
  const moles=state.foundation.moles;selectedMole=Math.min(selectedMole,moles.length-1);
  $('mole-count').textContent=moles.length?` · ${moles.length}`:'';
  $('mole-total').textContent=`${moles.length} / 3`;
  $('mole-list').replaceChildren();
  moles.forEach((mole,i)=>{const button=document.createElement('button');button.textContent=`점 ${i+1}`;button.setAttribute('aria-pressed',String(i===selectedMole));button.addEventListener('click',()=>{selectedMole=i;moleArmed=false;render();});$('mole-list').append(button);});
  $('add-mole').disabled=!livePhoto||moles.length>=3;
  $('add-mole').setAttribute('aria-pressed',String(moleArmed));
  $('add-mole').textContent=moleArmed?'위치 선택 취소':'사진에 점 찍기';
  $('delete-mole').disabled=!livePhoto||selectedMole<0;
  $('reset-moles').disabled=!livePhoto||moles.length===0;
  $('mole-settings').hidden=selectedMole<0;
  $('mole-size').value=moles[selectedMole]?.size??40;
  $('mole-size').disabled=!livePhoto||selectedMole<0;
  $('mole-size').style.setProperty('--progress',`${moles[selectedMole]?.size??40}%`);
  $('mole-size-value').textContent=`${moles[selectedMole]?.size??40}%`;
  $('mole-instruction').textContent=moleArmed?'사진의 얼굴을 터치해 점을 찍어주세요.':moles.length?'사진의 점을 드래그하거나 아래 화살표로 위치를 조절하세요.':'최대 3개까지 추가할 수 있어요.';
}
function clearMolesForNewPhoto(){
  state.foundation.moles=[];for(const snapshot of history)snapshot.foundation.moles=[];
  for(const snapshot of [state,...history])for(const key of hairStyleKeys.slice(1))snapshot.hair[key]=initial.hair[key];
  selectedMole=-1;moleArmed=false;
}

function renderPalette() {
  const grid = $('swatch-grid');
  grid.replaceChildren();
  grid.classList.toggle('hair-grid', activeTab === 'hair');
  const lensView=activeTab==='eyes'&&eyeTool==='lens';
  let colors = lensView?MakeupPalettes.lens:palettes[activeTab];
  if(activeTab==='eyes'&&!lensView)colors=colors.filter(color=>color.finish===state.eyes.shadowFinish);
  if(colorFamilies[activeTab]&&colorFamilies[activeTab]!=='전체'&&!lensView)colors=colors.filter(color=>color.family===colorFamilies[activeTab]);
  if (activeTab === 'foundation' && activeTone !== 'all') colors = colors.filter(c => c.tone === activeTone);
  if (activeTab === 'hair' && hairCategory !== '전체') colors = colors.filter(c => c.category === hairCategory);
  $('color-count').textContent = `${colors.length}가지`;
  // A visible 'none' option makes removing eyeshadow discoverable, without an extra toggle.
  if (activeTab !== 'foundation') {
    const none = makeSwatch({ code: '미적용', name: '미적용', hex: '#fff' }, !(lensView?state.eyes.lensColor:state[activeTab].color), () => chooseColor(null));
    none.classList.add('no-color');
    grid.append(none);
  }
  const selected = lensView?state.eyes.lensColor:state[activeTab].color;
  for (const color of colors) grid.append(makeSwatch(color, selected?.code === color.code, () => chooseColor(color)));
  $('selected-chip').style.background = selected?.hex || '';
  $('selected-name').textContent = selected ? `${selected.code === 'CUSTOM' ? '' : selected.code + ' · '}${selected.name}` : (lensView?'렌즈 미적용':activeTab === 'eyes' ? '아이섀도 미적용' : '아직 선택한 색상이 없어요');
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
  if(color.finish==='gloss')button.classList.add('gloss-swatch');
  const circle = document.createElement('span');
  circle.className = 'swatch-circle';
  const label = document.createElement('span');
  label.textContent = activeTab === 'hair' ? color.name : color.code;
  button.append(circle, label);
  button.addEventListener('click', handler);
  return button;
}
function renderFilters() {
  const families=$('family-filter');
  const familyView=['lip','blush'].includes(activeTab)||(activeTab==='eyes'&&eyeTool==='shadow');
  $('palette-filters').hidden=!familyView;
  $('shadow-finish-select').hidden=activeTab!=='eyes';
  $('shadow-finish-select').value=state.eyes.shadowFinish;
  const heading=document.querySelector('.color-heading');
  if($('palette-filters').parentElement!==heading)heading.insertBefore($('palette-filters'),heading.querySelector('.color-heading-actions'));
  heading.classList.toggle('has-filters',familyView);
  $('color-heading').hidden=familyView;
  if(familyView){
    families.replaceChildren();
    const options=['전체',...new Set(palettes[activeTab].map(color=>color.family))];
    const count=activeTab==='eyes'?palettes.eyes.filter(color=>color.finish===state.eyes.shadowFinish).length:palettes[activeTab].length;
    for(const family of options){const option=document.createElement('option');option.value=family;option.textContent=family==='전체'?`전체 (${count})`:family;families.append(option);}
    families.value=colorFamilies[activeTab];
  }
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
  renderMoleHandles();
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
  const moleView=activeTab==='foundation'&&skinTool==='moles';
  const hairStyleView=activeTab==='hair'&&hairTool==='style';
  document.querySelector('.editor').classList.toggle('hair-style-mode',hairStyleView);
  const lensView=activeTab==='eyes'&&eyeTool==='lens';
  if(lensView)$('reset-part').title='컬러 렌즈 초기화';
  $('skin-menu').hidden=activeTab!=='foundation';
  $('mole-controls').hidden=!moleView;
  for(const button of document.querySelectorAll('[data-skin-tool]'))button.setAttribute('aria-pressed',String(button.dataset.skinTool===skinTool));
  const eyeDetail = activeTab === 'eyes' && ['liner','aegyo'].includes(eyeTool);
  $('color-section').hidden = eyeDetail||moleView||hairStyleView;
  $('intensity-section').hidden = activeTab === 'foundation' || eyeDetail||hairStyleView;
  $('color-heading').textContent=lensView?'컬러 렌즈':colorHeadings[activeTab];
  $('liner-controls').hidden = eyeTool !== 'liner';
  $('aegyo-controls').hidden = eyeTool !== 'aegyo';
  $('liner-toggle').hidden = eyeTool !== 'liner';
  $('aegyo-toggle').hidden = eyeTool !== 'aegyo';
  $('tool-heading').hidden = !eyeDetail;
  $('tool-title').textContent = eyeToolNames[eyeTool];
  for (const button of document.querySelectorAll('[data-eye-tool]')) {
    button.setAttribute('aria-pressed', String(button.dataset.eyeTool === eyeTool));
    const tool = button.dataset.eyeTool;
    button.querySelector('.tool-dot').hidden = !(tool === 'shadow' ? state.eyes.color && state.eyes.intensity > 0 : tool === 'liner' ? state.eyes.liner && state.eyes.linerIntensity > 0 : tool==='lens'?state.eyes.lensColor&&state.eyes.lensIntensity>0&&livePhoto?.lensAvailable:state.eyes.aegyo && state.eyes.aegyoIntensity > 0);
  }
  $('liner-settings').hidden = !state.eyes.liner;
  $('blush-settings').hidden = activeTab !== 'blush';
  $('shadow-settings').hidden = activeTab !== 'eyes' || eyeTool !== 'shadow';
  $('lens-settings').hidden=!lensView;
  $('reset-eye-tool').disabled = !livePhoto || !photoAssessment?.available?.eyes || !eyeToolKeys[eyeTool].some(key => JSON.stringify(state.eyes[key]) !== JSON.stringify(initial.eyes[key]));
  $('lip-finish').hidden = activeTab !== 'lip';
  $('liner-toggle').setAttribute('aria-checked', String(state.eyes.liner));
  $('aegyo-toggle').setAttribute('aria-checked', String(state.eyes.aegyo));
  $('aegyo-strength').hidden = !state.eyes.aegyo;
  $('aegyo-intensity').value = state.eyes.aegyoIntensity;
  $('aegyo-intensity').style.setProperty('--progress', `${state.eyes.aegyoIntensity}%`);
  $('aegyo-intensity-value').textContent = `${state.eyes.aegyoIntensity}%`;
  for (const [id,value] of [['shadow-height',state.eyes.shadowHeight],['shadow-width',state.eyes.shadowWidth],['liner-thickness',state.eyes.linerThickness],['liner-length',state.eyes.linerLength],['liner-intensity',state.eyes.linerIntensity],['liner-angle',state.eyes.linerAngle],['lens-ring',state.eyes.lensRing],['blush-size',state.blush.size],['aegyo-position',state.eyes.aegyoPosition]]) {
    $(id).value = value;
    $(id).style.setProperty('--progress', `${id === 'aegyo-position' ? (value+100)/2 : id==='liner-angle'?(value+35)/80*100:value}%`);
    $(`${id}-value`).textContent = id==='liner-angle'?(value===0?'수평':`${value>0?'위로':'아래로'} ${Math.abs(value)}°`):id === 'aegyo-position' ? (value === 0 ? '자동' : `${value > 0 ? '아래' : '위'} ${Math.abs(value)}%`) : `${value}%`;
  }
  $('aegyo-fit-note').textContent = livePhoto?.aegyoFit?.every(fit=>fit.detected) ? '사진 속 눈 아래 명암으로 위치를 추정했어요. 맞지 않으면 조절해주세요.' : '눈 아래 윤곽을 기준으로 배치했어요. 원래 애교살과 맞지 않으면 위치를 조절해주세요.';
  const intensity=lensView?state.eyes.lensIntensity:state[activeTab].intensity??50;
  $('intensity').value = intensity;
  $('intensity').style.setProperty('--progress', `${intensity}%`);
  $('intensity-value').innerHTML = `${intensity}<span>%</span>`;
  document.querySelector('label[for="intensity"]').textContent = lensView?'렌즈 발색':activeTab === 'eyes' ? '아이섀도 적용 강도' : '적용 강도';
  $('intensity-hint').textContent = activeTab === 'hair' ? '밝은 색상은 원래 머리색에 따라 표현이 달라질 수 있어요.' : '선택한 색상을 얼마나 진하게 표현할지 조절해요.';
  const editingReady = Boolean(livePhoto);
  $('reset-part').disabled = !changedPart(activeTab) || !editingReady || (!photoAssessment?.available?.[activeTab]);
  if (activeTab === 'eyes') $('reset-part').disabled = !editingReady || !partAvailable() || !eyeToolKeys[lensView?'lens':'shadow'].some(key => JSON.stringify(state.eyes[key]) !== JSON.stringify(initial.eyes[key]));
  if(activeTab==='foundation')$('reset-part').disabled=!editingReady||!photoAssessment?.available?.foundation||!state.foundation.color;
  if(activeTab==='hair')$('reset-part').disabled=!editingReady||!partAvailable()||!state.hair.color&&state.hair.intensity===initial.hair.intensity;
  $('reset-all').disabled = !Object.keys(state).some(changedPart) || !editingReady;
  $('undo-button').disabled = history.length === 0 || !editingReady;
  $('save-button').disabled = savingImage || !editingReady;
  for (const button of document.querySelectorAll('[data-finish]')) {
    const selected = button.dataset.finish === state.lip.finish;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  const summary = [];
  for (const part of Object.keys(state)) if (state[part].color && (photoAssessment?.available?.[part]||part==='hair'&&ColorMatchHairStyles.isLoaded(state.hair.style))) summary.push(`${partNames[part]} ${state[part].color.code}${part === 'foundation' ? '' : ` ${state[part].intensity}%`}`);
  if(state.hair.style&&editingReady)summary.push(ColorMatchHairStyles.find(state.hair.style)?.name);
  if (state.eyes.liner && (photoAssessment?.available?.eyes)) summary.push('아이라이너');
  if (state.eyes.aegyo && (photoAssessment?.available?.eyes)) summary.push(`애교살 ${state.eyes.aegyoIntensity}%`);
  if(state.eyes.lensColor&&livePhoto?.lensAvailable)summary.push(`렌즈 ${state.eyes.lensColor.name}`);
  if(state.foundation.moles.length)summary.push(`점 ${state.foundation.moles.length}개`);
  $('look-summary').textContent = !editingReady ? '사진 확인 후 메이크업을 적용할 수 있어요.' : summary.join(' · ') || '아직 적용한 메이크업이 없어요.';
  renderFilters(); renderPalette(); renderEffects();
  const unavailable = !partAvailable();
  for(const control of document.querySelectorAll('.swatch, #intensity, #custom-color, [data-finish]')) control.disabled = unavailable;
  $('liner-toggle').disabled = !photoAssessment?.available?.eyes;
  $('aegyo-toggle').disabled = !photoAssessment?.available?.eyes;
  for (const id of ['aegyo-intensity','aegyo-position','liner-thickness','liner-length','liner-intensity','liner-angle']) $(id).disabled = !photoAssessment?.available?.eyes || !(id.startsWith('liner') ? state.eyes.liner : state.eyes.aegyo);
  $('lens-ring').disabled=!livePhoto?.lensAvailable;
  $('blush-size').disabled = !photoAssessment?.available?.blush;
  for (const id of ['shadow-height','shadow-width']) $(id).disabled = !photoAssessment?.available?.eyes;
  $('part-unavailable').hidden = !unavailable || photoAssessment?.status === 'loading';
  $('part-unavailable').textContent = unavailable ? (lensView&&livePhoto?'홍채 위치를 충분히 확인하지 못해 렌즈 기능을 꺼두었어요. 눈이 잘 보이는 사진을 선택해주세요.':photoAssessment?.message || '사진 확인 중에는 메이크업을 선택할 수 없어요.') : '';
  renderMoleControls();renderHairStyles();
}

function selectTab(tab, focus = false) {
  moleArmed=false;
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
document.querySelectorAll('[data-skin-tool]').forEach(button=>button.addEventListener('click',()=>{skinTool=button.dataset.skinTool;moleArmed=false;render();$('editor-panel').scrollTop=0;}));
document.querySelectorAll('[data-hair-tool]').forEach(button=>button.addEventListener('click',()=>{hairTool=button.dataset.hairTool;render();$('editor-panel').scrollTop=0;}));
$('hair-style-color').addEventListener('click',()=>{hairTool='color';render();$('editor-panel').scrollTop=0;});
$('reset-hair-style').addEventListener('click',()=>{cancelHairStyleLoad();mutate(()=>{for(const key of hairStyleKeys)state.hair[key]=initial.hair[key];});});
$('align-hair-style').addEventListener('click',()=>mutate(()=>{for(const key of hairStyleKeys.slice(1))state.hair[key]=initial.hair[key];}));
$('family-filter').addEventListener('change',()=>{colorFamilies[activeTab]=$('family-filter').value;render();});
$('shadow-finish-select').addEventListener('change',()=>mutate(()=>{state.eyes.shadowFinish=$('shadow-finish-select').value;if(state.eyes.color){const match=shadows.find(color=>color.hex===state.eyes.color.hex&&color.finish===state.eyes.shadowFinish);if(match)state.eyes.color=match;}}));
$('reset-eye-tool').addEventListener('click', () => mutate(() => { for (const key of eyeToolKeys[eyeTool]) state.eyes[key] = clone(initial.eyes[key]); }));
for (const [id, getter, setter] of [
  ['intensity', () => activeTab==='eyes'&&eyeTool==='lens'?state.eyes.lensIntensity:state[activeTab].intensity, value => { if(activeTab==='eyes'&&eyeTool==='lens')state.eyes.lensIntensity=value;else state[activeTab].intensity = value; }],
  ['aegyo-intensity', () => state.eyes.aegyoIntensity, value => { state.eyes.aegyoIntensity = value; }],
  ['aegyo-position', () => state.eyes.aegyoPosition, value => { state.eyes.aegyoPosition = value; }],
  ['liner-thickness', () => state.eyes.linerThickness, value => { state.eyes.linerThickness = value; }],
  ['liner-length', () => state.eyes.linerLength, value => { state.eyes.linerLength = value; }],
  ['liner-intensity', () => state.eyes.linerIntensity, value => { state.eyes.linerIntensity = value; }],
  ['liner-angle', () => state.eyes.linerAngle, value => { state.eyes.linerAngle = value; }],
  ['lens-ring', () => state.eyes.lensRing, value => { state.eyes.lensRing = value; }],
  ['mole-size', () => state.foundation.moles[selectedMole]?.size??40, value => { if(state.foundation.moles[selectedMole])state.foundation.moles[selectedMole].size=value; }],
  ['blush-size', () => state.blush.size, value => { state.blush.size = value; }],
  ['shadow-height', () => state.eyes.shadowHeight, value => { state.eyes.shadowHeight = value; }],
  ['shadow-width', () => state.eyes.shadowWidth, value => { state.eyes.shadowWidth = value; }],
  ...[['x','styleX'],['y','styleY'],['width','styleWidth'],['height','styleHeight']].map(([id,key])=>[`hair-style-${id}`,()=>state.hair[key],value=>{state.hair[key]=value;}]),
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
$('undo-button').addEventListener('click', () => { if (history.length && (livePhoto)) { cancelHairStyleLoad();state = history.pop(); render(); notify('직전 변경을 되돌렸어요.'); } });
$('reset-part').addEventListener('click', () => { const name = activeTab==='eyes'&&eyeTool==='lens'?'컬러 렌즈':partNames[activeTab]; mutate(() => { if (activeTab === 'eyes') { for (const key of eyeToolKeys[eyeTool==='lens'?'lens':'shadow']) state.eyes[key] = clone(initial.eyes[key]); } else if(activeTab==='foundation')state.foundation.color=null;else if(activeTab==='hair'){state.hair.color=null;state.hair.intensity=initial.hair.intensity;}else state[activeTab] = clone(initial[activeTab]); }); notify(`${name}을 초기화했어요.`); });
$('reset-all').addEventListener('click', () => { if(!livePhoto)return; cancelHairStyleLoad();remember(); state=clone(initial); render(); notify('모든 메이크업을 초기화했어요. 실행 취소로 되돌릴 수 있어요.'); });
$('add-mole').addEventListener('click',()=>{if(!livePhoto||state.foundation.moles.length>=3)return;moleArmed=!moleArmed;setComparison(false);render();});
$('delete-mole').addEventListener('click',()=>{if(selectedMole<0)return;mutate(()=>state.foundation.moles.splice(selectedMole,1));});
$('reset-moles').addEventListener('click',()=>mutate(()=>{state.foundation.moles=[];selectedMole=-1;moleArmed=false;}));
document.querySelectorAll('[data-mole-move]').forEach(button=>button.addEventListener('click',()=>{
  const mole=state.foundation.moles[selectedMole];if(!mole)return;
  const direction=button.dataset.moleMove,x=mole.x+(direction==='left'?-.003:direction==='right'?.003:0),y=mole.y+(direction==='up'?-.003:direction==='down'?.003:0);
  if(livePhoto?.isFacePoint(x,y))mutate(()=>{mole.x=x;mole.y=y;});
}));

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
moleOverlay=document.createElement('div');moleOverlay.className='mole-overlay';moleOverlay.setAttribute('aria-label','점 위치 편집');
const photoViewport=previewSection.querySelector('.portrait-viewport');photoViewport.append(moleOverlay);
const photoZoom = createPhotoZoom({
  viewport: photoViewport,
  frame: $('portrait-frame'),
  isComparing: () => comparisonMode && !originalMode,
  compare: value => { $('split-slider').value = value; renderEffects(); },
  onViewChange: renderMoleHandles,
});
let moleGesture=null;
const molePointers=new Set();
photoViewport.addEventListener('pointerdown',event=>{
  if(!moleEditing()||event.button>0||event.target.closest('.photo-status'))return;
  const handle=event.target.closest('[data-mole-index]');
  if(!handle&&!moleArmed&&!moleGesture)return;
  molePointers.add(event.pointerId);if(molePointers.size>1){moleGesture=null;return;}
  if(!handle&&!moleArmed)return;
  if(handle){event.preventDefault();selectedMole=Number(handle.dataset.moleIndex);moleArmed=false;renderMoleControls();for(const button of moleOverlay.querySelectorAll('[data-mole-index]'))button.setAttribute('aria-pressed',String(Number(button.dataset.moleIndex)===selectedMole));}
  moleGesture={id:event.pointerId,x:event.clientX,y:event.clientY,index:handle?selectedMole:-1,remembered:false};
},{capture:true});
function moveMole(event){
  if(moleGesture?.id!==event.pointerId||moleGesture.index<0||molePointers.size!==1||!moleEditing()||!state.foundation.moles[moleGesture.index])return;
  const rect=moleImageRect();if(!rect)return;
  const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  if(!livePhoto.isFacePoint(x,y)||Math.hypot(event.clientX-moleGesture.x,event.clientY-moleGesture.y)<2&&!moleGesture.remembered)return;
  if(!moleGesture.remembered){remember();moleGesture.remembered=true;}
  const mole=state.foundation.moles[moleGesture.index];mole.x=x;mole.y=y;renderEffects();
}
document.addEventListener('pointermove',moveMole);
document.addEventListener('pointerup',event=>{
  moveMole(event);
  const gesture=moleGesture;molePointers.delete(event.pointerId);moleGesture=null;
  if(!gesture||gesture.id!==event.pointerId||gesture.index>=0||!moleArmed||!moleEditing()||Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)return;
  const rect=moleImageRect();if(!rect)return;
  const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  if(!livePhoto.isFacePoint(x,y)){notify('얼굴 안쪽의 위치를 선택해주세요.');return;}
  if(state.foundation.moles.length>=3)return;
  mutate(()=>{state.foundation.moles.push({x,y,size:40});selectedMole=state.foundation.moles.length-1;moleArmed=false;});
});
document.addEventListener('pointercancel',event=>{molePointers.delete(event.pointerId);moleGesture=null;});
window.addEventListener('blur',()=>{molePointers.clear();moleGesture=null;});
new ResizeObserver(renderMoleHandles).observe(photoViewport);
$('photo-size-button').addEventListener('click', () => {
  const dialog = $('photo-dialog');
  if (dialog.open) {
    dialog.close();
    return;
  }
  dialog.append(previewSection);
  moleArmed=false;
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
  cancelHairStyleLoad();
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
  clearMolesForNewPhoto();
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
  clearMolesForNewPhoto();
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
