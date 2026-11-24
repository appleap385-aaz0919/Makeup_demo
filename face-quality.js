/* Geometry checks are conservative heuristics, not an occlusion classifier. */
(function (root) {
  'use strict';
  const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const available = () => ({ foundation:true, lip:true, blush:true, eyes:true, hair:true });
  const blocked = (code, message) => ({status:'blocked',code,message,available:Object.fromEntries(Object.keys(available()).map(k=>[k,false]))});
  function inspect(result, width, height) {
    const faces = result.faceLandmarks || [];
    if (!faces.length) return blocked('no-face', '얼굴을 찾지 못했어요. 얼굴이 보이는 다른 사진을 선택해주세요.');
    if (faces.length > 1) return blocked('multiple-faces', '얼굴이 여러 명 보여요. 한 사람만 나온 사진을 선택해주세요.');
    const points = faces[0];
    const required = [...OVAL,1,33,133,159,145,263,362,386,374,61,291,13,14];
    if (required.some(i=>!points[i] || !Number.isFinite(points[i].x) || !Number.isFinite(points[i].y))) return blocked('uncertain', '얼굴 위치를 정확히 확인하지 못했어요. 눈과 입이 잘 보이는 다른 사진을 선택해주세요.');
    const oval = OVAL.map(i=>points[i]);
    const minX = Math.min(...oval.map(p=>p.x)), maxX = Math.max(...oval.map(p=>p.x));
    const minY = Math.min(...oval.map(p=>p.y)), maxY = Math.max(...oval.map(p=>p.y));
    const faceWidth = (maxX-minX)*width, faceHeight = (maxY-minY)*height;
    if (faceWidth < 110 || faceHeight < 140) return blocked('small-face', '얼굴이 너무 작게 보여요. 얼굴 부분을 잘라내거나 더 가까이 찍은 사진을 선택해주세요.');
    if (minX < .008 || maxX > .992 || minY < .008 || maxY > .992) return blocked('cropped-face', '얼굴 일부가 사진 밖으로 잘려 있어요. 이마부터 턱까지 보이는 사진을 선택해주세요.');
    const left = {x:(points[33].x+points[133].x)/2,y:(points[33].y+points[133].y)/2};
    const right = {x:(points[263].x+points[362].x)/2,y:(points[263].y+points[362].y)/2};
    const dx = (right.x-left.x)*width, dy = (right.y-left.y)*height;
    const eyeDistance = Math.hypot(dx,dy);
    if (eyeDistance < 35) return blocked('uncertain', '양쪽 눈 위치를 정확히 확인하지 못했어요. 정면 사진을 선택해주세요.');
    const roll = Math.atan2(dy,dx);
    if (Math.abs(roll) > Math.PI/3) return blocked('rotation', '사진이 많이 돌아가 있어요. 사진을 바르게 회전한 뒤 다시 선택해주세요.');
    // Project the nose onto the eye axis so a moderate head tilt is still accepted.
    const nx = (points[1].x-left.x)*width, ny = (points[1].y-left.y)*height;
    const nosePosition = (nx*dx+ny*dy)/(eyeDistance*eyeDistance);
    if (nosePosition < .13 || nosePosition > .87 || eyeDistance/faceWidth < .27) return blocked('side-face', '얼굴이 옆으로 많이 돌아가 있어요. 양쪽 눈과 입이 보이는 정면 사진을 선택해주세요.');
    const chinX=(points[152].x-left.x)*width,chinY=(points[152].y-left.y)*height;
    const chinDepth=(-chinX*dy+chinY*dx)/eyeDistance;
    const noseDepth=(-nx*dy+ny*dx)/eyeDistance;
    if(chinDepth<=0 || noseDepth/chinDepth<.12 || noseDepth/chinDepth>.68) return blocked('vertical-angle','고개를 위아래로 많이 움직인 사진이에요. 눈높이에서 정면을 바라본 사진을 선택해주세요.');
    const a = available();
    const issues = [];
    const distance = (i,j) => Math.hypot((points[i].x-points[j].x)*width,(points[i].y-points[j].y)*height);
    if (distance(159,145)/distance(33,133) < .075 || distance(386,374)/distance(263,362) < .075) {
      a.eyes = false;
      issues.push('눈이 감겨 있거나 눈 위치가 불확실해 눈 화장은 꺼두었어요.');
    }
    const lipWidth = distance(61,291);
    if (lipWidth < 22 || lipWidth/faceWidth > .8 || points[13].y < Math.max(left.y,right.y)) {
      a.lip = false;
      issues.push('입술 위치가 불확실해 립스틱은 꺼두었어요.');
    }
    return {status:issues.length?'limited':'ready',code:issues.length?'partial':'ready',message:issues.join(' ') || '사진을 확인했어요. 메이크업을 선택해보세요.',available:a,roll};
  }
  const api = { inspect, OVAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FacePhotoQuality = api;
})(globalThis);
