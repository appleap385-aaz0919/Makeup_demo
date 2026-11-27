/* On-device inference only. Image pixels are never sent to a remote API. */
(function (root) {
  'use strict';
  const VERSION = '0.10.32';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
  const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const SEGMENT_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite';
  const localAsset = name => new URL(`vendor/vision/${name}`, (typeof document==='undefined'?location.href:document.baseURI)).href;
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
  const canvas = (w,h) => typeof document==='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
  async function infer(base, progress=()=>{}) {
    await initialize(progress);
    progress('얼굴 위치와 사진 각도를 확인하고 있어요.');
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
        runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:true,
        }));
        try {segmentTask=await segmentLoading;} finally {segmentLoading=null;}
      }
      const segmented = segmentTask.segment(base);
      try {
        segmentation = {data:segmented.categoryMask.getAsUint8Array().slice(),width:segmented.categoryMask.width,height:segmented.categoryMask.height};
        segmentation.hairConfidence=segmented.confidenceMasks?.[1]?.getAsFloat32Array().slice();
        segmentation.skinConfidence=segmented.confidenceMasks?.[3]?.getAsFloat32Array().slice();
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
    return {assessment,landmarks:result.faceLandmarks[0],segmentation};
  }

  let inferenceWorker,jobId=0;
  const jobs=new Map();
  function getWorker(){
    if(inferenceWorker)return inferenceWorker;
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')throw new Error('unsupported-browser');
    inferenceWorker=new Worker(new URL('photo-worker.js',document.baseURI));
    inferenceWorker.onmessage=({data})=>{
      const job=jobs.get(data.id);if(!job)return;
      if(data.progress){job.progress(data.progress);return;}
      jobs.delete(data.id);clearTimeout(job.timer);
      data.error?job.reject(new Error(data.error)):job.resolve(data.result);
    };
    inferenceWorker.onerror=()=>{
      inferenceWorker.terminate();inferenceWorker=null;
      for(const job of jobs.values()){clearTimeout(job.timer);job.reject(new Error('analysis-error'));}jobs.clear();
    };
    return inferenceWorker;
  }
  async function analyze(image,progress=()=>{},isCurrent=()=>true){
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const base=canvas(Math.round(image.naturalWidth*scale),Math.round(image.naturalHeight*scale));
    base.getContext('2d').drawImage(image,0,0,base.width,base.height);
    const worker=getWorker(),bitmap=await createImageBitmap(base),id=++jobId;
    if(!isCurrent()){bitmap.close();throw new Error('cancelled');}
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        worker.terminate();inferenceWorker=null;
        for(const job of jobs.values()){clearTimeout(job.timer);job.reject(new Error('model-timeout'));}jobs.clear();
      },180000);
      jobs.set(id,{resolve,reject,timer,progress:message=>{if(isCurrent())progress(message);}});
      worker.postMessage({id,bitmap},[bitmap]);
    });
    if(!isCurrent())throw new Error('cancelled');
    if(result.assessment.status==='blocked')return result;
    // Yield before preparing masks so the latest onboarding interaction can paint.
    await new Promise(resolve=>setTimeout(resolve,0));
    return {assessment:result.assessment,renderer:new Renderer(base,result.landmarks,result.segmentation,result.assessment.available)};
  }

  const LIP_OUT = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  const LIP_IN = [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
  const EYES = [[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],[362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398]];
  const UPPER = [[33,246,161,160,159,158,157,173,133],[263,466,388,387,386,385,384,398,362]];
  const LOWER = [[33,7,163,144,145,153,154,155,133],[263,249,390,373,374,380,381,382,362]];
  const BROWS = [[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];
  const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
  const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
  const hexLightness=hex=>{const value=parseInt(hex.slice(1),16);return (((value>>16)&255)*.2126+((value>>8)&255)*.7152+(value&255)*.0722)/255;};
  function sampleGrid(data,w,h,x,y){
    x=clamp(x,0,w-1);y=clamp(y,0,h-1);const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,nx=Math.min(w-1,ix+1),ny=Math.min(h-1,iy+1);
    return (data[iy*w+ix]*(1-fx)+data[iy*w+nx]*fx)*(1-fy)+(data[ny*w+ix]*(1-fx)+data[ny*w+nx]*fx)*fy;
  }
  function boxMean(data,w,h,r){
    const horizontal=new Float32Array(data.length),out=new Float32Array(data.length);
    for(let y=0;y<h;y++){
      let sum=0;for(let x=0;x<=Math.min(r,w-1);x++)sum+=data[y*w+x];
      for(let x=0;x<w;x++){horizontal[y*w+x]=sum/(Math.min(w-1,x+r)-Math.max(0,x-r)+1);if(x-r>=0)sum-=data[y*w+x-r];if(x+r+1<w)sum+=data[y*w+x+r+1];}
    }
    for(let x=0;x<w;x++){
      let sum=0;for(let y=0;y<=Math.min(r,h-1);y++)sum+=horizontal[y*w+x];
      for(let y=0;y<h;y++){out[y*w+x]=sum/(Math.min(h-1,y+r)-Math.max(0,y-r)+1);if(y-r>=0)sum-=horizontal[(y-r)*w+x];if(y+r+1<h)sum+=horizontal[(y+r+1)*w+x];}
    }
    return out;
  }
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
      this.makeMask('eyeOpening',ctx=>{ctx.beginPath();for(const indices of EYES)curve(ctx,indices.map(i=>p[i]));ctx.fill();},0);
      this.eyeAngle = Math.atan2(eyeRight.y-eyeLeft.y,eyeRight.x-eyeLeft.x);
      this.makeBrowMask();
      this.irises=[[468,469,470,471,472],[473,474,475,476,477]].map(indices=>{
        if(indices.some(i=>!p[i]||!Number.isFinite(p[i].x)||!Number.isFinite(p[i].y)))return null;
        const [center,a,b,c,d]=indices.map(i=>p[i]);
        return {center,rx:Math.hypot(a.x-c.x,a.y-c.y)/2,ry:Math.hypot(b.x-d.x,b.y-d.y)/2};
      });
      this.lensAvailable=Boolean(available.eyes)&&this.irises.every(iris=>iris&&iris.rx>2&&iris.ry>2&&iris.rx<this.unit*.16&&iris.ry<this.unit*.16&&this.masks.eyeOpening.getContext('2d').getImageData(Math.round(iris.center.x),Math.round(iris.center.y),1,1).data[3]>128);
      if(this.lensAvailable)this.makeLensMasks();
      this.maskSettings = {};
      // Local contrast is only a placement cue, not a learned aegyo-sal detector.
      this.aegyoFit = this.fitAegyo();
      if(segmentation){
        const categoryMask = category=>{
          const small=canvas(segmentation.width,segmentation.height),ctx=small.getContext('2d'),pixels=ctx.createImageData(small.width,small.height);
          segmentation.data.forEach((label,i)=>{if(label===category){pixels.data[i*4]=255;pixels.data[i*4+1]=255;pixels.data[i*4+2]=255;pixels.data[i*4+3]=255;}});
          ctx.putImageData(pixels,0,0);return small;
        };
        this.makeHairMask(segmentation);
        this.makeMask('foundation',ctx=>{
          ctx.drawImage(categoryMask(3),0,0,base.width,base.height);
          ctx.globalCompositeOperation='destination-out';ctx.beginPath();
          for(const indices of [...EYES,...BROWS,LIP_OUT])curve(ctx,indices.map(i=>p[i]));
          ctx.fill();
        },1.1);
      }
      this.colored=canvas(base.width,base.height);
      this.fiberLayers={};
    }
    makeHairMask(segmentation){
      const started=performance.now(),{width,height}=this.base,scale=Math.min(1,640/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale);
      const guideCanvas=canvas(w,h);guideCanvas.getContext('2d').drawImage(this.base,0,0,w,h);
      const rgb=guideCanvas.getContext('2d').getImageData(0,0,w,h).data;
      const guide=new Float32Array(w*h),prob=new Float32Array(w*h),squared=new Float32Array(w*h),product=new Float32Array(w*h);
      const hair=segmentation.hairConfidence||Float32Array.from(segmentation.data,v=>v===1?1:0),skin=segmentation.skinConfidence||Float32Array.from(segmentation.data,v=>v===3?1:0);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x,j=i*4,I=(rgb[j]*.2126+rgb[j+1]*.7152+rgb[j+2]*.0722)/255;
        guide[i]=I;prob[i]=sampleGrid(hair,segmentation.width,segmentation.height,(x+.5)*segmentation.width/w-.5,(y+.5)*segmentation.height/h-.5);squared[i]=I*I;product[i]=I*prob[i];
      }
      // A small guided filter follows source-image edges, rather than blurring tint across skin.
      const r=5,meanI=boxMean(guide,w,h,r),meanP=boxMean(prob,w,h,r),meanII=boxMean(squared,w,h,r),meanIP=boxMean(product,w,h,r),a=new Float32Array(w*h),b=new Float32Array(w*h);
      for(let i=0;i<a.length;i++){a[i]=(meanIP[i]-meanI[i]*meanP[i])/(Math.max(0,meanII[i]-meanI[i]*meanI[i])+.0025);b[i]=meanP[i]-a[i]*meanI[i];}
      const meanA=boxMean(a,w,h,r),meanB=boxMean(b,w,h,r),mask=canvas(width,height),ctx=mask.getContext('2d'),pixels=ctx.createImageData(width,height),source=this.base.getContext('2d').getImageData(0,0,width,height).data;
      let protectedSkin=0,softPixels=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4,gx=(x+.5)*w/width-.5,gy=(y+.5)*h/height-.5,sx=(x+.5)*segmentation.width/width-.5,sy=(y+.5)*segmentation.height/height-.5;
        const I=(source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722)/255,hc=sampleGrid(hair,segmentation.width,segmentation.height,sx,sy),sc=sampleGrid(skin,segmentation.width,segmentation.height,sx,sy);
        let alpha=Math.pow(clamp((sampleGrid(meanA,w,h,gx,gy)*I+sampleGrid(meanB,w,h,gx,gy)-.04)/.92),1.15);
        alpha*=smooth(.015,.18,hc)*(1-smooth(.55,.95,sc)*(1-hc));
        if(sc>.85&&hc<.15){alpha=0;protectedSkin++;}
        const byte=Math.round(alpha*255);if(byte>0){pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=byte;if(byte<255)softPixels++;}
      }
      ctx.putImageData(pixels,0,0);this.masks.hair=mask;
      this.hairQuality={mode:segmentation.hairConfidence?'confidence-guided':'category-guided',workingSize:[w,h],protectedSkin,softPixels,milliseconds:Math.round(performance.now()-started)};
    }
    tintBrightFiber(ctx,name,color,strength){
      if(!strength)return;
      let layer=this.fiberLayers[name];
      if(layer?.hex!==color.hex){
        const mask=this.masks[name],m=mask.getContext('2d').getImageData(0,0,mask.width,mask.height).data;
        let minX=mask.width,minY=mask.height,maxX=-1,maxY=-1;
        for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(m[(y*mask.width+x)*4+3]>0){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
        if(maxX<minX)return;
        const width=maxX-minX+1,height=maxY-minY+1,source=this.base.getContext('2d').getImageData(minX,minY,width,height).data,histogram=new Float32Array(256);
        let total=0;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const j=(y*width+x)*4,alpha=m[((y+minY)*mask.width+x+minX)*4+3]/255;
          if(alpha>.1){const l=Math.round(source[j]*.2126+source[j+1]*.7152+source[j+2]*.0722),weight=alpha*alpha;histogram[l]+=weight;total+=weight;}
        }
        let median=0,cumulative=0;while(median<255&&(cumulative+=histogram[median])<total*.5)median++;
        const reference=clamp(median/255,.05,.8),channels=[1,3,5].map(offset=>parseInt(color.hex.slice(offset,offset+2),16)),target=(channels[0]*.2126+channels[1]*.7152+channels[2]*.0722)/255;
        const desired=Math.max(reference,target*.84),floor=name==='brow'?.4:Math.max(.22,.45-target*.25),gamma=clamp(Math.log(desired)/Math.log(reference),floor,1);
        const painted=canvas(width,height),paint=painted.getContext('2d'),pixels=paint.createImageData(width,height);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const j=(y*width+x)*4,alpha=m[((y+minY)*mask.width+x+minX)*4+3];if(!alpha)continue;
          const l=(source[j]*.2126+source[j+1]*.7152+source[j+2]*.0722)/255,raised=Math.pow(l,gamma),chroma=Math.min(1,raised/Math.max(.01,target))*Math.min(1,(1-raised)/Math.max(.01,1-target));
          for(let channel=0;channel<3;channel++)pixels.data[j+channel]=clamp(raised*255+(channels[channel]-target*255)*chroma,0,255);
          pixels.data[j+3]=alpha;
        }
        paint.putImageData(pixels,0,0);layer={hex:color.hex,image:painted,x:minX,y:minY};this.fiberLayers[name]=layer;
      }
      ctx.save();ctx.globalAlpha=strength;ctx.drawImage(layer.image,layer.x,layer.y);ctx.restore();
    }
    isFacePoint(x,y){
      const ctx=this.base.getContext('2d');ctx.beginPath();curve(ctx,root.FacePhotoQuality.OVAL.map(i=>this.points[i]));
      return ctx.isPointInPath(x*this.base.width,y*this.base.height);
    }
    makeBrowMask(){
      // Landmarks bound the brow; image contrast keeps the surrounding skin clear.
      this.makeMask('brow',ctx=>{for(const indices of BROWS){ctx.beginPath();curve(ctx,indices.map(i=>this.points[i]));ctx.fill();}},Math.max(.7,this.unit*.004));
      const mask=this.masks.brow,ctx=mask.getContext('2d'),pixels=ctx.getImageData(0,0,mask.width,mask.height);
      const source=this.base.getContext('2d').getImageData(0,0,mask.width,mask.height).data;
      let coverage=0;
      for(const indices of BROWS){
        const padding=Math.ceil(Math.max(.7,this.unit*.004)*4)+2;
        const points=indices.map(i=>this.points[i]),minX=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-padding)),maxX=Math.min(mask.width-1,Math.ceil(Math.max(...points.map(p=>p.x))+padding));
        const minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-padding)),maxY=Math.min(mask.height-1,Math.ceil(Math.max(...points.map(p=>p.y))+padding));
        const luminance=i=>source[i]*.2126+source[i+1]*.7152+source[i+2]*.0722;
        const levels=[];
        for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=(y*mask.width+x)*4;if(pixels.data[i+3]>30)levels.push(luminance(i));}
        levels.sort((a,b)=>a-b);const skin=levels[Math.floor(levels.length*.88)]??180;
        for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
          const i=(y*mask.width+x)*4;
          const contrast=Math.max(0,Math.min(1,(skin-luminance(i)-10)/65));
          pixels.data[i+3]*=Math.pow(contrast,1.5);coverage+=pixels.data[i+3]/255;
        }
      }
      ctx.putImageData(pixels,0,0);this.browAvailable=coverage>this.unit*this.unit*.0003;
    }
    makeLashMask(eyes){
      this.makeMask('lashes',ctx=>{
        for(const indices of UPPER){
          const edge=indices.map(i=>this.points[i]),outer=edge[0],inner=edge[edge.length-1],width=Math.hypot(inner.x-outer.x,inner.y-outer.y);
          const outward={x:(outer.x-inner.x)/width,y:(outer.y-inner.y)/width};
          for(let i=0;i<29;i++){
            const t=.035+(i+Math.sin(i*1.7)*.28)/28*.88,position=t*(edge.length-1),j=Math.min(edge.length-2,Math.floor(position)),mix=position-j;
            const root={x:edge[j].x*(1-mix)+edge[j+1].x*mix+this.up.x*width*.008,y:edge[j].y*(1-mix)+edge[j+1].y*mix+this.up.y*width*.008};
            // Fixed variation avoids identical spikes and prevents flicker while adjusting.
            const variation=.68+.23*Math.sin(i*2.399+1)+.09*Math.cos(i*.7),taper=Math.pow(Math.sin(Math.PI*(.1+t*.88)),1.1);
            const length=width*(.055+.16*eyes.lashesLength/100)*variation*taper;
            const fan=.85-t*1.25+Math.sin(i*1.7)*.12;
            const tip={x:root.x+this.up.x*length+outward.x*length*fan,y:root.y+this.up.y*length+outward.y*length*fan};
            const half=this.unit*(.00065+.0025*eyes.lashesThickness/100)*(.75+.25*variation);
            const side={x:Math.cos(this.eyeAngle)*half,y:Math.sin(this.eyeAngle)*half};
            const fade=ctx.createLinearGradient(root.x,root.y,tip.x,tip.y),opacity=.72+.23*(.5+.5*Math.sin(i*1.9));
            fade.addColorStop(0,`rgba(255,255,255,${opacity})`);fade.addColorStop(.55,`rgba(255,255,255,${opacity*.8})`);fade.addColorStop(1,'#ffffff14');ctx.fillStyle=fade;
            ctx.beginPath();ctx.moveTo(root.x-side.x,root.y-side.y);
            ctx.bezierCurveTo(root.x-side.x+this.up.x*length*.45,root.y-side.y+this.up.y*length*.45,tip.x-side.x*.25,tip.y-side.y*.25,tip.x,tip.y);
            ctx.bezierCurveTo(tip.x+side.x*.25,tip.y+side.y*.25,root.x+side.x+this.up.x*length*.45,root.y+side.y+this.up.y*length*.45,root.x+side.x,root.y+side.y);ctx.closePath();ctx.fill();
          }
        }
      },Math.max(.25,this.unit*.0009));
      const ctx=this.masks.lashes.getContext('2d');ctx.globalCompositeOperation='destination-out';ctx.drawImage(this.masks.eyeExclusion,0,0);ctx.globalCompositeOperation='source-over';
      const pixels=ctx.getImageData(0,0,this.base.width,this.base.height),exclusion=this.masks.eyeExclusion.getContext('2d').getImageData(0,0,this.base.width,this.base.height).data;
      for(let i=3;i<pixels.data.length;i+=4)if(exclusion[i]>250)pixels.data[i]=0;
      ctx.putImageData(pixels,0,0);
    }
    makeLensMasks(){
      for(const name of ['lens','lensRing']){
        this.makeMask(name,ctx=>{
          for(const iris of this.irises){
            ctx.save();ctx.translate(iris.center.x,iris.center.y);ctx.rotate(this.eyeAngle);ctx.scale(iris.rx,iris.ry);
            const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
            for(const [stop,alpha] of name==='lens'?[[0,0],[.37,0],[.48,.9],[.82,1],[1,0]]:[[0,0],[.76,0],[.9,.9],[1,0]])gradient.addColorStop(stop,`rgba(255,255,255,${alpha})`);
            ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
          }
        },0);
        const mask=this.masks[name],ctx=mask.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.masks.eyeOpening,0,0);ctx.globalCompositeOperation='source-over';
        // Preserve bright reflections in the original iris instead of painting over them.
        const pixels=ctx.getImageData(0,0,mask.width,mask.height),source=this.base.getContext('2d').getImageData(0,0,mask.width,mask.height).data;
        for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]){const light=source[i-3]*.2126+source[i-2]*.7152+source[i-1]*.0722;pixels.data[i]*=Math.max(0,1-Math.max(0,light-170)/65);}
        ctx.putImageData(pixels,0,0);
      }
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
      const lashKey=`${eyes.lashesThickness}/${eyes.lashesLength}`;
      if(eyes.lashes&&this.maskSettings.lashes!==lashKey){this.makeLashMask(eyes);this.maskSettings.lashes=lashKey;}
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
            // Fade toward the upper edge instead of filling the entire lid uniformly.
            const center=edge[Math.floor(edge.length/2)];
            const fade=ctx.createLinearGradient(center.x,center.y,center.x+this.up.x*height,center.y+this.up.y*height);
            fade.addColorStop(0,'#ffffffe6');fade.addColorStop(.25,'#fff');fade.addColorStop(.55,'#ffffffb3');fade.addColorStop(.82,'#ffffff38');fade.addColorStop(1,'#ffffff00');
            ctx.fillStyle=fade;ctx.beginPath();curve(ctx,[...base,...top.reverse()]);ctx.fill();
          }
        },this.unit*(.014+eyes.shadowHeight/100*.02));
        const ctx=this.masks.eyes.getContext('2d');ctx.globalCompositeOperation='destination-out';ctx.drawImage(this.masks.eyeExclusion,0,0);ctx.globalCompositeOperation='source-over';
        this.makeMask('shadowGloss',ctx=>{
          for(const indices of UPPER){const center=p[indices[4]],radius=this.unit*.16;ctx.save();ctx.translate(center.x+this.up.x*this.unit*.048,center.y+this.up.y*this.unit*.048);ctx.rotate(this.eyeAngle);ctx.scale(1,.24);const gradient=ctx.createRadialGradient(0,0,0,0,0,radius);gradient.addColorStop(0,'#fff');gradient.addColorStop(.35,'#ffffffaa');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.restore();}
        },this.unit*.003);
        const gloss=this.masks.shadowGloss.getContext('2d');gloss.globalCompositeOperation='destination-in';gloss.drawImage(this.masks.eyes,0,0);gloss.globalCompositeOperation='source-over';
        this.maskSettings.eyes=shadowKey;
      }
      const linerKey=`${eyes.linerThickness}/${eyes.linerLength}/${eyes.linerAngle}`;
      if(eyes.liner&&this.maskSettings.liner!==linerKey){
        this.makeMask('liner',ctx=>{
          ctx.beginPath();
          for(const indices of UPPER){
            const edge=indices.map(i=>p[i]),outer=edge[0],inner=edge[edge.length-1];
            const width=Math.hypot(outer.x-inner.x,outer.y-inner.y);
            const outward={x:(outer.x-inner.x)/width,y:(outer.y-inner.y)/width};
            const thickness=this.unit*(.004+.045*eyes.linerThickness/100);
            const raised=edge.map((point,i)=>{const t=i/(edge.length-1),d=thickness*Math.pow(1-t,.65);return{x:point.x+this.up.x*d,y:point.y+this.up.y*d};});
            const length=width*(.36*eyes.linerLength/100+.24*Math.pow(eyes.linerLength/100,2));
            const angle=(eyes.linerAngle??15)*Math.PI/180;
            const tip={x:outer.x+outward.x*length*Math.cos(angle)+this.up.x*length*Math.sin(angle),y:outer.y+outward.y*length*Math.cos(angle)+this.up.y*length*Math.sin(angle)};
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
        if(part==='hair'&&(s.color.category==='블론드'||hexLightness(s.color.hex)>.63)){this.tintBrightFiber(ctx,'hair',s.color,strength*.95);continue;}
        this.tint(ctx,part,s.color.hex,strength*(part==='foundation'?.28:.8),part==='foundation'?'source-over':'color');
        if(part==='eyes'){
          this.tint(ctx,'eyes',s.color.hex,strength*.48,'source-over');
          if(s.shadowFinish==='gloss')this.tint(ctx,'shadowGloss','#fff6e9',strength*.65,'screen');
        }
        if(part==='hair')this.tint(ctx,part,s.color.hex,strength*.23,'source-over');
        if(part==='lip'&&s.finish==='gloss')this.tint(ctx,'lip','#fff8ef',strength*.13,'screen');
      }
      if(this.browAvailable&&state.eyes.browColor){if(state.eyes.browColor.category==='블론드')this.tintBrightFiber(ctx,'brow',state.eyes.browColor,state.eyes.browIntensity/100*.85);else{this.tint(ctx,'brow',state.eyes.browColor.hex,state.eyes.browIntensity/100*.95,'color');this.tint(ctx,'brow',state.eyes.browColor.hex,state.eyes.browIntensity/100*.28,'source-over');}}
      if(this.available.eyes&&state.eyes.liner)this.tint(ctx,'liner',state.eyes.linerColor?.hex||'#09070b',state.eyes.linerIntensity/100*.98,'multiply');
      if(this.available.eyes&&state.eyes.lashes)this.tint(ctx,'lashes','#21191a',state.eyes.lashesIntensity/100*.95,'multiply');
      if(this.available.eyes&&state.eyes.aegyo){this.tint(ctx,'aegyoLight','#ffeed7',state.eyes.aegyoIntensity/100*.4,'screen');this.tint(ctx,'aegyoShadow','#8f685e',state.eyes.aegyoIntensity/100*.35,'multiply');}
      if(this.lensAvailable&&state.eyes.lensColor){const strength=state.eyes.lensIntensity/100;this.tint(ctx,'lens',state.eyes.lensColor.hex,strength*.9,'color');this.tint(ctx,'lens',state.eyes.lensColor.hex,strength*.4,'source-over');this.tint(ctx,'lensRing','#25212c',strength*state.eyes.lensRing/100*.85,'multiply');}
      for(const mole of state.foundation.moles||[]){const x=mole.x*target.width,y=mole.y*target.height,r=this.unit*(.003+mole.size/100*.021);const gradient=ctx.createRadialGradient(x-r*.15,y-r*.15,0,x,y,r);gradient.addColorStop(0,'#35231fe8');gradient.addColorStop(.65,'#35231fd9');gradient.addColorStop(1,'#35231f00');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
    }
  }
  root.HwasaekPhotoEngine = typeof document==='undefined'?{infer}:{analyze,get workerActive(){return jobs.size>0;}};
})(globalThis);
