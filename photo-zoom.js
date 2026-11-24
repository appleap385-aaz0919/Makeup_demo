'use strict';

function createPhotoZoom({viewport, frame, isComparing, compare}) {
  const dialog=document.getElementById('photo-dialog');
  const layers=[document.getElementById('portrait'),document.getElementById('rendered-photo'),document.querySelector('#comparison-original img')];
  const minus=document.getElementById('photo-zoom-out'),plus=document.getElementById('photo-zoom-in');
  let scale=1,x=0,y=0,gesture=null;
  const pointers=new Map();
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function draw(){
    if(!dialog.open)return;
    const limitX=Math.max(0,(frame.clientWidth*scale-viewport.clientWidth)/2);
    const limitY=Math.max(0,(frame.clientHeight*scale-viewport.clientHeight)/2);
    x=clamp(x,-limitX,limitX);y=clamp(y,-limitY,limitY);
    for(const layer of layers)layer.style.transform=`translate(${x}px, ${y}px) scale(${scale})`;
    document.getElementById('photo-zoom-value').textContent=`${Math.round(scale*100)}%`;
    minus.disabled=scale<=.5;plus.disabled=scale>=4;
  }
  function zoom(value,anchor={x:0,y:0}){
    const next=clamp(value,.5,4),ratio=next/scale;
    x=anchor.x-(anchor.x-x)*ratio;y=anchor.y-(anchor.y-y)*ratio;
    scale=next;draw();
  }
  function reset(){scale=1;x=0;y=0;pointers.clear();gesture=null;draw();}
  function clear(){pointers.clear();gesture=null;for(const layer of layers)layer.style.removeProperty('transform');}
  function begin(){
    const points=[...pointers.values()];
    if(points.length>=2){
      const [a,b]=points,rect=viewport.getBoundingClientRect();
      gesture={kind:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale,x,y,center:{x:(a.x+b.x)/2-rect.left-rect.width/2,y:(a.y+b.y)/2-rect.top-rect.height/2}};
    }else if(points.length===1)gesture={kind:'pan',point:points[0],x,y};
    else gesture=null;
  }
  viewport.addEventListener('pointerdown',event=>{
    if(!dialog.open||event.button>0||event.target.closest('button,.photo-status'))return;
    event.preventDefault();viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});begin();
    if(pointers.size===1&&isComparing()){
      const rect=frame.getBoundingClientRect(),split=Number(document.getElementById('split-slider').value)/100;
      if(scale===1||Math.abs(event.clientX-(rect.left+rect.width*split))<22)gesture.kind='compare';
    }
  },{capture:true});
  viewport.addEventListener('pointermove',event=>{
    if(!dialog.open||!pointers.has(event.pointerId))return;
    event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(gesture?.kind==='pinch'&&pointers.size>=2){
      const [a,b]=[...pointers.values()],rect=viewport.getBoundingClientRect();
      scale=clamp(gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance,.5,4);
      const ratio=scale/gesture.scale;
      x=(a.x+b.x)/2-rect.left-rect.width/2-(gesture.center.x-gesture.x)*ratio;
      y=(a.y+b.y)/2-rect.top-rect.height/2-(gesture.center.y-gesture.y)*ratio;draw();
    }else if(gesture?.kind==='compare'){
      const rect=frame.getBoundingClientRect();compare(clamp((event.clientX-rect.left)/rect.width*100,0,100));
    }else if(gesture){x=gesture.x+event.clientX-gesture.point.x;y=gesture.y+event.clientY-gesture.point.y;draw();}
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(name,event=>{if(pointers.delete(event.pointerId))begin();});
  plus.addEventListener('click',()=>zoom(scale+.25));
  minus.addEventListener('click',()=>zoom(scale-.25));
  document.getElementById('photo-zoom-reset').addEventListener('click',reset);
  new ResizeObserver(()=>{pointers.clear();gesture=null;draw();}).observe(viewport);
  return {reset,clear};
}

function initializePanelResize(){
  const editor=document.querySelector('.editor'),workspace=document.querySelector('.workspace');
  const handle=document.getElementById('panel-resizer');
  let start=null;
  function setSize(percent){
    const minimum=Math.max(26,210/workspace.clientHeight*100);
    const size=Math.max(minimum,Math.min(60,percent));
    editor.style.setProperty('--editor-size',`${size}%`);
    handle.setAttribute('aria-valuenow',String(Math.round(100-size)));
    handle.setAttribute('aria-valuemax',String(Math.round(100-minimum)));
  }
  handle.addEventListener('pointerdown',event=>{if(event.button>0)return;event.preventDefault();handle.setPointerCapture(event.pointerId);start={id:event.pointerId,y:event.clientY,height:editor.getBoundingClientRect().height};});
  handle.addEventListener('pointermove',event=>{if(start?.id===event.pointerId)setSize((start.height-(event.clientY-start.y))/workspace.clientHeight*100);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,()=>{start=null;});
  handle.addEventListener('keydown',event=>{
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const current=editor.getBoundingClientRect().height/workspace.clientHeight*100;
    setSize(event.key==='Home'?26:event.key==='End'?60:current+(event.key==='ArrowUp'?5:-5));
  });
  document.getElementById('more-photo').addEventListener('click',()=>setSize(editor.getBoundingClientRect().height/workspace.clientHeight*100-10));
  document.getElementById('more-palette').addEventListener('click',()=>setSize(editor.getBoundingClientRect().height/workspace.clientHeight*100+10));
}
initializePanelResize();
