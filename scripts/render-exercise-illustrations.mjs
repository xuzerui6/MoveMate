// Reproducible original vector source. No external artwork or name-based pose selection.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'), config=JSON.parse(readFileSync(resolve(root,'scripts/exercise-illustrations.json'),'utf8'));
const dest=resolve(root,'assets/exercise-illustrations');mkdirSync(dest,{recursive:true});
const line=(points,color='#17251f',width=12)=>`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="white" stroke="#17251f" stroke-width="5"/>`;
for(const [id,row] of Object.entries(config.entries)){
  const sequence=row.phasePoseIndices||[0,1,0];
  if(sequence.length!==row.phases.length||sequence.length<3||!sequence.every(n=>Number.isInteger(n)&&n>=0&&n<row.poses.length))throw Error('Every named phase needs an explicit valid pose: '+id);
  for(let stage=0;stage<sequence.length;stage++){
    const n=sequence[stage],p=row.poses[n];let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 400 400"><title>${row.name} · ${row.phases[stage]}</title><rect width="400" height="400" fill="white"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#00ad58" stroke-width="2"/></marker></defs>`;
    for(const prop of row.props){
      if(typeof prop==='object'&&prop.type==='support')svg+=line(prop.vertices,'#94aa9e',prop.width||10);
      if(typeof prop==='object'&&prop.type==='rope'&&!prop.foreground)svg+=`<path d="${prop.paths[n]}" fill="none" stroke="#008b43" stroke-width="3" stroke-linecap="round"/>`;
      if(prop==='floor')svg+=line([[45,356],[375,356]],'#dce8e1',2);
      if(prop==='bench')svg+=line([[105,225],[348,225]],'#94aa9e',13)+line([[122,233],[122,348]],'#94aa9e',7)+line([[318,233],[318,348]],'#94aa9e',7);
      if(prop==='bar')svg+=line([[70,40],[240,40]],'#94aa9e',10);
      if(typeof prop==='object'&&prop.type==='ball')svg+=`<circle cx="${prop.x}" cy="${prop.y}" r="${prop.radius}" fill="#eaf6ee" stroke="#94aa9e" stroke-width="5"/>`;
      if(typeof prop==='object'&&prop.type==='bosu')svg+=`<path d="M${prop.x-prop.radius} ${prop.y} Q${prop.x-prop.radius} ${prop.y+prop.depth} ${prop.x} ${prop.y+prop.depth} Q${prop.x+prop.radius} ${prop.y+prop.depth} ${prop.x+prop.radius} ${prop.y}Z" fill="#eaf6ee" stroke="#94aa9e" stroke-width="5"/>`;
    }
    // Far limbs first, drawn lighter for depth; the near limbs remain dark.
    for(const limb of [p.legs[1],p.arms[1]])svg+=line(limb,'#9aa9a1',12);
    if(p.shoulders)svg+=line(p.shoulders,'#17251f',14);
    svg+=line([p.neck,p.hip],'#17251f',19);
    for(const limb of [p.legs[0],p.arms[0]])svg+=line(limb);
    svg+=line([p.head,p.neck],'#17251f',8)+circle(...p.head,20);
    // Explicit foreground loops keep a band around the thighs or feet visible;
    // each recipe still defines its actual route instead of inferring it by name.
    for(const prop of row.props)if(typeof prop==='object'&&prop.type==='rope'&&prop.foreground)svg+=`<path d="${prop.paths[n]}" fill="none" stroke="#008b43" stroke-width="3" stroke-linecap="round"/>`;
    for(const prop of row.props)if(typeof prop==='object'&&!['support','rope','bosu','ball'].includes(prop.type)){
      const [x,y]=prop.points[n];
      if(prop.type==='plate')svg+=`<ellipse cx="${x}" cy="${y}" rx="${prop.edgeOn?6:18}" ry="18" fill="#eaf6ee" stroke="#008b43" stroke-width="5"/><ellipse cx="${x}" cy="${y}" rx="${prop.edgeOn?2:5}" ry="5" fill="white" stroke="#008b43" stroke-width="2"/>`;
      if(prop.type==='kettlebell')svg+=`<ellipse cx="${x}" cy="${y+8}" rx="12" ry="13" fill="none" stroke="#008b43" stroke-width="5"/><circle cx="${x}" cy="${y+28}" r="18" fill="#eaf6ee" stroke="#008b43" stroke-width="5"/>`;
      if(prop.type==='barbell'){const span=prop.halfSpan||25;svg+=line([[x-span,y],[x+span,y]],'#008b43',6)+line([[x-span,y-10],[x-span,y+10]],'#008b43',9)+line([[x+span,y-10],[x+span,y+10]],'#008b43',9);}
      if(prop.type==='dumbbell'){
        const dx=prop.vertical?0:18,dy=prop.vertical?17:0;
        svg+=line([[x-dx,y-dy],[x+dx,y+dy]],'#008b43',6);
        for(const sign of [-1,1])svg+=prop.vertical?line([[x-10,y+dy*sign],[x+10,y+dy*sign]],'#008b43',11):line([[x+dx*sign,y-10],[x+dx*sign,y+10]],'#008b43',11);
      }
    }
    if(row.arrowPhases?row.arrowPhases.includes(stage):n!==0)for(const [x,y,x2,y2]of row.poseArrows?.[n]||row.arrows)svg+=`<path d="M${x} ${y}L${x2} ${y2}" fill="none" stroke="#00ad58" stroke-width="5" marker-end="url(#arrow)"/>`;
    svg+='</svg>\n';writeFileSync(resolve(dest,id.replace(':','-')+'-'+stage+'.svg'),svg);
  }
}
console.log('Original SVG sources:',Object.values(config.entries).reduce((n,row)=>n+row.phases.length,0));
