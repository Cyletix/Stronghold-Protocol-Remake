const fs=require('fs');
const D=JSON.parse(fs.readFileSync('D:/OneDrive/Project/卫戍协议私服/web/battle_data.json','utf8'));
const rt=D.level.routes[0];
let x=rt[0][1], y=rt[0][0], cp=1, moved=0;
for(let i=0;i<200 && cp<rt.length;i++){
  const t=rt[cp]; const dx=t[1]-x, dy=t[0]-y, d=Math.hypot(dx,dy), step=1.1*0.1;
  if(d<=step){cp++;x=t[1];y=t[0];} else {x+=dx/d*step;y+=dy/d*step;}
  moved++;
}
console.log('敌人走完路线需', moved, '帧，终点 cp=', cp, '/', rt.length, '最终位置=(', x.toFixed(1), ',', y.toFixed(1), ')');
console.log('干员数:', D.operators.length, '敌人种类:', Object.keys(D.enemies).length, '可部署格:', D.level.buildable.flat().filter(b=>b==='MELEE'||b==='ALL').length);