// Run on a network-enabled machine to bundle all inference assets for local use.
import {mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve(import.meta.dirname,'../vendor/vision');
const cdn='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32';
const files=[
 ['vision_bundle.mjs',`${cdn}/vision_bundle.mjs`],
 ['wasm/vision_wasm_internal.js',`${cdn}/wasm/vision_wasm_internal.js`],
 ['wasm/vision_wasm_internal.wasm',`${cdn}/wasm/vision_wasm_internal.wasm`],
 ['wasm/vision_wasm_nosimd_internal.js',`${cdn}/wasm/vision_wasm_nosimd_internal.js`],
 ['wasm/vision_wasm_nosimd_internal.wasm',`${cdn}/wasm/vision_wasm_nosimd_internal.wasm`],
 ['face_landmarker.task','https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'],
 ['selfie_multiclass.tflite','https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'],
 ['LICENSE','https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE'],
];
await mkdir(folder,{recursive:true});
await unlink(path.join(folder,'ready.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
for(const [name,url] of files){
 console.log(`Downloading ${name}`);
 const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
 const target=path.join(folder,name);await mkdir(path.dirname(target),{recursive:true});
 const data=Buffer.from(await response.arrayBuffer());if(data.length<100)throw new Error(`${name}: empty asset`);
 await writeFile(target+'.part',data);await rename(target+'.part',target);
}
await writeFile(path.join(folder,'ready.json'),JSON.stringify({version:'0.10.32',downloadedAt:new Date().toISOString()}));
console.log('Ready: inference assets are stored locally in vendor/vision.');
