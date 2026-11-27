/* The native bridge exists only inside the Android app's trusted local origin. */
(function(){
  'use strict';
  const bridge=window.HwasaekNative;
  const isAndroid=Boolean(bridge&&typeof bridge.postMessage==='function');
  const pending=new Map();
  if(isAndroid)bridge.onmessage=event=>{
    try{const result=JSON.parse(event.data),request=pending.get(result.id);if(!request)return;pending.delete(result.id);result.ok?request.resolve(result):request.reject(Object.assign(new Error(result.message||'요청을 완료하지 못했어요.'),{handled:!result.message}));}catch{}
  };
  function request(type,data={}){
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();pending.set(id,{resolve,reject});
      bridge.postMessage(JSON.stringify({id,type,...data}));
    });
  }
  let start;
  const whenStarted=new Promise(resolve=>{start=resolve;});
  window.HwasaekApp={isAndroid,request,whenStarted,start,confirmSave:()=>request('confirmSave'),async save(blob){
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    return request('save',{png:data});
  }};
  if(isAndroid)document.addEventListener('DOMContentLoaded',()=>{
    const help=document.getElementById('show-onboarding');
    help.setAttribute('aria-label','앱 정보 및 사용 방법');
    help.addEventListener('click',event=>{event.stopImmediatePropagation();request('info').catch(()=>{});},true);
  });
})();
