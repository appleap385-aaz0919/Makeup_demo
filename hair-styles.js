/* Static hairstyle assets; no generation service or photo upload is used at runtime. */
(function(root){
  'use strict';
  const styles=[
    {id:'bob',name:'턱선 단발',file:'bob.png',forehead:.30,faceHeight:.53,faceWidth:.36},
    {id:'lob',name:'미디엄 생머리',label:'미디엄',file:'lob.png',forehead:.27,faceHeight:.56,faceWidth:.36},
    {id:'wave',name:'롱 웨이브',file:'wave.png',forehead:.18,faceHeight:.38,faceWidth:.32},
  ];
  const loaded=new Map(),pending=new Map();
  const find=id=>styles.find(style=>style.id===id);
  const url=style=>new URL(`assets/hairstyles/${style.file}`,document.baseURI).href;
  async function load(id){
    if(loaded.has(id))return loaded.get(id);
    if(pending.has(id))return pending.get(id);
    const style=find(id);if(!style)throw new Error('Unknown hairstyle');
    const task=(async()=>{
      const image=new Image();image.src=url(style);
      let timer;
      try{await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Hairstyle load timed out')),20000);})]);}
      finally{clearTimeout(timer);}
      const entry={...style,image,tintKey:null,tinted:null};loaded.set(id,entry);return entry;
    })();
    pending.set(id,task);
    try{return await task;}finally{pending.delete(id);}
  }
  function draw(renderer,ctx,hair){
    const entry=loaded.get(hair.style);if(!entry)return;
    const {image}=entry;
    const tintKey=`${hair.color?.hex||''}/${hair.intensity}`;
    if(entry.tintKey!==tintKey){
      const tinted=entry.tinted||document.createElement('canvas');
      tinted.width=image.naturalWidth;tinted.height=image.naturalHeight;
      const paint=tinted.getContext('2d');paint.drawImage(image,0,0);
      if(hair.color&&hair.intensity>0){
        // Keep strand luminance, then restore the original alpha at the cutout edges.
        paint.globalCompositeOperation='color';paint.globalAlpha=hair.intensity/100*.9;
        paint.fillStyle=hair.color.hex;paint.fillRect(0,0,tinted.width,tinted.height);
        paint.globalCompositeOperation='source-atop';paint.globalAlpha=hair.intensity/100*.22;
        paint.fillRect(0,0,tinted.width,tinted.height);
        paint.globalAlpha=1;paint.globalCompositeOperation='destination-in';paint.drawImage(image,0,0);
      }
      entry.tinted=tinted;entry.tintKey=tintKey;
    }
    const p=renderer.points,forehead=p[10],chin=p[152];
    const faceWidth=Math.hypot(p[127].x-p[356].x,p[127].y-p[356].y);
    const faceHeight=Math.hypot(chin.x-forehead.x,chin.y-forehead.y);
    const width=faceWidth/entry.faceWidth*(hair.styleWidth??100)/100;
    const height=faceHeight/entry.faceHeight*(hair.styleHeight??100)/100;
    const dx=(hair.styleX||0)/100*renderer.unit*.4,dy=(hair.styleY||0)/100*renderer.unit*.4;
    ctx.save();ctx.translate(forehead.x,forehead.y);ctx.rotate(renderer.eyeAngle);
    ctx.translate(dx,dy);ctx.drawImage(entry.tinted,-width*.5,-height*entry.forehead,width,height);ctx.restore();
  }
  root.ColorMatchHairStyles={styles,find,url,load,isLoaded:id=>loaded.has(id),draw};
})(globalThis);
