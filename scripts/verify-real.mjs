import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const siteUrl = new URL(process.env.COLORMATCH_URL || 'http://127.0.0.1:4173/').href;

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
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
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
  for (let i=0;i<40;i++) { if (await evaluate("document.readyState === 'complete' && document.querySelectorAll('.swatch').length === 24 && document.getElementById('portrait').naturalWidth > 0")) break; await new Promise(r=>setTimeout(r,250)); }

  await send('Network.enable');
  const requests=[];
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Network.requestWillBeSent')requests.push({url:data.params.request.url,method:data.params.request.method});});
  async function waitFor(expression, seconds=90){for(let i=0;i<seconds*10;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression);}
  async function screenshot(name){await evaluate("document.getElementById('toast').classList.remove('visible')");const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await mkdir('screenshots',{recursive:true});await writeFile(`screenshots/${name}.png`,Buffer.from(shot.data,'base64'));}
  await send('DOM.enable');
  const doc=await send('DOM.getDocument');
  const input=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#photo-input'});
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.resolve('assets/sample-portrait.png')]});
  await waitFor("photoAssessment && photoAssessment.status !== 'loading'");
  const assessment=await evaluate('photoAssessment');
  console.log('Actual portrait analysis:',JSON.stringify(assessment));
  await screenshot('real-analysis');
  assert.equal(assessment.status,'ready');
  for(const part of ['foundation','lip','blush','eyes','hair'])assert.equal(assessment.available[part],true,part+' unavailable');
  await evaluate("document.getElementById('tab-foundation').click();document.querySelectorAll('.swatch')[9].click();document.getElementById('tab-lip').click();document.querySelectorAll('.swatch')[10].click();document.getElementById('tab-blush').click();document.querySelectorAll('.swatch')[5].click();document.getElementById('tab-eyes').click();document.querySelectorAll('.swatch')[6].click();document.querySelector('[data-eye-tool=liner]').click();document.getElementById('liner-toggle').click();document.querySelector('[data-eye-tool=aegyo]').click();document.getElementById('aegyo-toggle').click();document.getElementById('tab-hair').click();document.querySelectorAll('.swatch')[10].click()");
  const options=await evaluate(`(()=>{
    const saved=clone(state),target=document.createElement('canvas');
    const stats=name=>{const m=livePhoto.masks[name],d=m.getContext('2d').getImageData(0,0,m.width,m.height).data;let area=0,weightedY=0,minX=m.width,maxX=0,soft=0;for(let i=3;i<d.length;i+=4){const a=d[i]/255;if(a>.03){const x=((i-3)/4)%m.width;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}area+=a;weightedY+=Math.floor((i-3)/4/m.width)*a;if(a>0&&a<1)soft++;}return{area,y:weightedY/area,width:maxX-minX,soft};};
    const s=clone(initial);s.eyes.liner=true;s.eyes.linerThickness=10;s.eyes.linerLength=0;livePhoto.render(target,s);const thin=stats('liner');
    s.eyes.linerThickness=90;livePhoto.render(target,s);const thick=stats('liner');
    s.eyes.linerLength=70;livePhoto.render(target,s);const oldMaxLength=stats('liner');
    s.eyes.linerLength=100;livePhoto.render(target,s);const long=stats('liner');
    s.eyes.linerAngle=-35;livePhoto.render(target,s);const linerDown=stats('liner');
    s.eyes.linerAngle=45;livePhoto.render(target,s);const linerUp=stats('liner');
    s.eyes.linerIntensity=0;livePhoto.render(target,s);const linerZero=target.toDataURL();
    s.eyes.liner=false;livePhoto.render(target,s);const noLiner=target.toDataURL();
    s.blush.color=blushes[5];s.blush.size=0;livePhoto.render(target,s);const narrow=stats('blush');
    s.blush.size=100;livePhoto.render(target,s);const wide=stats('blush');
    s.eyes.aegyo=true;s.eyes.aegyoPosition=-50;livePhoto.render(target,s);const upper=stats('aegyoShadow');
    s.eyes.aegyoPosition=50;livePhoto.render(target,s);const lower=stats('aegyoShadow');
    s.eyes.aegyoPosition=100;livePhoto.render(target,s);const lowest=stats('aegyoShadow');
    s.eyes.color=shadows[8];s.eyes.shadowHeight=0;s.eyes.shadowWidth=0;livePhoto.render(target,s);const shadowSmall=stats('eyes');
    s.eyes.shadowHeight=100;livePhoto.render(target,s);const shadowTall=stats('eyes');
    s.eyes.shadowWidth=100;livePhoto.render(target,s);const shadowWide=stats('eyes');
    const eye=livePhoto.masks.eyeExclusion.getContext('2d').getImageData(0,0,target.width,target.height).data;
    const shadow=livePhoto.masks.eyes.getContext('2d').getImageData(0,0,target.width,target.height).data;
    let eyeSpill=0;for(let i=3;i<eye.length;i+=4)if(eye[i]===255&&shadow[i]>0)eyeSpill++;
    const isolated=clone(initial);isolated.eyes.color=shadows.find(color=>color.code==='E39');isolated.eyes.intensity=40;livePhoto.render(target,isolated);
    const base=livePhoto.base.getContext('2d').getImageData(0,0,target.width,target.height).data;
    const data=()=>target.getContext('2d').getImageData(0,0,target.width,target.height).data;
    const delta=pixels=>{let total=0;for(let i=0;i<pixels.length;i+=4)total+=Math.abs(pixels[i]-base[i])+Math.abs(pixels[i+1]-base[i+1])+Math.abs(pixels[i+2]-base[i+2]);return total;};
    isolated.eyes.intensity=initial.eyes.intensity;livePhoto.render(target,isolated);const defaultShadow=delta(data());
    isolated.eyes.intensity=65;livePhoto.render(target,isolated);const oldDefaultShadow=delta(data());
    const fade=livePhoto.masks.eyes,fadeData=fade.getContext('2d').getImageData(0,0,fade.width,fade.height).data;
    const shadowFade=[159,386].map(index=>{const point=livePhoto.points[index],height=livePhoto.unit*(.035+isolated.eyes.shadowHeight/100*.13);return [.25,.85].map(offset=>{const x=Math.round(point.x+livePhoto.up.x*height*offset),y=Math.round(point.y+livePhoto.up.y*height*offset);return fadeData[(y*fade.width+x)*4+3];});});
    isolated.eyes.intensity=40;livePhoto.render(target,isolated);
    const strongerShadow=delta(data());target.getContext('2d').drawImage(livePhoto.base,0,0);livePhoto.tint(target.getContext('2d'),'eyes',isolated.eyes.color.hex,.4*.8,'color');const previousShadow=delta(data());
    isolated.eyes.shadowFinish='matte';livePhoto.render(target,isolated);const matte=target.toDataURL();isolated.eyes.shadowFinish='gloss';livePhoto.render(target,isolated);const glossy=target.toDataURL();
    const lensState=clone(initial);lensState.eyes.lensColor=MakeupPalettes.lens[7];lensState.eyes.lensIntensity=100;lensState.eyes.lensRing=100;livePhoto.render(target,lensState);
    const lensPixels=data(),lensMask=livePhoto.masks.lens.getContext('2d').getImageData(0,0,target.width,target.height).data,ringMask=livePhoto.masks.lensRing.getContext('2d').getImageData(0,0,target.width,target.height).data;
    let lensChanged=0,lensOutside=0;for(let i=0;i<base.length;i+=4){const difference=Math.abs(lensPixels[i]-base[i])+Math.abs(lensPixels[i+1]-base[i+1])+Math.abs(lensPixels[i+2]-base[i+2]);if(difference>3){lensChanged++;if(lensMask[i+3]===0&&ringMask[i+3]===0)lensOutside++;}}
    const pupils=livePhoto.irises.map(iris=>{const index=(Math.round(iris.center.y)*target.width+Math.round(iris.center.x))*4;return Math.abs(lensPixels[index]-base[index])+Math.abs(lensPixels[index+1]-base[index+1])+Math.abs(lensPixels[index+2]-base[index+2]);});
    const markState=clone(initial),point=livePhoto.points[205];markState.foundation.moles=[{x:point.x/target.width,y:point.y/target.height,size:0}];livePhoto.render(target,markState);const smallMark=delta(data());markState.foundation.moles[0].size=100;livePhoto.render(target,markState);const largeMark=delta(data());
    s.foundation.color=foundations[9];s.foundation.intensity=0;livePhoto.render(target,s);const f0=target.toDataURL();
    s.foundation.intensity=100;livePhoto.render(target,s);const f100=target.toDataURL();
    livePhoto.render(document.getElementById('rendered-photo'),saved);
    return{thin,thick,long,oldMaxLength,linerDown,linerUp,narrow,wide,upper,lower,lowest,shadowSmall,shadowTall,shadowWide,eyeSpill,defaultShadow,oldDefaultShadow,shadowFade,strongerShadow,previousShadow,glossChanges:matte!==glossy,lensAvailable:livePhoto.lensAvailable,lensChanged,lensOutside,pupils,smallMark,largeMark,zeroLinerIsOriginal:linerZero===noLiner,foundationFixed:f0===f100,aegyoFit:livePhoto.aegyoFit};
  })()`);
  assert(options.thick.area>options.thin.area*1.8,'Thickness increases liner area');
  assert(options.long.width>options.thick.width,'Length extends outer wings');
  assert(options.long.width>options.oldMaxLength.width,'Maximum liner extends past the previous range');
  assert(options.linerDown.y>options.linerUp.y,'Liner tail points up or down');
  assert(options.thick.soft>0,'Liner boundary is feathered');
  assert(options.wide.area>options.narrow.area*2,'Blush range expands coverage');
  assert(options.lower.y>options.upper.y,'Aegyo position moves down');
  assert(options.lowest.y>options.lower.y,'Aegyo 100 percent moves farther down');
  assert(options.shadowTall.area>options.shadowSmall.area*2,'Shadow height expands eyelid coverage');
  assert(options.shadowWide.width>options.shadowTall.width,'Shadow width extends horizontal coverage');
  assert.equal(options.eyeSpill,0,'Maximum shadow range excludes eye interiors after feathering');
  assert(options.defaultShadow<options.oldDefaultShadow*.95,'The default shadow is softer than 65 percent');
  assert(options.shadowFade.every(([inner,outer])=>inner>outer*2&&outer>0),'Both upper shadow edges fade gradually toward the skin');
  assert(options.strongerShadow>options.previousShadow*1.2,'Shadow color is stronger at the same intensity');
  assert(options.glossChanges,'Gloss adds a visible highlight');
  assert(options.lensAvailable&&options.lensChanged>50,'Real iris landmarks render colored lenses');
  assert.equal(options.lensOutside,0,'Lenses stay inside iris masks');
  assert(options.pupils.every(value=>value===0),'Lenses preserve pupil centers');
  assert(options.largeMark>options.smallMark*5,'Mark size changes rendered coverage');
  assert(options.zeroLinerIsOriginal,'Zero liner intensity removes its effect');
  assert(options.foundationFixed,'Foundation ignores variable strength');
  console.log('Actual makeup options:',JSON.stringify(options));
  const pixels=await evaluate(`(()=>{const rendered=document.getElementById('rendered-photo');const base=livePhoto.base;const a=base.getContext('2d').getImageData(0,0,base.width,base.height).data;const b=rendered.getContext('2d').getImageData(0,0,base.width,base.height).data;let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;return{changed,total:base.width*base.height};})()`);
  assert(pixels.changed>10000,'Makeup must visibly change actual pixels');
  console.log('Actual rendered pixels:',JSON.stringify(pixels));
  await screenshot('real-makeup-desktop');
  const output=await evaluate("document.getElementById('rendered-photo').toDataURL('image/png')");
  await writeFile('screenshots/real-makeup.png',Buffer.from(output.split(',')[1],'base64'));
  const softShadow=await evaluate("(()=>{const s=clone(initial),c=document.createElement('canvas');s.eyes.color=shadows.find(color=>color.code==='E39');livePhoto.render(c,s);return c.toDataURL('image/png')})()");
  await writeFile('screenshots/real-shadow-default.png',Buffer.from(softShadow.split(',')[1],'base64'));
  const maximum=await evaluate("(()=>{const s=clone(state),c=document.createElement('canvas');s.eyes.shadowHeight=100;s.eyes.shadowWidth=100;s.eyes.linerLength=100;s.eyes.aegyoPosition=100;livePhoto.render(c,s);return c.toDataURL('image/png')})()");
  await writeFile('screenshots/real-eye-maximum.png',Buffer.from(maximum.split(',')[1],'base64'));
  const details=await evaluate("(()=>{const s=clone(state),c=document.createElement('canvas'),p=livePhoto.points[205];s.eyes.color=shadows.find(color=>color.code==='G30');s.eyes.shadowFinish='gloss';s.eyes.intensity=75;s.eyes.lensColor=MakeupPalettes.lens[7];s.eyes.lensIntensity=75;s.eyes.lensRing=50;s.foundation.moles=[{x:p.x/livePhoto.base.width,y:p.y/livePhoto.base.height,size:50}];livePhoto.render(c,s);return c.toDataURL('image/png')})()");
  await writeFile('screenshots/real-gloss-lens-mark.png',Buffer.from(details.split(',')[1],'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await screenshot('real-makeup-mobile');
  await evaluate("document.getElementById('compare-view').click();document.getElementById('photo-size-button').click()");
  await screenshot('real-compare-expanded');
  await evaluate("new Promise(resolve=>{document.getElementById('photo-dialog').addEventListener('close',resolve,{once:true});document.getElementById('photo-size-button').click()})");
  async function fixture(kind){await evaluate(`(async()=>{const image=new Image();image.src='assets/sample-portrait.png';await image.decode();const c=document.createElement('canvas');c.width=1200;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='#e2e3e6';ctx.fillRect(0,0,c.width,c.height);const kind=${JSON.stringify(kind)};if(kind==='multiple'){ctx.drawImage(image,0,100,600,600);ctx.drawImage(image,600,100,600,600);}if(kind==='small')ctx.drawImage(image,550,350,100,100);if(kind==='cropped')ctx.drawImage(image,300,300,650,700,0,0,1200,800);if(kind==='tilted'){ctx.save();ctx.translate(600,400);ctx.rotate(Math.PI/12);ctx.drawImage(image,-350,-350,700,700);ctx.restore();}const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],kind+'.png',{type:'image/png'}));const input=document.getElementById('photo-input');input.files=transfer.files;window.qaBeforeSequence=photoSequence;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await waitFor("photoSequence > window.qaBeforeSequence && photoAssessment && photoAssessment.status !== 'loading'");return evaluate('photoAssessment');}
  const noFace=await fixture('empty');console.log('Actual empty image:',JSON.stringify(noFace));assert.equal(noFace.code,'no-face');await screenshot('real-no-face');
  const multiple=await fixture('multiple');console.log('Actual two portraits:',JSON.stringify(multiple));assert.equal(multiple.code,'multiple-faces');
  const small=await fixture('small');console.log('Actual small portrait:',JSON.stringify(small));assert.equal(small.status,'blocked');
  const tilted=await fixture('tilted');console.log('Actual tilted portrait:',JSON.stringify(tilted));assert.notEqual(tilted.status,'blocked');
  await evaluate('window.qaBeforeSequence=photoSequence');
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.resolve('scripts/fixtures/portrait.jpg')]});
  await waitFor("photoSequence > window.qaBeforeSequence && photoAssessment && photoAssessment.status !== 'loading'");
  const secondPortrait=await evaluate('photoAssessment');
  console.log('Actual second, smiling portrait:',JSON.stringify(secondPortrait));
  assert.notEqual(secondPortrait.status,'blocked');
  const teethMaskAlpha=await evaluate("(()=>{const p=livePhoto.points;const x=Math.round((p[13].x+p[14].x)/2),y=Math.round((p[13].y+p[14].y)/2);return livePhoto.masks.lip.getContext('2d').getImageData(x,y,1,1).data[3];})()");
  assert(teethMaskAlpha<8,'Lip color must exclude the inner mouth/teeth');
  const external=requests.filter(r=>/^https?:/.test(r.url)&&!r.url.startsWith(siteUrl));
  assert.deepEqual(external,[],'Bundled models must not require external requests');
  assert(requests.every(r=>r.method==='GET'),'Photos must not be POSTed anywhere');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual local model inference, segmentation, rendering, comparison, mobile, empty/multiple/small/tilted images; no external requests or photo uploads.');
  await writeFile('screenshots/real-verification.json',JSON.stringify({date:new Date().toISOString(),assessment,options,pixels,noFace,multiple,small,tilted,secondPortrait,teethMaskAlpha,externalRequests:external.length},null,2));
  await send('Browser.close');
} catch(error){console.error(browserLog);throw error;}finally{
  if(socket)socket.close();
  chrome.kill();
  if(path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) && path.basename(profile).startsWith('colormatch-ui-')) {
    await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(error=>console.error('Temporary browser profile cleanup:',error.code));
  }
}
