const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect,OVAL}=require('../face-quality.js');
function face(){
 const p=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
 OVAL.forEach((index,i)=>{const t=i/OVAL.length*Math.PI*2;p[index]={x:.5+.22*Math.sin(t),y:.47-.3*Math.cos(t),z:0};});
 for(const [i,x,y] of [[1,.5,.51],[33,.39,.4],[133,.46,.4],[263,.61,.4],[362,.54,.4],[159,.42,.386],[145,.42,.414],[386,.58,.386],[374,.58,.414],[61,.43,.63],[291,.57,.63],[13,.5,.62],[14,.5,.64]])p[i]={x,y,z:0};
 return p;
}
const inspectFace=p=>inspect({faceLandmarks:[p]},1000,1000);
test('front-facing portrait is accepted',()=>assert.equal(inspectFace(face()).status,'ready'));
test('no face blocks every makeup area',()=>{const r=inspect({faceLandmarks:[]},1000,1000);assert.equal(r.code,'no-face');assert(Object.values(r.available).every(x=>!x));});
test('multiple people are not silently reduced to the first person',()=>assert.equal(inspect({faceLandmarks:[face(),face()]},1000,1000).code,'multiple-faces'));
test('a face too small for reliable eye and lip placement is blocked',()=>assert.equal(inspectFace(face().map(p=>({...p,x:.5+(p.x-.5)*.1,y:.5+(p.y-.5)*.1}))).code,'small-face'));
test('a cropped forehead blocks makeup',()=>{const p=face();p[10].y=0;assert.equal(inspectFace(p).code,'cropped-face');});
test('sideways nose position blocks the face instead of using front-face masks',()=>{const p=face();p[1].x=.67;assert.equal(inspectFace(p).code,'side-face');});
test('a steep up/down head angle is blocked',()=>{const p=face();p[1].y=.415;assert.equal(inspectFace(p).code,'vertical-angle');});
test('a modest head tilt remains usable',()=>{const angle=Math.PI/12;const p=face().map(p=>({...p,x:.5+(p.x-.5)*Math.cos(angle)-(p.y-.5)*Math.sin(angle),y:.5+(p.x-.5)*Math.sin(angle)+(p.y-.5)*Math.cos(angle)}));assert.equal(inspectFace(p).status,'ready');});
test('closed eye geometry restricts eyes while keeping lips and skin',()=>{const p=face();p[159].y=p[145].y;const r=inspectFace(p);assert.equal(r.status,'limited');assert.equal(r.available.eyes,false);assert.equal(r.available.lip,true);assert.equal(r.available.foundation,true);});
test('uncertain lip geometry restricts lipstick independently',()=>{const p=face();p[61].x=.499;p[291].x=.501;const r=inspectFace(p);assert.equal(r.available.lip,false);assert.equal(r.available.eyes,true);});
test('invalid coordinates never reach the renderer',()=>{const p=face();p[1].x=NaN;assert.equal(inspectFace(p).code,'uncertain');});
