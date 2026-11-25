import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const siteUrl=new URL(process.env.COLORMATCH_URL || 'http://127.0.0.1:4173/').href;

const profile = await mkdtemp(path.join(tmpdir(), 'colormatch-ui-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--in-process-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--remote-debugging-port=9226', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
let browserLog = '';
chrome.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-5000); });
let socket;
try {
  let target;
  for (let i = 0; i < 40; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9226/json')).json()).find(t => t.type === 'page'); if (target) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert(target, 'Headless Chrome did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('close', e => console.log('Browser socket closed:', e.code, e.reason));
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const fileChooserEvents=[];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.method === 'Page.fileChooserOpened') fileChooserEvents.push(data.params);
    if (pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); data.error ? p.reject(data.error) : p.resolve(data.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}, socket state ${socket.readyState}`)); }, 15000);
    pending.set(id, {resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); }});
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: siteUrl });
  for (let i=0;i<360;i++) { if (await evaluate("document.readyState === 'complete' && document.querySelectorAll('.swatch').length === 24 && typeof livePhoto !== 'undefined' && livePhoto && photoAssessment?.status === 'ready'")) break; await new Promise(r=>setTimeout(r,250)); }
  assert.equal(await evaluate("document.getElementById('portrait').naturalWidth > 0"), true);
  assert.equal(await evaluate("document.querySelectorAll('.swatch').length"), 24);
  assert.equal(await evaluate("document.getElementById('intensity-section').hidden"),true,'Foundation has no strength control');
  await evaluate("document.querySelectorAll('.swatch')[9].click(); document.getElementById('tab-lip').click(); document.querySelectorAll('.swatch')[6].click(); document.getElementById('tab-blush').click(); document.querySelectorAll('.swatch')[2].click(); document.getElementById('tab-eyes').click(); document.querySelector('[data-eye-tool=liner]').click(); document.getElementById('liner-toggle').click(); document.querySelector('[data-eye-tool=aegyo]').click(); document.getElementById('aegyo-toggle').click(); document.querySelector('[data-eye-tool=shadow]').click(); document.querySelectorAll('.swatch')[6].click();");
  assert.equal(await evaluate("document.getElementById('liner-toggle').getAttribute('aria-checked')"), 'true');
  assert.equal(await evaluate("document.getElementById('aegyo-toggle').getAttribute('aria-checked')"), 'true');
  await evaluate("document.querySelector('.no-color').click()");
  assert.equal(await evaluate('state.eyes.color'), null);
  assert.equal(await evaluate('state.eyes.liner'), true);
  assert.equal(await evaluate('state.eyes.aegyo && state.eyes.aegyoIntensity === 40'), true);
  await evaluate("document.getElementById('undo-button').click(); document.getElementById('tab-hair').click(); document.querySelectorAll('.swatch')[8].click()");
  assert.notEqual(await evaluate('state.hair.color'), null);
  await evaluate("document.getElementById('tab-foundation').click()");
  assert.equal(await evaluate("document.querySelector('.swatch[aria-pressed=true]').getAttribute('aria-label')"), '21N 21호 뉴트럴');
  await evaluate("document.getElementById('compare-view').click(); document.getElementById('split-slider').value=35; document.getElementById('split-slider').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evaluate("document.getElementById('comparison-original').style.clipPath"), 'inset(0px 65% 0px 0px)');
  await evaluate("document.getElementById('original-button').click()");
  assert.equal(await evaluate("document.getElementById('split-slider').hidden"), true);
  await evaluate("document.getElementById('result-view').click(); document.getElementById('tab-lip').click()");
  await mkdir('screenshots', {recursive:true});
  async function screenshot(name) {
    await evaluate("document.getElementById('toast').classList.remove('visible')");
    await new Promise(r=>setTimeout(r,250));
    const shot = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:true});
    await writeFile(`screenshots/${name}.png`, Buffer.from(shot.data,'base64'));
  }
  // Makeup swatches must retain their actual colors when the browser requests auto darkening.
  await send('Emulation.setDeviceMetricsOverride', {width:1024,height:768,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-color-scheme',value:'dark'}]});
  await send('Emulation.setAutoDarkModeOverride', {enabled:true});
  await evaluate("document.getElementById('tab-foundation').click()");
  await screenshot('tablet-auto-dark');
  const tabletColors=await evaluate("({scheme:getComputedStyle(document.documentElement).colorScheme,paper:getComputedStyle(document.querySelector('.editor')).backgroundColor,swatch:getComputedStyle(document.querySelector('.swatch-circle')).backgroundColor})");
  console.log('Tablet auto-dark colors:',tabletColors);
  assert.equal(tabletColors.paper,'rgb(255, 255, 255)','Auto darkening must preserve the light editor background');
  assert.equal(tabletColors.swatch,'rgb(245, 223, 211)','Auto darkening must preserve foundation 13N');
  // Computed CSS can remain unchanged while auto darkening alters the painted pixels.
  const tabletShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  const paintedSwatch=await evaluate(`(async()=>{const image=new Image();image.src='data:image/png;base64,${tabletShot.data}';await image.decode();const rect=document.querySelector('.swatch-circle').getBoundingClientRect();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(image,Math.floor(rect.x+rect.width/2),Math.floor(rect.y+rect.height/2),1,1,0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data)})()`);
  assert.deepEqual(paintedSwatch,[245,223,211,255],'The painted foundation chip must match its actual RGB color');
  await send('Emulation.setAutoDarkModeOverride', {enabled:false});
  await send('Emulation.setEmulatedMedia', {features:[]});
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await evaluate("document.getElementById('tab-lip').click()");
  async function checkPhotoExpansion(screenshotName) {
    await evaluate("document.getElementById('compare-view').click(); document.getElementById('editor-panel').scrollTop=80");
    const before = await evaluate("({look:document.getElementById('look-summary').textContent,clip:document.getElementById('comparison-original').style.clipPath,tab:document.querySelector('[role=tab][aria-selected=true]').id,scroll:document.getElementById('editor-panel').scrollTop})");
    await evaluate("document.getElementById('photo-size-button').click()");
    assert.equal(await evaluate("document.getElementById('photo-dialog').open"), true);
    assert.equal(await evaluate("document.getElementById('photo-size-button').textContent.trim()"), '축소');
    const widthRatio = await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().width / window.innerWidth");
    assert(widthRatio >= .90 && widthRatio <= 1, 'Expanded photo must fill 90–100% of viewport width');
    assert.equal(await evaluate("document.querySelectorAll('#portrait').length"), 1);
    assert.equal(await evaluate("document.getElementById('split-slider').hidden"), false);
    if (screenshotName) await screenshot(screenshotName);
    const centered=await evaluate("(()=>{const v=document.querySelector('#photo-dialog .portrait-viewport').getBoundingClientRect(),f=document.getElementById('portrait-frame').getBoundingClientRect();return Math.abs(v.top+v.height/2-f.top-f.height/2)<2})()");
    assert(centered,'Expanded photo stays vertically centered');
    await evaluate("document.getElementById('photo-zoom-in').click();document.getElementById('photo-zoom-in').click()");
    assert.equal(await evaluate("document.getElementById('photo-zoom-value').textContent"),'150%');
    assert.equal(await evaluate("document.getElementById('portrait').style.transform === document.getElementById('rendered-photo').style.transform && document.getElementById('portrait').style.transform === document.querySelector('#comparison-original img').style.transform"),true,'All photo layers share zoom');
    await evaluate("document.getElementById('photo-zoom-out').click()");
    assert.equal(await evaluate("document.getElementById('photo-zoom-value').textContent"),'125%');
    await evaluate("document.getElementById('photo-zoom-reset').click()");
    assert.equal(await evaluate("document.getElementById('photo-zoom-value').textContent"),'100%');
    await evaluate("for(let i=0;i<20;i++)document.getElementById('photo-zoom-in').click()");
    assert.equal(await evaluate("document.getElementById('photo-zoom-value').textContent === '400%' && document.getElementById('photo-zoom-in').disabled"),true);
    await evaluate("for(let i=0;i<20;i++)document.getElementById('photo-zoom-out').click()");
    assert.equal(await evaluate("document.getElementById('photo-zoom-value').textContent === '50%' && document.getElementById('photo-zoom-out').disabled"),true);
    await evaluate("document.getElementById('photo-zoom-reset').click()");
    await evaluate("new Promise(resolve => { document.getElementById('photo-dialog').addEventListener('close',resolve,{once:true}); document.getElementById('close-photo-dialog').click(); })");
    assert.equal(await evaluate("document.getElementById('portrait').style.transform"),'','Closing removes zoom from the editor');
    const after = await evaluate("({look:document.getElementById('look-summary').textContent,clip:document.getElementById('comparison-original').style.clipPath,tab:document.querySelector('[role=tab][aria-selected=true]').id,scroll:document.getElementById('editor-panel').scrollTop})");
    assert.deepEqual(after,before,'Closing photo view must preserve makeup, comparison, active tab and panel scroll');
    assert.equal(await evaluate("document.activeElement.id"), 'photo-size-button');
    await evaluate("document.getElementById('photo-size-button').click()");
    await evaluate("window.qaPhotoClosed = new Promise(resolve => document.getElementById('photo-dialog').addEventListener('close',()=>resolve(true),{once:true})); true");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await evaluate('window.qaPhotoClosed');
    assert.equal(await evaluate("document.getElementById('photo-dialog').open"), false);
    assert.equal(await evaluate("document.getElementById('photo-size-button').getAttribute('aria-expanded')"), 'false');
    await evaluate("document.getElementById('result-view').click(); document.getElementById('editor-panel').scrollTop=0");
  }
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.equal(await evaluate("getComputedStyle(document.getElementById('save-button')).backgroundColor"), 'rgb(91, 33, 182)');
  await screenshot('desktop');
  for(const width of [1440,1024,768,600,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:width>800?1100:844,deviceScaleFactor:1,mobile:width<1100});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const placement=await evaluate("(()=>{const button=document.getElementById('upload-button'),slot=document.getElementById('photo-actions-slot'),photo=document.getElementById('portrait-frame'),r=button.getBoundingClientRect(),p=photo.getBoundingClientRect();return{header:Boolean(button.closest('.header')),nearPhoto:r.bottom<=p.top&&p.top-r.bottom<=12&&r.right<=p.right+1,unique:document.querySelectorAll('#upload-button').length===1&&document.querySelectorAll('#photo-size-button').length===1,slotHidden:slot.hidden}})()");
    assert.equal(placement.header,width<=600,'Phones retain header controls; tablets and PCs use photo controls');
    assert(placement.unique,'Moving controls never creates duplicate buttons');
    if(width>600)assert(placement.nearPhoto&&!placement.slotHidden,'Tablet and PC buttons stay immediately above the photo');
    if(width===1024||width===768)await screenshot('photo-actions-'+width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1024,height:1100,deviceScaleFactor:1,mobile:true});
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await send('Page.setInterceptFileChooserDialog',{enabled:true});
  const uploadPoint=await evaluate("(()=>{const r=document.getElementById('upload-button').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...uploadPoint,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...uploadPoint,button:'left',clickCount:1});
  for(let i=0;i<20&&!fileChooserEvents.length;i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(fileChooserEvents.length,1,'The relocated tablet button opens the native file picker');
  await send('Page.setInterceptFileChooserDialog',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await checkPhotoExpansion('desktop-expanded');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await evaluate("!document.getElementById('help-button') && !document.getElementById('preview-heading') && document.querySelector('.header #photo-size-button') !== null"),true,'Photo controls occupy brand header');
  const photoHeight=await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().height");
  await evaluate("document.getElementById('more-photo').click()");
  assert(await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().height")>photoHeight+20,'Photo grows when panel shrinks');
  await evaluate("document.getElementById('more-palette').click()");
  assert(Math.abs(await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().height")-photoHeight)<3);
  const handle=await evaluate("(()=>{const r=document.getElementById('panel-resizer').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:handle.x,y:handle.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:handle.x,y:handle.y+40,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:handle.x,y:handle.y+40,button:'left',clickCount:1});
  assert(await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().height")>photoHeight+20,'Dragging the panel boundary enlarges the photo');
  await evaluate("document.querySelector('.editor').style.removeProperty('--editor-size')");
  await evaluate("document.getElementById('tab-eyes').click()");
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.equal(await evaluate('document.documentElement.scrollHeight <= window.innerHeight'), true, 'Page must fit the mobile viewport');
  const portraitBefore = await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().top");
  await evaluate("document.getElementById('editor-panel').scrollTop = 300");
  assert.equal(await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().top"), portraitBefore, 'Portrait must stay visible while palette scrolls');
  assert.equal(await evaluate("document.getElementById('editor-panel').scrollTop > 0"), true);
  await evaluate("document.getElementById('editor-panel').scrollTop = 0");
  await screenshot('mobile-eyes');
  const setRange=async(id,value)=>evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});el.value=${value};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await evaluate("document.querySelector('[data-eye-tool=liner]').click()");
  assert.equal(await evaluate("document.getElementById('color-section').hidden && document.getElementById('intensity-section').hidden && !document.getElementById('liner-settings').hidden"),true);
  await setRange('liner-thickness',80); await setRange('liner-length',70); await setRange('liner-intensity',95);
  assert.equal(await evaluate('state.eyes.linerThickness === 80 && state.eyes.linerLength === 70 && state.eyes.linerIntensity === 95'),true);
  await evaluate("document.getElementById('undo-button').click()");
  assert.equal(await evaluate('state.eyes.linerIntensity'),75,'Undo only last slider change');
  await screenshot('mobile-liner');
  assert.equal(await evaluate("document.querySelector('.eye-menu').getBoundingClientRect().width > document.getElementById('editor-panel').clientWidth*.8"),true,'Eye submenu uses full panel width');
  await evaluate("document.getElementById('reset-eye-tool').click()");
  assert.equal(await evaluate('!state.eyes.liner && Boolean(state.eyes.color) && state.eyes.aegyo'),true,'Liner reset preserves shadow and aegyo');
  await evaluate("document.getElementById('undo-button').click(); document.querySelector('[data-eye-tool=aegyo]').click()");
  await setRange('aegyo-position',35);
  assert.equal(await evaluate('state.eyes.aegyoPosition'),35);
  await screenshot('mobile-aegyo');
  await evaluate("document.querySelector('[data-eye-tool=shadow]').click()");
  assert.equal(await evaluate("!document.getElementById('shadow-settings').hidden"),true);
  await setRange('shadow-height',100);await setRange('shadow-width',100);
  await evaluate("document.getElementById('shadow-settings').scrollIntoView({block:'end'})");
  await screenshot('mobile-shadow-range');
  await evaluate("document.querySelector('[data-eye-tool=liner]').click();document.querySelector('[data-eye-tool=shadow]').click()");
  assert.equal(await evaluate('state.eyes.shadowHeight === 100 && state.eyes.shadowWidth === 100'),true,'Shadow dimensions survive menu changes');
  await evaluate("document.getElementById('reset-part').click()");
  assert.equal(await evaluate('!state.eyes.color && state.eyes.liner && state.eyes.aegyo'),true,'Shadow reset preserves other eye tools');
  assert.equal(await evaluate('state.eyes.shadowHeight === 50 && state.eyes.shadowWidth === 50'),true,'Shadow reset restores both dimensions');
  await evaluate("document.getElementById('undo-button').click(); document.getElementById('tab-blush').click()");
  await setRange('blush-size',85);
  await evaluate("document.getElementById('blush-settings').scrollIntoView({block:'end'})");
  await screenshot('mobile-blush');
  assert.equal(await evaluate('state.blush.size'),85);
  for (const tool of ['shadow','liner','aegyo']) {
    await evaluate(`document.getElementById('tab-eyes').click();document.querySelector('[data-eye-tool=${tool}]').click()`);
    assert.equal(await evaluate("document.querySelectorAll('[data-eye-tool][aria-pressed=true]').length"),1);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
  }
  await evaluate("document.getElementById('tab-lip').click()");
  await screenshot('mobile');
  await checkPhotoExpansion('mobile-expanded');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await evaluate("document.getElementById('photo-size-button').click();document.getElementById('result-view').click()");
  const touchCenter=await evaluate("(()=>{const r=document.querySelector('#photo-dialog .portrait-viewport').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()");
  const touches=distance=>[{x:touchCenter.x-distance,y:touchCenter.y,id:1},{x:touchCenter.x+distance,y:touchCenter.y,id:2}];
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(40)});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(80)});
  await new Promise(r=>setTimeout(r,150));
  assert(await evaluate("parseInt(document.getElementById('photo-zoom-value').textContent)")>=190,'Real touch pinch zooms in');
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(50)});
  await new Promise(r=>setTimeout(r,150));
  const pinchedDown=await evaluate("parseInt(document.getElementById('photo-zoom-value').textContent)");
  assert(pinchedDown<150,'Real touch pinch zooms out: '+pinchedDown);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await evaluate("document.getElementById('photo-zoom-in').click();document.getElementById('photo-zoom-in').click()");
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchCenter.x,y:touchCenter.y,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchCenter.x+45,y:touchCenter.y,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await evaluate("!document.getElementById('portrait').style.transform.startsWith('translate(0px,')"),true,'Zoomed image pans with one finger');
  await screenshot('mobile-pinch-zoom');
  await evaluate("new Promise(resolve=>{document.getElementById('photo-dialog').addEventListener('close',resolve,{once:true});document.getElementById('close-photo-dialog').click()})");
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
  for (const tab of ['foundation','lip','blush','eyes','hair']) {
    await evaluate(`document.getElementById('tab-${tab}').click()`);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${tab} overflows at 320px`);
  }
  for(const tool of ['shadow','liner','aegyo']) {
    await evaluate(`document.getElementById('tab-eyes').click();document.querySelector('[data-eye-tool=${tool}]').click()`);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight'),true,tool+' fits 320px');
  }
  await checkPhotoExpansion();
  // Exercise the expanded palettes and point/lens editing against the real sample.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('window.qaFeatureState=clone(state)');
  for(const part of ['lip','blush','eyes']){
    await evaluate(`document.getElementById('tab-${part}').click();if(activeTab==='eyes')document.querySelector('[data-eye-tool=shadow]').click()`);
    for(const family of ['레드','핑크','코랄','오렌지','브라운/누드','플럼/버건디']){
      await evaluate(`document.getElementById('family-filter').value=${JSON.stringify(family)};document.getElementById('family-filter').dispatchEvent(new Event('change'));document.querySelectorAll('.swatch')[1].click()`);
      assert.equal(await evaluate('state[activeTab].color.family'),family);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,'Palette filters fit the screen');
    }
    await evaluate("document.getElementById('family-filter').selectedIndex=0;document.getElementById('family-filter').dispatchEvent(new Event('change'))");
  }
  await evaluate("document.getElementById('shadow-finish-select').value='gloss';document.getElementById('shadow-finish-select').dispatchEvent(new Event('change'));document.querySelectorAll('.swatch')[5].click()");
  assert.equal(await evaluate("state.eyes.shadowFinish==='gloss' && state.eyes.color.finish==='gloss' && document.querySelectorAll('.gloss-swatch').length===48"),true);
  await screenshot('mobile-gloss-palette');
  await evaluate("document.querySelector('[data-eye-tool=liner]').click()");
  await setRange('liner-angle',-30);
  assert.equal(await evaluate('state.eyes.linerAngle'),-30);
  await screenshot('mobile-liner-direction');
  await evaluate("document.querySelector('[data-eye-tool=lens]').click()");
  assert.equal(await evaluate('livePhoto.lensAvailable'),true,'Real iris landmarks enable lenses');
  await evaluate("document.querySelectorAll('.swatch')[8].click()");
  await setRange('lens-ring',85);
  assert.equal(await evaluate('state.eyes.lensColor.code'), 'C08');
  await screenshot('mobile-lenses');
  await evaluate("document.getElementById('reset-part').click()");
  assert.equal(await evaluate("!state.eyes.lensColor && Boolean(state.eyes.color) && state.eyes.linerAngle===-30"),true,'Lens reset preserves other eye effects');
  await evaluate("document.getElementById('undo-button').click();document.getElementById('tab-foundation').click();document.querySelector('[data-skin-tool=moles]').click()");
  const clickPoint=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
  for(const landmark of [205,425,151]){
    await evaluate("document.getElementById('add-mole').click()");
    const point=await evaluate(`(()=>{const rect=moleImageRect(),p=livePhoto.points[${landmark}];return{x:rect.left+p.x/livePhoto.base.width*rect.width,y:rect.top+p.y/livePhoto.base.height*rect.height}})()`);
    await clickPoint(point.x,point.y);
  }
  assert.equal(await evaluate('state.foundation.moles.length'),3,'Three real photo taps create three marks');
  assert.equal(await evaluate("document.getElementById('add-mole').disabled"),true);
  await evaluate("document.querySelector('#mole-list button').click()");
  await setRange('mole-size',85);
  const oldMole=await evaluate('clone(state.foundation.moles[0])');
  const mark=await evaluate("(()=>{const r=document.querySelector('[data-mole-index=\"0\"]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:mark.x,y:mark.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:mark.x+10,y:mark.y+12,buttons:1});
  await new Promise(r=>setTimeout(r,80));
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:mark.x+10,y:mark.y+12,button:'left',clickCount:1});
  assert.notDeepEqual(await evaluate('state.foundation.moles[0]'),oldMole,'Marks drag in photo coordinates');
  await evaluate("document.getElementById('undo-button').click()");
  assert.deepEqual(await evaluate('state.foundation.moles[0]'),oldMole,'Undo reverses a full drag');
  await evaluate("document.querySelector('[data-mole-move=right]').click()");
  assert(await evaluate('state.foundation.moles[0].x')>oldMole.x,'Arrow controls adjust mark position');
  await screenshot('mobile-beauty-marks');
  await evaluate("document.getElementById('photo-size-button').click();document.getElementById('photo-zoom-in').click();document.getElementById('photo-zoom-in').click()");
  const zoomedMark=await evaluate("(()=>{const r=document.querySelector('[data-mole-index=\"0\"]').getBoundingClientRect(),image=moleImageRect();return{x:r.left+r.width/2,y:r.top+r.height/2,width:image.width,oldX:state.foundation.moles[0].x}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:zoomedMark.x,y:zoomedMark.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:zoomedMark.x+8,y:zoomedMark.y+8,buttons:1});
  await new Promise(r=>setTimeout(r,80));
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:zoomedMark.x+8,y:zoomedMark.y+8,button:'left',clickCount:1});
  await screenshot('mobile-mark-zoom');
  const movedMarkX=await evaluate('state.foundation.moles[0].x');
  assert(Math.abs(movedMarkX-zoomedMark.oldX-8/zoomedMark.width)<.002,'Mark drag follows zoomed photo coordinates: '+JSON.stringify({zoomedMark,movedMarkX}));
  await evaluate("new Promise(resolve=>{document.getElementById('photo-dialog').addEventListener('close',resolve,{once:true});document.getElementById('close-photo-dialog').click()})");
  await evaluate("document.querySelector('[data-skin-tool=foundation]').click();document.querySelectorAll('.swatch')[9].click();document.getElementById('reset-part').click()");
  assert.equal(await evaluate('state.foundation.moles.length'),3,'Foundation reset preserves beauty marks');
  await evaluate("document.querySelector('[data-skin-tool=moles]').click()");
  await evaluate("document.getElementById('delete-mole').click()");
  assert.equal(await evaluate('state.foundation.moles.length'),2);
  await evaluate("document.getElementById('reset-moles').click()");
  assert.equal(await evaluate('state.foundation.moles.length'),0);
  await evaluate("state=window.qaFeatureState;skinTool='foundation';eyeTool='shadow';selectedMole=-1;moleArmed=false;activeTab='foundation';render()");
  // Keep one analysis pending to check the loading state and cancellation deterministically.
  await send('DOM.enable');
  const doc = await send('DOM.getDocument');
  const fileInput = await send('DOM.querySelector', { nodeId:doc.root.nodeId, selector:'#photo-input' });
  await evaluate('window.qaOriginalAnalyze=window.ColorMatchPhotoEngine.analyze; window.ColorMatchPhotoEngine.analyze=()=>new Promise(()=>{})');
  await send('DOM.setFileInputFiles', {nodeId:fileInput.nodeId,files:[path.resolve('assets/sample-portrait.png')]});
  for (let i=0;i<30;i++) { if(await evaluate("document.getElementById('portrait-frame').classList.contains('photo-mode')")) break; await new Promise(r=>setTimeout(r,100)); }
  assert.equal(await evaluate("document.getElementById('rendered-photo').hidden"), true);
  assert.equal(await evaluate('state.foundation.moles.length===0 && history.every(snapshot=>snapshot.foundation.moles.length===0)'),true,'New photos clear mark positions and their old undo snapshots');
  assert.equal(await evaluate("document.getElementById('save-button').disabled"), true);
  await evaluate("window.ColorMatchPhotoEngine.analyze=window.qaOriginalAnalyze; document.getElementById('return-sample').click()");
  for(let i=0;i<100;i++){if(await evaluate('Boolean(livePhoto)'))break;await new Promise(r=>setTimeout(r,100));}
  await evaluate("document.getElementById('reset-all').click()");
  assert.equal(await evaluate("document.getElementById('look-summary').textContent"), '아직 적용한 메이크업이 없어요.');
  await evaluate("document.getElementById('undo-button').click()");
  assert.notEqual(await evaluate("document.getElementById('look-summary').textContent"), '아직 적용한 메이크업이 없어요.');
  await send('Browser.setDownloadBehavior', { behavior:'allow', downloadPath:path.resolve('screenshots') });
  const exportStarted = Date.now();
  await evaluate("document.getElementById('save-button').click()");
  for(let i=0;i<60;i++){ if(await evaluate("document.getElementById('toast').textContent.includes('저장했어요')"))break; await new Promise(r=>setTimeout(r,100)); }
  assert.equal(await evaluate("document.getElementById('toast').textContent"), '이미지를 저장했어요.');
  let exported;
  for (let i=0;i<50;i++) {
    for (const name of await readdir('screenshots')) {
      if (!/^colormatch-\d+\.png$/.test(name)) continue;
      const info = await stat(path.join('screenshots',name));
      if (info.mtimeMs >= exportStarted && info.size > 1000) exported = name;
    }
    if (exported) break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert(exported, 'A complete exported PNG must exist on disk');
  // Test application recovery with controlled analysis results, not a claim of model accuracy.
  const unavailable={foundation:false,lip:false,blush:false,eyes:false,hair:false};
  async function uploadAgain() {
    await send('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[path.resolve('assets/sample-portrait.png')]});
  }
  async function waitFor(expression) {
    for(let i=0;i<60;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}
    assert.fail(`UI did not settle: ${expression}`);
  }
  const rejectedPhotos=[
    ['no-face','얼굴을 찾지 못했어요. 얼굴이 보이는 다른 사진을 선택해주세요.'],
    ['multiple-faces','얼굴이 여러 명 보여요. 한 사람만 나온 사진을 선택해주세요.'],
    ['side-face','얼굴이 옆으로 많이 돌아가 있어요. 양쪽 눈과 입이 보이는 정면 사진을 선택해주세요.'],
    ['small-face','얼굴이 너무 작게 보여요. 얼굴 부분을 잘라내거나 더 가까이 찍은 사진을 선택해주세요.'],
    ['cropped-face','얼굴 일부가 사진 밖으로 잘려 있어요. 이마부터 턱까지 보이는 사진을 선택해주세요.'],
  ];
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const [code,message] of rejectedPhotos){
    await evaluate(`window.ColorMatchPhotoEngine.analyze=async()=>({assessment:${JSON.stringify({status:'blocked',code,message,available:unavailable})}})`);
    await uploadAgain();
    await waitFor(`photoAssessment?.code === ${JSON.stringify(code)}`);
    assert.equal(await evaluate("document.getElementById('photo-status-message').textContent"),message);
    assert.equal(await evaluate("document.getElementById('rendered-photo').hidden"),true);
    assert.equal(await evaluate("document.getElementById('save-button').disabled"),true);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.swatch')).every(b=>b.disabled)"),true);
    if(code==='no-face')await screenshot('photo-no-face');
  }
  await evaluate("window.ColorMatchPhotoEngine.analyze=async()=>{throw new Error('model-timeout')}");
  await uploadAgain();
  await waitFor("photoAssessment?.code === 'model-error'");
  assert.equal(await evaluate("document.getElementById('retry-analysis').hidden"),false);
  assert.equal(await evaluate("document.getElementById('photo-status-message').textContent.includes('사진의 문제는 아니에요')"),true);
  await screenshot('photo-model-error');
  await evaluate(`window.ColorMatchPhotoEngine.analyze=async(image)=>({assessment:{status:'limited',code:'partial',message:'눈 위치가 불확실해 눈 화장은 꺼두었어요.',available:{foundation:true,lip:true,blush:true,eyes:false,hair:false}},renderer:{base:image,render(target){target.width=image.naturalWidth;target.height=image.naturalHeight;target.getContext('2d').drawImage(image,0,0)}}})`);
  await evaluate("document.getElementById('retry-analysis').click()");
  await waitFor("photoAssessment?.code === 'partial'");
  await evaluate("document.getElementById('tab-eyes').click()");
  assert.equal(await evaluate("document.getElementById('liner-toggle').disabled && document.getElementById('aegyo-toggle').disabled"),true);
  await evaluate("document.querySelector('[data-eye-tool=lens]').click()");
  assert.equal(await evaluate("document.getElementById('lens-ring').disabled && Array.from(document.querySelectorAll('.swatch')).every(button=>button.disabled)"),true,'Uncertain eyes disable lenses');
  await evaluate("document.getElementById('tab-lip').click()");
  assert.equal(await evaluate("document.querySelector('.swatch').disabled"),false);
  assert.equal(await evaluate("document.getElementById('rendered-photo').hidden"),false);
  await checkPhotoExpansion();
  await evaluate("window.ColorMatchPhotoEngine.analyze=()=>new Promise(resolve=>{window.qaResolveAnalysis=resolve})");
  await uploadAgain();
  await waitFor("typeof window.qaResolveAnalysis === 'function' && photoAssessment?.status === 'loading'");
  await evaluate(`window.ColorMatchPhotoEngine.analyze=window.qaOriginalAnalyze; document.getElementById('use-sample-photo').click(); window.qaResolveAnalysis({assessment:${JSON.stringify({status:'blocked',code:'no-face',message:'STALE RESULT',available:unavailable})}})`);
  await waitFor("sampleMode && Boolean(livePhoto) && document.getElementById('photo-status').hidden");
  assert.equal(await evaluate("document.getElementById('portrait').getAttribute('src')"),'assets/sample-portrait.png');
  const brokenImage=path.join(profile,'broken.png');
  await writeFile(brokenImage,Buffer.from('not an image'));
  await send('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[brokenImage]});
  await waitFor("document.getElementById('toast').textContent.includes('사진을 읽을 수 없어요')");
  assert.equal(await evaluate('sampleMode'),true);
  assert.deepEqual(errors, []);
  console.log('PASS: makeup UI, PNG export, zoom, mobile layout, rejected photo states, model-error recovery, partial feature restriction, stale analysis cancellation, corrupt file handling. Model outputs were simulated for recovery tests.');
  console.log('Screenshots: screenshots/desktop.png, screenshots/mobile.png');
  await send('Browser.close');
} catch(error) {
  console.error(browserLog);
  throw error;
} finally {
  if (socket) socket.close();
  chrome.kill();
  if(path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) && path.basename(profile).startsWith('colormatch-ui-')) {
    await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(error=>console.error('Temporary browser profile cleanup:',error.code));
  }
}
