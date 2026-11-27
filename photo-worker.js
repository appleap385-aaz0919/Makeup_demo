/* CPU/WASM inference stays off the UI thread; pixels remain on this device. */
importScripts('face-quality.js','photo-engine.js');
let queue=Promise.resolve();
self.onmessage=({data:{id,bitmap}})=>{
  queue=queue.then(async()=>{
    try{
      const result=await HwasaekPhotoEngine.infer(bitmap,progress=>postMessage({id,progress}));
      const transfer=[];
      if(result.segmentation)for(const key of ['data','hairConfidence','skinConfidence']){
        const value=result.segmentation[key];if(value)transfer.push(value.buffer);
      }
      postMessage({id,result},transfer);
    }catch(error){postMessage({id,error:error.message||'analysis-error'});}
    finally{bitmap.close();}
  });
};
