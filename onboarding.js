/* First-visit help stays on this device. No analytics or network requests. */
(function(){
  'use strict';
  const key='hwasaek.onboarding.v1',dialog=document.getElementById('onboarding-dialog');
  const card=document.getElementById('onboarding-card'),mask=document.getElementById('onboarding-mask');
  const title=document.getElementById('onboarding-title'),description=document.getElementById('onboarding-description'),content=document.getElementById('onboarding-content');
  const help=document.getElementById('show-onboarding'),next=document.getElementById('onboarding-next'),back=document.getElementById('onboarding-back');
  const pages=[
    {title:'사진과 비교',items:[['#upload-button','사진 바꾸기','내 사진을 선택해 메이크업을 적용해요.'],['#compare-view','전후 비교','구분선을 움직여 원본과 적용 후를 비교해요.']]},
    {title:'메이크업과 저장',items:[['.tabs','편집 메뉴','피부·립스틱·블러셔·눈 화장·헤어를 골라 색상과 옵션을 조절해요.'],['#save-button','이미지 저장','완성한 결과를 사진으로 저장해요.']]},
    {title:'색상이 이상하게 보이나요?'}
  ];
  const inApp=Boolean(window.HwasaekApp?.isAndroid);
  if(inApp){
    pages.pop();
    pages[1].items[1][2]='광고 시청을 완료하면 결과를 사진으로 저장해요.';
  }
  let page=0,previousFocus,previousScroll,frame=0;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const rect=selector=>document.querySelector(selector).getBoundingClientRect();
  function visibleTargets(){
    return (pages[page].items||[]).map(([selector],i)=>{const r=rect(selector);return{x:r.left-5,y:r.top-5,width:r.width+10,height:r.height+10,number:page*2+i+1};});
  }
  function fitTargets(){
    if(innerWidth<=800||!pages[page].items)return;
    const targets=visibleTargets(),top=Math.min(...targets.map(r=>r.y)),bottom=Math.max(...targets.map(r=>r.y+r.height));
    if(bottom-top<innerHeight-24&&(top<12||bottom>innerHeight-12))window.scrollBy({top:(top+bottom-innerHeight)/2,behavior:'instant'});
  }
  function place(){
    if(!dialog.open)return;
    const width=innerWidth,height=innerHeight,targets=visibleTargets(),w=card.offsetWidth,h=card.offsetHeight;
    let x=(width-w)/2,y=(height-h)/2;
    if(targets.length){
      const photo=rect('#portrait-frame'),editor=rect('.editor');
      const preferred={x:(width>800?editor.left+editor.width/2:photo.left+photo.width/2)-w/2,y:width>800?(height-h)/2:photo.top+(photo.height-h)/2};
      const candidates=[preferred,{x,y},{x,y:12},{x,y:height-h-12},{x:12,y},{x:width-w-12,y}];
      const scored=candidates.map(point=>{
        const p={x:clamp(point.x,12,Math.max(12,width-w-12)),y:clamp(point.y,12,Math.max(12,height-h-12))};
        const overlap=targets.reduce((sum,r)=>sum+Math.max(0,Math.min(p.x+w,r.x+r.width+8)-Math.max(p.x,r.x-8))*Math.max(0,Math.min(p.y+h,r.y+r.height+8)-Math.max(p.y,r.y-8)),0);
        return {...p,score:overlap*100+Math.hypot(p.x-preferred.x,p.y-preferred.y)};
      }).sort((a,b)=>a.score-b.score);
      ({x,y}=scored[0]);
    }
    card.style.left=`${x}px`;card.style.top=`${Math.max(12,y)}px`;card.style.visibility='visible';
    mask.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const holes=targets.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="9" fill="black"/>`).join('');
    let marks='';
    const sides=targets.map(r=>{const dx=r.x+r.width/2-(x+w/2),dy=r.y+r.height/2-(y+h/2);return Math.abs(dy)>Math.abs(dx)?(dy>0?'bottom':'top'):(dx>0?'right':'left');});
    for(const [i,r] of targets.entries()){
      const cx=r.x+r.width/2,cy=r.y+r.height/2,cardX=x+w/2,cardY=y+h/2;
      const vertical=Math.abs(cy-cardY)>Math.abs(cx-cardX);
      const shared=sides.filter(side=>side===sides[i]).length>1,lane=(i+1)/(targets.length+1);
      const startX=vertical?(shared?x+w*lane:clamp(cx,x+20,x+w-20)):(cx>cardX?x+w:x);
      const startY=vertical?(cy>cardY?y+h:y):(shared?y+h*lane:clamp(cy,y+20,y+h-20));
      const endX=vertical?clamp(startX,r.x+12,r.x+r.width-12):(cx>cardX?r.x-3:r.x+r.width+3);
      const endY=vertical?(cy>cardY?r.y-3:r.y+r.height+3):clamp(startY,r.y+10,r.y+r.height-10);
      const midY=(startY+endY)/2;
      marks+=`<path data-tour-arrow="${r.number}" d="M${startX} ${startY} C${startX} ${midY} ${endX} ${midY} ${endX} ${endY}" fill="none" stroke="#d8b4fe" stroke-width="2" marker-end="url(#tour-arrow)" mask="url(#tour-holes)"/><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="9" fill="none" stroke="#e7ceff" stroke-width="2"/>`;
      const numberX=clamp(r.x+8,14,width-14),numberY=clamp(r.y+2,14,height-14);
      marks+=`<circle cx="${numberX}" cy="${numberY}" r="12" fill="#5b21b6" stroke="#f2e8ff"/><text x="${numberX}" y="${numberY+4}" text-anchor="middle" fill="white" font-size="12" font-family="sans-serif">${r.number}</text>`;
    }
    mask.innerHTML=`<defs><mask id="tour-holes" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="white"/>${holes}</mask><marker id="tour-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="m2 1 7 4-7 4" fill="none" stroke="#d8b4fe" stroke-width="2"/></marker></defs><rect width="${width}" height="${height}" fill="#17101dcc" mask="url(#tour-holes)"/>${marks}`;
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(place);}
  function renderPage(){
    const data=pages[page];card.style.visibility='hidden';card.scrollTop=0;
    document.getElementById('onboarding-step').textContent=page<2?`사용 안내 · ${page+1} / 2`:'색상 안내';
    title.textContent=data.title;description.textContent=page===2?'삼성 인터넷에서 색상표가 어둡거나 다르게 보이면 아래 설정을 확인해주세요.':'';
    content.replaceChildren();
    if(data.items){
      data.items.forEach(([,name,text],i)=>{
        const row=document.createElement('div');row.className='onboarding-feature';
        const number=document.createElement('span');number.className='onboarding-number';number.textContent=page*2+i+1;number.setAttribute('aria-hidden','true');
        const body=document.createElement('div'),label=document.createElement('strong'),copy=document.createElement('p');label.textContent=name;copy.textContent=text;body.append(label,copy);row.append(number,body);content.append(row);
      });
    }else{
      content.innerHTML='<ol class="onboarding-path"><li>삼성 인터넷 → ☰ → 설정</li><li>웹페이지 보기 및 스크롤 방식 → 다크 모드</li><li><strong>‘웹 콘텐츠에 다크 모드 강제 적용’ 끄기</strong></li></ol><p class="onboarding-alternative">버전에 따라 이름이 다르면 메뉴의 <strong>‘밝은 웹페이지’ 또는 ‘밝은 화면 모드’</strong>를 선택해주세요.</p>';
    }
    if(!inApp&&page===pages.length-1){
      const links=document.createElement('nav');links.className='onboarding-policies';links.setAttribute('aria-label','서비스 정책');
      for(const [href,label] of [['privacy.html','개인정보 처리방침'],['terms.html','이용약관'],['support.html','문의']]){const link=document.createElement('a');link.href=href;link.textContent=label;links.append(link);}
      content.append(links);
    }
    back.hidden=page===0;next.textContent=page===pages.length-1?'시작하기':page===1&&!inApp?'색상 안내':'다음';
    fitTargets();schedule();title.focus({preventScroll:true});
  }
  function open(){
    if(dialog.open)return;
    previousFocus=document.activeElement;previousScroll={left:scrollX,top:scrollY};page=0;
    try{localStorage.setItem(key,'seen');}catch{/* Help remains usable when browser storage is blocked. */}
    dialog.showModal();renderPage();
  }
  function close(){dialog.close();}
  dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);window.scrollTo({...previousScroll,behavior:'instant'});(previousFocus&&previousFocus!==document.body&&previousFocus.isConnected?previousFocus:help).focus({preventScroll:true});});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.getElementById('onboarding-close').addEventListener('click',close);
  next.addEventListener('click',()=>{if(page===pages.length-1)close();else{page++;renderPage();}});
  back.addEventListener('click',()=>{if(page>0){page--;renderPage();}});
  help.addEventListener('click',open);
  window.HwasaekTour={open};
  window.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('scroll',schedule,{capture:true,passive:true});
  new ResizeObserver(schedule).observe(card);
  let seen=false;try{
    seen=localStorage.getItem(key)==='seen';
    // Keep prior visitors' help preference after the service rename.
    if(!seen&&localStorage.getItem('colormatch.onboarding.v1')==='seen'){
      localStorage.setItem(key,'seen');seen=true;
    }
  }catch{}
  if(!seen){if(inApp)window.HwasaekApp.whenStarted.then(()=>requestAnimationFrame(open));else requestAnimationFrame(open);}
})();
