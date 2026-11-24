/* On-device inference only. Image pixels are never sent to a remote API. */
(function (root) {
  'use strict';
  const VERSION = '0.10.32';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
  const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const SEGMENT_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
  const localAsset = name => new URL(`vendor/vision/${name}`, document.baseURI).href;
  let loading, segmentLoading, faceTask, segmentTask, library, fileset, localAssets = false, attempts = 0;
  const timeout = (promise, ms=45000) => {
    let timer;
    return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('model-timeout')),ms);})]).finally(()=>clearTimeout(timer));
  };
  async function initialize(progress) {
    if (faceTask) return;
    if (loading) return loading;
    loading = (async()=>{
      if (typeof WebAssembly === 'undefined') throw new Error('unsupported-browser');
      progress('얼굴 분석 기능을 준비하고 있어요. 처음에는 모델을 내려받아 시간이 걸릴 수 있어요.');
      const manifest = await fetch(localAsset('ready.json')).catch(()=>null);
      localAssets = Boolean(manifest?.ok);
      const moduleUrl = localAssets ? localAsset('vision_bundle.mjs') : `${CDN}/vision_bundle.mjs`;
      library = await timeout(import(moduleUrl+(attempts++?`?retry=${attempts}`:'')));
      fileset = await library.FilesetResolver.forVisionTasks(localAssets?localAsset('wasm'):`${CDN}/wasm`);
      const task = await timeout(library.FaceLandmarker.createFromOptions(fileset,{
        baseOptions:{modelAssetPath:localAssets?localAsset('face_landmarker.task'):FACE_MODEL,delegate:'CPU'},
        runningMode:'IMAGE',numFaces:3,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,
      }));
      faceTask = task;
    })();
    try { await loading; } finally { loading = null; }
  }
  const canvas = (w,h) => Object.assign(document.createElement('canvas'),{width:w,height:h});
  async function analyze(image, progress=()=>{}, isCurrent=()=>true) {
    await initialize(progress);
    if(!isCurrent())throw new Error('cancelled');
    progress('얼굴 위치와 사진 각도를 확인하고 있어요.');
    // Limit processing size to bound memory use on phones; do not change image color.
    const scale = Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const base = canvas(Math.round(image.naturalWidth*scale),Math.round(image.naturalHeight*scale));
    base.getContext('2d').drawImage(image,0,0,base.width,base.height);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!isCurrent())throw new Error('cancelled');
    let result;
    try { result = faceTask.detect(base); } catch { throw new Error('analysis-error'); }
    const assessment = root.FacePhotoQuality.inspect(result,base.width,base.height);
    if (assessment.status === 'blocked') return {assessment};
    progress('피부와 머리카락 영역을 확인하고 있어요.');
    let segmentation;
    try {
      if (!segmentTask) {
        if(!segmentLoading) segmentLoading = timeout(library.ImageSegmenter.createFromOptions(fileset,{
        baseOptions:{modelAssetPath:localAssets?localAsset('selfie_multiclass.tflite'):SEGMENT_MODEL,delegate:'CPU'},
        runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false,
        }));
        try {segmentTask=await segmentLoading;} finally {segmentLoading=null;}
      }
      if(!isCurrent())throw new Error('cancelled');
      const segmented = segmentTask.segment(base);
      try {
        segmentation = {data:segmented.categoryMask.getAsUint8Array().slice(),width:segmented.categoryMask.width,height:segmented.categoryMask.height};
      } finally { segmented.close(); }
    } catch {
      assessment.available.foundation = false;
      assessment.available.hair = false;
      assessment.status = 'limited';
      assessment.message = '피부·헤어 기능을 불러오지 못했어요. 다른 메이크업은 사용할 수 있어요. 다시 시도할 수 있어요.';
    }
    if (segmentation) {
      const hairPixels = segmentation.data.reduce((sum,x)=>sum+(x===1?1:0),0);
      if (hairPixels < segmentation.data.length*.002) {
        assessment.available.hair = false;
        assessment.status = 'limited';
        assessment.message = '머리카락 영역이 충분히 보이지 않아 헤어 변경은 꺼두었어요. 다른 메이크업은 사용할 수 있어요.';
      }
    }
    if(!isCurrent())throw new Error('cancelled');
    return {assessment,renderer:new Renderer(base,result.faceLandmarks[0],segmentation,assessment.available)};
  }

  const LIP_OUT = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  const LIP_IN = [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
  const EYES = [[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],[362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398]];
  const UPPER = [[33,246,161,160,159,158,157,173,133],[263,466,388,387,386,385,384,398,362]];
  const LOWER = [[33,7,163,144,145,153,154,155,133],[263,249,390,373,374,380,381,382,362]];
  const BROWS = [[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
  function curve(ctx, points, close=true) {
    if (!points.length) return;
    ctx.moveTo(points[0].x,points[0].y);
    for (let i=1;i<points.length-1;i++) ctx.quadraticCurveTo(points[i].x,points[i].y,(points[i].x+points[i+1].x)/2,(points[i].y+points[i+1].y)/2);
    const last = points[points.length-1]; ctx.lineTo(last.x,last.y);
    if(close)ctx.closePath();
  }
  class Renderer {
    constructor(base,landmarks,segmentation,available) {
      this.base = base; this.available = available;
      this.points = landmarks.map(p=>({x:p.x*base.width,y:p.y*base.height}));
      this.masks = {};
      const p = this.points;
      const eyeLeft = {x:(p[33].x+p[133].x)/2,y:(p[33].y+p[133].y)/2};
      const eyeRight = {x:(p[263].x+p[362].x)/2,y:(p[263].y+p[362].y)/2};
      this.unit = Math.hypot(eyeRight.x-eyeLeft.x,eyeRight.y-eyeLeft.y);
      this.up = {x:(eyeRight.y-eyeLeft.y)/this.unit,y:-(eyeRight.x-eyeLeft.x)/this.unit};
      this.makeMask('lip',ctx=>{ctx.beginPath();curve(ctx,LIP_OUT.map(i=>p[i]));curve(ctx,LIP_IN.map(i=>p[i]));ctx.fill('evenodd');},.65);
      // Exclude the eye opening after feathering so blur cannot spill into it.
      this.makeMask('eyeExclusion',ctx=>{
        ctx.lineWidth=Math.max(2,this.unit*.012);ctx.lineJoin='round';
        for(const indices of EYES){ctx.beginPath();ctx.moveTo(p[indices[0]].x,p[indices[0]].y);for(const i of indices.slice(1))ctx.lineTo(p[i].x,p[i].y);ctx.closePath();ctx.fill();ctx.stroke();}
      },0);
      this.eyeAngle = Math.atan2(eyeRight.y-eyeLeft.y,eyeRight.x-eyeLeft.x);
      this.maskSettings = {};
      // Local contrast is only a placement cue, not a learned aegyo-sal detector.
      this.aegyoFit = this.fitAegyo();
      if(segmentation){
        const categoryMask = category=>{
          const small=canvas(segmentation.width,segmentation.height),ctx=small.getContext('2d'),pixels=ctx.createImageData(small.width,small.height);
          segmentation.data.forEach((label,i)=>{if(label===category){pixels.data[i*4]=255;pixels.data[i*4+1]=255;pixels.data[i*4+2]=255;pixels.data[i*4+3]=255;}});
          ctx.putImageData(pixels,0,0);return small;
        };
        this.makeMask('hair',ctx=>ctx.drawImage(categoryMask(1),0,0,base.width,base.height),1.3);
        this.makeMask('foundation',ctx=>{
          ctx.drawImage(categoryMask(3),0,0,base.width,base.height);
          ctx.globalCompositeOperation='destination-out';ctx.beginPath();
          for(const indices of [...EYES,...BROWS,LIP_OUT])curve(ctx,indices.map(i=>p[i]));
          ctx.fill();
        },1.1);
      }
      this.colored=canvas(base.width,base.height);
    }
    fitAegyo() {
      const {width,height}=this.base;
      const pixels=this.base.getContext('2d').getImageData(0,0,width,height).data;
      const luminance=(x,y)=>{const i=(Math.max(0,Math.min(height-1,Math.round(y)))*width+Math.max(0,Math.min(width-1,Math.round(x))))*4;return pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;};
      return LOWER.map(indices=>{
        const edge=indices.map(i=>this.points[i]);
        const eyeWidth=Math.hypot(edge[0].x-edge[8].x,edge[0].y-edge[8].y);
        const profiles=edge.slice(2,7).map(point=>{
          const samples=[];
          const step=Math.max(.75,eyeWidth*.012);
          for(let d=eyeWidth*.06;d<=eyeWidth*.26;d+=step){
            const at=offset=>{let sum=0;for(const side of [-1,0,1])sum+=luminance(point.x-this.up.x*offset+Math.cos(this.eyeAngle)*side*step,point.y-this.up.y*offset+Math.sin(this.eyeAngle)*side*step);return sum/3;};
            const score=(at(d-eyeWidth*.045)+at(d+eyeWidth*.045))/2-at(d);
            samples.push({depth:d,score});
          }
          return samples.sort((a,b)=>b.score-a.score)[0];
        });
        const reliable=profiles.filter(s=>s.score>1.8);
        const depths=reliable.map(s=>s.depth).sort((a,b)=>a-b);
        const median=depths[Math.floor(depths.length/2)];
        const coherent=reliable.filter(s=>Math.abs(s.depth-median)<eyeWidth*.06);
        const detected=coherent.length>=3;
        return {detected,depth:detected?coherent.reduce((sum,s)=>sum+s.depth,0)/coherent.length:eyeWidth*.12,eyeWidth};
      });
    }
    updateMasks(state) {
      const p=this.points,eyes=state.eyes;
      const shadowKey=`${eyes.shadowHeight}/${eyes.shadowWidth}`;
      if(eyes.color&&this.maskSettings.eyes!==shadowKey){
        this.makeMask('eyes',ctx=>{
          for(const indices of UPPER){
            const edge=indices.map(i=>p[i]),outer=edge[0],inner=edge[edge.length-1];
            const width=Math.hypot(inner.x-outer.x,inner.y-outer.y);
            const axis={x:(inner.x-outer.x)/width,y:(inner.y-outer.y)/width};
            const span=.7+eyes.shadowWidth/100*.7;
            const start=(1-span)/2,base=[],top=[];
            const height=this.unit*(.035+eyes.shadowHeight/100*.13);
            for(let i=0;i<=40;i++){
              const t=start+span*i/40;
              const position=Math.max(0,Math.min(1,t))*(edge.length-1);
              const j=Math.min(edge.length-2,Math.floor(position)),mix=position-j;
              const point={x:edge[j].x*(1-mix)+edge[j+1].x*mix,y:edge[j].y*(1-mix)+edge[j+1].y*mix};
              // Extend only the horizontal domain; keep the eyelid boundary anchored.
              const extension=t<0?t:t>1?t-1:0;
              point.x+=axis.x*width*extension;point.y+=axis.y*width*extension;
              const d=Math.pow(Math.sin(i/40*Math.PI),.8)*height;
              base.push(point);top.push({x:point.x+this.up.x*d,y:point.y+this.up.y*d});
            }
            ctx.beginPath();curve(ctx,[...base,...top.reverse()]);ctx.fill();
          }
        },this.unit*.014);
        const ctx=this.masks.eyes.getContext('2d');ctx.globalCompositeOperation='destination-out';ctx.drawImage(this.masks.eyeExclusion,0,0);ctx.globalCompositeOperation='source-over';
        this.maskSettings.eyes=shadowKey;
      }
      const linerKey=`${eyes.linerThickness}/${eyes.linerLength}`;
      if(eyes.liner&&this.maskSettings.liner!==linerKey){
        this.makeMask('liner',ctx=>{
          ctx.beginPath();
          for(const indices of UPPER){
            const edge=indices.map(i=>p[i]),outer=edge[0],inner=edge[edge.length-1];
            const width=Math.hypot(outer.x-inner.x,outer.y-inner.y);
            const outward={x:(outer.x-inner.x)/width,y:(outer.y-inner.y)/width};
            const thickness=this.unit*(.004+.024*eyes.linerThickness/100);
            const raised=edge.map((point,i)=>{const t=i/(edge.length-1),d=thickness*Math.pow(1-t,.65);return{x:point.x+this.up.x*d,y:point.y+this.up.y*d};});
            const length=width*(.36*eyes.linerLength/100+.24*Math.pow(eyes.linerLength/100,2));
            const tip={x:outer.x+outward.x*length+this.up.x*length*.3,y:outer.y+outward.y*length+this.up.y*length*.3};
            curve(ctx,[...edge.slice().reverse(),tip,...raised]);
          }
          ctx.fill();
        },Math.max(1,this.unit*.006));
        this.maskSettings.liner=linerKey;
      }
      if(eyes.aegyo&&this.maskSettings.aegyo!==eyes.aegyoPosition){
        for(const [name,ratio] of [['aegyoLight',.46],['aegyoShadow',1]])this.makeMask(name,ctx=>{
          for(let eye=0;eye<LOWER.length;eye++){
            const fit=this.aegyoFit[eye];
            const position=eyes.aegyoPosition/100;
            const shift=position>0?.1*position+.06*position*position:.1*position;
            const depth=Math.max(fit.eyeWidth*.035,fit.depth+fit.eyeWidth*shift);
            const edge=LOWER[eye].slice(1,-1).map(i=>({x:p[i].x-this.up.x*depth*ratio,y:p[i].y-this.up.y*depth*ratio}));
            // Fade at both ends; no hard, equally thick line under the eye.
            for(let i=0;i<edge.length-1;i++){
              ctx.globalAlpha=Math.sin((i+.5)/(edge.length-1)*Math.PI)*.8;
              ctx.lineWidth=fit.eyeWidth*(name==='aegyoLight'?.065:.025);
              ctx.lineCap='round';ctx.beginPath();ctx.moveTo(edge[i].x,edge[i].y);ctx.lineTo(edge[i+1].x,edge[i+1].y);ctx.stroke();
            }
          }
        },this.unit*.008);
        this.maskSettings.aegyo=eyes.aegyoPosition;
      }
      if(state.blush.color&&this.maskSettings.blush!==state.blush.size){
        const size=.65+state.blush.size/100*1.3;
        this.makeMask('blush',ctx=>{
          for(const [outer,nose] of [[p[234],p[98]],[p[454],p[327]]]){const x=outer.x*.55+nose.x*.45,y=outer.y*.55+nose.y*.45;ctx.beginPath();ctx.ellipse(x,y,this.unit*.23*size,this.unit*.12*size,this.eyeAngle,0,Math.PI*2);ctx.fill();}
        },this.unit*.055*size);
        if(this.masks.foundation){const ctx=this.masks.blush.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.masks.foundation,0,0);ctx.globalCompositeOperation='source-over';}
        this.maskSettings.blush=state.blush.size;
      }
    }
    makeMask(name,paint,blur) {
      const raw=canvas(this.base.width,this.base.height),ctx=raw.getContext('2d');ctx.fillStyle='#fff';ctx.strokeStyle='#fff';paint(ctx);
      const mask=canvas(raw.width,raw.height),m=mask.getContext('2d');m.filter=`blur(${blur}px)`;m.drawImage(raw,0,0);m.filter='none';this.masks[name]=mask;
    }
    tint(ctx,name,color,opacity,mode) {
      const mask=this.masks[name];if(!mask||!opacity)return;
      const temp=this.colored,c=temp.getContext('2d');c.clearRect(0,0,temp.width,temp.height);c.globalCompositeOperation='source-over';c.drawImage(mask,0,0);c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,temp.width,temp.height);
      ctx.save();ctx.globalCompositeOperation=mode;ctx.globalAlpha=opacity;ctx.drawImage(temp,0,0);ctx.restore();
    }
    render(target,state) {
      if(target.width!==this.base.width)target.width=this.base.width;
      if(target.height!==this.base.height)target.height=this.base.height;
      const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(this.base,0,0);
      this.updateMasks(state);
      for(const part of ['foundation','blush','eyes','lip','hair']){
        const s=state[part];if(!s.color||!this.available[part])continue;
        const strength=part==='foundation'?.5:s.intensity/100;
        this.tint(ctx,part,s.color.hex,strength*(part==='foundation'?.28:.8),part==='foundation'?'source-over':'color');
        if(part==='hair')this.tint(ctx,part,s.color.hex,strength*.23,'source-over');
        if(part==='lip'&&s.finish==='gloss')this.tint(ctx,'lip','#fff8ef',strength*.13,'screen');
      }
      if(this.available.eyes&&state.eyes.liner)this.tint(ctx,'liner','#151217',state.eyes.linerIntensity/100*.85,'multiply');
      if(this.available.eyes&&state.eyes.aegyo){this.tint(ctx,'aegyoLight','#ffeed7',state.eyes.aegyoIntensity/100*.4,'screen');this.tint(ctx,'aegyoShadow','#8f685e',state.eyes.aegyoIntensity/100*.35,'multiply');}
    }
  }
  root.ColorMatchPhotoEngine = { analyze };
})(globalThis);
