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
  for(let i=0;i<40;i++){if(await evaluate("Boolean(document.getElementById('onboarding-dialog')?.open)")){await evaluate("document.getElementById('onboarding-close').click()");break;}await new Promise(r=>setTimeout(r,100));}
  for (let i=0;i<40;i++) { if (await evaluate("document.readyState === 'complete' && document.querySelectorAll('.swatch').length === 24 && document.getElementById('portrait').naturalWidth > 0")) break; await new Promise(r=>setTimeout(r,250)); }

  await send('Network.enable');
  const requests=[];
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Network.requestWillBeSent')requests.push({url:data.params.request.url,method:data.params.request.method});});
  async function waitFor(expression, seconds=90){for(let i=0;i<seconds*10;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression);}
  async function screenshot(name){await evaluate("document.getElementById('toast').classList.remove('visible')");const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await mkdir('screenshots',{recursive:true});await writeFile(`screenshots/${name}.png`,Buffer.from(shot.data,'base64'));}
  async function verifyEyeExpansion(name){
    const result=await evaluate(`(()=>{
      const target=document.createElement('canvas'),base=livePhoto.base.getContext('2d').getImageData(0,0,livePhoto.base.width,livePhoto.base.height).data;
      const pixels=()=>target.getContext('2d').getImageData(0,0,target.width,target.height).data;
      const delta=()=>{const d=pixels();let sum=0;for(let i=0;i<d.length;i+=4)sum+=Math.abs(d[i]-base[i])+Math.abs(d[i+1]-base[i+1])+Math.abs(d[i+2]-base[i+2]);return sum;};
      const area=()=>{const d=livePhoto.masks.lashes.getContext('2d').getImageData(0,0,target.width,target.height).data;let sum=0;for(let i=3;i<d.length;i+=4)sum+=d[i]/255;return sum;};
      const s=clone(initial);s.eyes.lashes=true;s.eyes.lashesThickness=0;livePhoto.render(target,s);const thin=area();
      s.eyes.lashesThickness=100;livePhoto.render(target,s);const thick=area();
      s.eyes.lashesLength=0;livePhoto.render(target,s);const short=area();s.eyes.lashesLength=100;livePhoto.render(target,s);const long=area();
      const lashMask=livePhoto.masks.lashes.getContext('2d').getImageData(0,0,target.width,target.height).data,eyeMask=livePhoto.masks.eyeExclusion.getContext('2d').getImageData(0,0,target.width,target.height).data;
      let eyeSpill=0;for(let i=3;i<lashMask.length;i+=4)if(eyeMask[i]>250&&lashMask[i]>0)eyeSpill++;
      s.eyes.lashesIntensity=0;livePhoto.render(target,s);const zero=delta();s.eyes.lashesIntensity=30;livePhoto.render(target,s);const light=delta();s.eyes.lashesIntensity=100;livePhoto.render(target,s);const dark=delta();
      const enabled=livePhoto.available.eyes;livePhoto.available.eyes=false;livePhoto.render(target,s);const unavailable=delta();livePhoto.available.eyes=enabled;
      s.eyes.lashes=false;s.eyes.liner=true;
      const linerColors=MakeupPalettes.liner.map(color=>{s.eyes.linerColor=color;livePhoto.render(target,s);return target.toDataURL();});
      s.eyes.liner=false;s.eyes.browColor=MakeupPalettes.brow[3];s.eyes.browIntensity=0;livePhoto.render(target,s);const browZero=delta();
      s.eyes.browIntensity=55;livePhoto.render(target,s);const browDefault=delta();
      const browMask=livePhoto.masks.brow.getContext('2d').getImageData(0,0,target.width,target.height).data,d=pixels();let browOutside=0;
      for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-base[i])+Math.abs(d[i+1]-base[i+1])+Math.abs(d[i+2]-base[i+2])>3&&browMask[i+3]===0)browOutside++;
      const browColors=MakeupPalettes.brow.map(color=>{s.eyes.browColor=color;livePhoto.render(target,s);return target.toDataURL();});
      const p=livePhoto.points,u=livePhoto.unit,x=Math.min(p[70].x,p[300].x,p[33].x,p[263].x)-u*.15,y=Math.min(p[105].y,p[334].y)-u*.12,w=Math.max(p[70].x,p[300].x,p[33].x,p[263].x)-x+u*.15,h=Math.max(p[145].y,p[374].y)-y+u*.13;
      const sheets={};
      for(const tool of ['liner','brow','lashes']){
        const sheet=document.createElement('canvas');sheet.width=1260;sheet.height=Math.ceil(h/w*420)+40;const ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,sheet.width,sheet.height);
        for(let i=0;i<3;i++){
          const v=clone(initial);
          if(i&&tool==='liner'){v.eyes.liner=true;v.eyes.linerColor=MakeupPalettes.liner[i===1?2:6];}
          if(i&&tool==='brow'){v.eyes.browColor=MakeupPalettes.brow[i===1?3:5];v.eyes.browIntensity=i===1?55:100;}
          if(i&&tool==='lashes'){v.eyes.lashes=true;if(i===2){v.eyes.lashesLength=100;v.eyes.lashesThickness=100;v.eyes.lashesIntensity=100;}}
          livePhoto.render(target,v);ctx.drawImage(target,x,y,w,h,i*420,40,420,sheet.height-40);ctx.fillStyle='#222';ctx.font='16px sans-serif';ctx.fillText(i===0?'Original':i===1?tool+' default':tool+' alternate / maximum',i*420+12,26);
        }
        sheets[tool]=sheet.toDataURL('image/png');
      }
      livePhoto.render(document.getElementById('rendered-photo'),state);
      return {thin,thick,short,long,eyeSpill,zero,light,dark,unavailable,linerUnique:new Set(linerColors).size,browUnique:new Set(browColors).size,browAvailable:livePhoto.browAvailable,browZero,browDefault,browOutside,sheets};
    })()`);
    for(const [tool,url] of Object.entries(result.sheets))await writeFile(`screenshots/eye-${name}-${tool}.png`,Buffer.from(url.split(',')[1],'base64'));
    delete result.sheets;
    assert(result.thick>result.thin*1.5,'Lash thickness increases coverage');assert(result.long>result.short*1.5,'Lash length increases coverage');
    assert.equal(result.eyeSpill,0,'Lashes exclude the eye interior');assert.equal(result.zero,0,'Zero lash intensity is original');assert(result.dark>result.light*2,'Lash intensity visibly changes darkness');assert.equal(result.unavailable,0,'Uncertain/closed eyes disable lashes');
    assert.equal(result.linerUnique,9,'All nine dark eyeliner colors differ');assert.equal(result.browUnique,14,'All fourteen brow colors differ');assert(result.browAvailable&&result.browDefault>1000,'Real brow texture changes color');assert.equal(result.browZero,0);assert.equal(result.browOutside,0,'Brow color stays inside its texture mask');
    console.log('Eye expansion '+name+':',JSON.stringify(result));return result;
  }
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
  async function verifyHairMaterials(name){
    const result=await evaluate(`(()=>{
      const c=document.createElement('canvas'),sheet=document.createElement('canvas');sheet.width=1600;sheet.height=560;const ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1600,560);
      const head=document.createElement('canvas');head.width=1760;head.height=Math.ceil(livePhoto.base.height*.45*440/(livePhoto.base.width*.64))+40;const hc=head.getContext('2d');hc.fillStyle='#fff';hc.fillRect(0,0,head.width,head.height);
      const variants=[null,hairs.find(color=>color.name==='딥 그린'),MakeupPalettes.blondes[1],MakeupPalettes.blondes[5]];
      const originals=livePhoto.base.getContext('2d').getImageData(0,0,livePhoto.base.width,livePhoto.base.height).data;
      let outside=0,changed=0;const brightness=[];
      for(let j=0;j<variants.length;j++){
        const s=clone(initial);s.hair.color=variants[j];s.hair.intensity=80;if(j>1){s.eyes.browColor=MakeupPalettes.brow.find(color=>color.hex===variants[j].hex);s.eyes.browIntensity=70;}
        livePhoto.render(c,s);const ratio=Math.min(400/c.width,520/c.height);ctx.drawImage(c,j*400+(400-c.width*ratio)/2,40,c.width*ratio,c.height*ratio);ctx.fillStyle='#222';ctx.font='16px sans-serif';ctx.fillText(['Original','Deep green 80%','Golden blonde 80%','Platinum blonde 80%'][j],j*400+10,26);
        hc.drawImage(c,c.width*.18,0,c.width*.64,c.height*.45,j*440,40,440,head.height-40);hc.fillStyle='#222';hc.font='16px sans-serif';hc.fillText(['Original','Deep green 80%','Golden blonde 80%','Platinum blonde 80%'][j],j*440+10,26);
        const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,m=livePhoto.masks.hair.getContext('2d').getImageData(0,0,c.width,c.height).data;let sum=0,total=0;
        for(let i=0;i<d.length;i+=4){if(m[i+3]>230){sum+=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;total++;}if(j===1&&Math.abs(d[i]-originals[i])+Math.abs(d[i+1]-originals[i+1])+Math.abs(d[i+2]-originals[i+2])>3){changed++;if(m[i+3]===0)outside++;}}
        brightness.push(sum/total);
      }
      const s=clone(initial);s.hair.color=MakeupPalettes.blondes[1];s.hair.intensity=0;livePhoto.render(c,s);const zero=c.toDataURL()===livePhoto.base.toDataURL();
      s.hair.color=null;s.eyes.browColor=MakeupPalettes.brow[9];s.eyes.browIntensity=0;livePhoto.render(c,s);const browZero=c.toDataURL()===livePhoto.base.toDataURL();
      s.eyes.browColor=null;s.hair.color=hairs.find(color=>color.name==='딥 그린');livePhoto.render(c,s);const originalFace=livePhoto.base.getContext('2d').getImageData(0,0,c.width,c.height).data;s.hair.intensity=100;livePhoto.render(c,s);const coloredFace=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const faceDelta=[151,9,168,4,205,425].map(index=>{const p=livePhoto.points[index],i=(Math.round(p.y)*c.width+Math.round(p.x))*4;return Math.abs(originalFace[i]-coloredFace[i])+Math.abs(originalFace[i+1]-coloredFace[i+1])+Math.abs(originalFace[i+2]-coloredFace[i+2]);});
      return{refined:livePhoto.hairQuality||null,brightness,changed,outside,zero,browZero,faceDelta,image:sheet.toDataURL(),head:head.toDataURL()};
    })()`);
    const url=result.image,head=result.head;delete result.image;delete result.head;await writeFile(`screenshots/hair-${result.refined?'after':'before'}-${name}.png`,Buffer.from(url.split(',')[1],'base64'));await writeFile(`screenshots/hair-head-${name}.png`,Buffer.from(head.split(',')[1],'base64'));
    assert.equal(result.outside,0,'Hair tint stays within its alpha mask');assert(result.changed>1000,'Hair changes visibly');assert(result.zero,'Zero hair intensity is original');
    assert.equal(result.refined?.mode,'confidence-guided','Real model confidence refines the hair boundary');assert(result.refined.softPixels>100,'Hair has partially mixed boundary pixels');assert(result.brightness[2]>result.brightness[0]+25&&result.brightness[3]>result.brightness[0]+25,'Blonde hair visibly lightens the original');assert(result.browZero,'Zero blonde brow strength is original');assert(result.faceDelta.every(delta=>delta<3),'Hair tint preserves forehead, nose and cheek probes');
    console.log('Hair materials '+name+':',JSON.stringify(result));return result;
  }
  const hairSample=await verifyHairMaterials('sample');
  const eyeSample=await verifyEyeExpansion('sample');
  await evaluate("window.qaEyeState=clone(state);window.qaEyeHistory=clone(history);document.getElementById('tab-eyes').click();document.querySelector('[data-eye-tool=liner]').click();document.getElementById('liner-toggle').click();document.querySelectorAll('#liner-palette button')[5].click()");
  assert.equal(await evaluate('state.eyes.linerColor.code'),'L6');
  await evaluate("document.querySelector('[data-eye-tool=brow]').click();document.querySelectorAll('#brow-palette button')[4].click()");
  assert.equal(await evaluate('state.eyes.browColor.code'),'B4');
  await evaluate("document.querySelector('[data-eye-tool=lashes]').click();document.getElementById('lashes-toggle').click();for(const [id,value] of [['lashes-thickness',60],['lashes-length',70],['lashes-intensity',80]]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));}");
  assert.equal(await evaluate('state.eyes.lashesLength'),70);
  await evaluate("document.getElementById('undo-button').click()");assert.equal(await evaluate('state.eyes.lashesIntensity'),65);
  await screenshot('eye-tools-desktop');
  assert.equal(await evaluate("document.querySelector('.steps .step-active b').textContent"),'2','Ready portrait highlights the makeup step');
  for(const [width,height] of [[320,740],[375,667],[440,956],[768,1024]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=600});
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-eye-tool]')).every(button=>{const r=button.getBoundingClientRect();return r.width>=44&&r.height>=44&&button.scrollWidth<=button.clientWidth})"),true,'All six eye tools retain accessible labels and targets');
    assert(await evaluate("document.getElementById('save-button').getBoundingClientRect().height")>=44,'Save target is at least 44px');
    const targets=await evaluate("Array.from(document.querySelectorAll('.comparison-toolbar button,#photo-size-button,#upload-button,#save-button')).filter(b=>b.getBoundingClientRect().width>0).map(b=>({id:b.id,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))");
    assert(targets.every(t=>t.width>=44&&t.height>=44),'Compare, undo, reset, photo tools and save meet 44px touch targets');console.log('Touch targets '+width+':',JSON.stringify(targets));
    for(const tool of ['brow','lashes']){
      await evaluate(`document.querySelector('[data-eye-tool=${tool}]').click()`);
      assert.equal(await evaluate('eyeTool'),tool);await screenshot(`eye-${tool}-${width}`);
      if(tool==='brow')assert.equal(await evaluate("Array.from(document.querySelectorAll('#brow-palette button')).every(button=>{const r=button.getBoundingClientRect();return r.width>=44&&r.height>=44&&button.scrollWidth<=button.clientWidth})"),true,'Brow color labels fit accessible touch targets');
      if(width===375||width===440){await evaluate("document.getElementById('more-palette').click();document.getElementById('more-palette').click()");await screenshot(`eye-${tool}-${width}-controls`);}
      if(width===375&&tool==='lashes'){
        const before=await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().top");
        await evaluate("document.getElementById('lashes-intensity').scrollIntoView({block:'end'})");await screenshot('eye-lashes-375-scrolled');
        assert.equal(await evaluate("document.getElementById('portrait-frame').getBoundingClientRect().top"),before,'Scrolling eye controls keeps the photo fixed');
        const tap=await evaluate("(()=>{const r=document.getElementById('lashes-intensity').getBoundingClientRect();return{x:r.left+r.width*.35,y:r.top+r.height/2}})()");
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...tap});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...tap});
        assert(await evaluate('state.eyes.lashesIntensity')<50,'A pointer tap on the lash slider changes intensity');
      }
    }
  }
  await evaluate("document.getElementById('reset-eye-tool').click()");assert.equal(await evaluate('!state.eyes.lashes && Boolean(state.eyes.browColor) && state.eyes.liner'),true,'Lash reset preserves liner and brows');
  await evaluate("state=window.qaEyeState;history=window.qaEyeHistory;eyeTool='shadow';activeTab='foundation';render()");
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
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
  const eyeSecond=await verifyEyeExpansion('second');
  const hairSecond=await verifyHairMaterials('second');
  const teethMaskAlpha=await evaluate("(()=>{const p=livePhoto.points;const x=Math.round((p[13].x+p[14].x)/2),y=Math.round((p[13].y+p[14].y)/2);return livePhoto.masks.lip.getContext('2d').getImageData(x,y,1,1).data[3];})()");
  assert(teethMaskAlpha<8,'Lip color must exclude the inner mouth/teeth');
  const external=requests.filter(r=>/^https?:/.test(r.url)&&!r.url.startsWith(siteUrl));
  assert.deepEqual(external,[],'Bundled models must not require external requests');
  assert(requests.every(r=>r.method==='GET'),'Photos must not be POSTed anywhere');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual local model inference, segmentation, rendering, comparison, mobile, empty/multiple/small/tilted images; no external requests or photo uploads.');
  await writeFile('screenshots/real-verification.json',JSON.stringify({date:new Date().toISOString(),assessment,eyeSample,eyeSecond,hairSample,hairSecond,options,pixels,noFace,multiple,small,tilted,secondPortrait,teethMaskAlpha,externalRequests:external.length},null,2));
  await send('Browser.close');
} catch(error){console.error(browserLog);throw error;}finally{
  if(socket)socket.close();
  chrome.kill();
  if(path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) && path.basename(profile).startsWith('colormatch-ui-')) {
    await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(error=>console.error('Temporary browser profile cleanup:',error.code));
  }
}
