// Structural catalogue audit. This deliberately cannot promote a record to
// checked: only an explicit, source-compared editorial entry can do that.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const catalogue=read('server/src/gym/catalog.json'),curation=read('scripts/reviewed-exercise-content.json'),media=read('client/src/features/gym/exercise-media.json').entries;
const core=[['squat','徒手深蹲'],['jumping_jack','开合跳'],['high_knees','高抬腿'],['push_up','俯卧撑']].map(([id,nameZh])=>({id:'motion:'+id,name:id,nameZh,equipment:'body weight',instructions:[]}));
const rows=[...core,...catalogue,{id:'movemate:reverse_lunge',name:'alternating reverse lunge',nameZh:'交替后撤弓步',equipment:'body weight',instructions:[]}];
const duplicates=new Map();for(const row of rows){const ids=duplicates.get(row.name)||[];ids.push(row.id);duplicates.set(row.name,ids);}
const output={},ledger=[];
for(const row of rows){
  if(output[row.id])throw Error('Duplicate source ID: '+row.id);
  const explicit=curation.entries[row.id];
  if(explicit){
    if(!explicit.form||!explicit.cues?.length||!explicit.reviewReason||explicit.instructions.length<3||explicit.instructions.length>5)throw Error('Incomplete reviewed content: '+row.id);
    if(explicit.reviewStatus==='checked'&&!media[row.id])throw Error('Checked content must have reviewed matching media: '+row.id);
    output[row.id]=explicit;
  }else{
    const issues=[];
    if(/\bv\.?\s*\d|version/i.test(row.name))issues.push('原文版本后缀尚缺可区分该变式的独立来源');
    if(duplicates.get(row.name).length>1)issues.push('同名 ID：'+duplicates.get(row.name).filter(id=>id!==row.id).join('、')+'；未确认是否等价，保留独立');
    if(/\(male\)|\(female\)/i.test(row.name))issues.push('来源带人物性别后缀，不能据此推断动作变式');
    if(/ball|bosu|lever|smith|sled|assisted|roller|machine/i.test(row.equipment))issues.push('需核对器械支点、固定垫和实际运动轨迹');
    if(/one arm|single|alternate|alternating|unilateral|one leg/i.test(row.name))issues.push('需核对单侧、交替或支撑侧，不能沿用双侧图');
    if(/stretch|hold|plank/i.test(row.name))issues.push('需核对静态保持与动态过程，不制作虚构重复动作图');
    issues.push('尚未逐项完成文字与图像的人工对照，不计入完整覆盖');
    // Pending entries retain source wording instead of inventing specific advice.
    output[row.id]={reviewStatus:'needs_review',reviewReason:issues.join('；')+'。',cues:[],form:''};
  }
  const record=output[row.id],m=media[row.id];
  ledger.push({id:row.id,originalName:row.name,status:record.reviewStatus,reason:record.reviewReason,text:{status:record.reviewStatus==='checked'?'source_compared':'source_only',source:row.id.startsWith('exdb:')?'exercises-dataset':'MoveMate original',revision:row.id.startsWith('exdb:')?'7455efae41b330c265e7cd4b78dfa848e7ce5ebd':'original',license:row.id.startsWith('exdb:')?'MIT':'项目原创文字',sourceRecordSha256:createHash('sha256').update(JSON.stringify(row)).digest('hex'),steps:(record.instructions||row.instructions).length},photo:!!m&&m.kind!=='illustration'&&!!m.images.length,illustration:m?.kind==='illustration',video:!!m?.video,complete:record.reviewStatus==='checked'&&!!m?.images.length,sources:m?.sources||[]});
}
for(const id of Object.keys(curation.entries))if(!output[id])throw Error('Unknown reviewed ID: '+id);
for(const id of Object.keys(media))if(!output[id])throw Error('Unknown media ID: '+id);
const generated={
  'server/src/gym/reviewed-content.json':JSON.stringify(output)+'\n',
  'docs/exercise-audit-ledger.json':JSON.stringify({version:1,reviewedAt:curation.reviewedAt,total:rows.length,entries:ledger},null,2)+'\n'
};
for(const [file,text]of Object.entries(generated)){
  if(process.argv.includes('--check')){if(readFileSync(resolve(root,file),'utf8')!==text)throw Error('Stale documentation audit: '+file);}
  else writeFileSync(resolve(root,file),text);
}
console.log(JSON.stringify({total:rows.length,complete:ledger.filter(r=>r.complete).length,photos:ledger.filter(r=>r.photo).length,illustrations:ledger.filter(r=>r.illustration).length,videos:ledger.filter(r=>r.video).length,pending:ledger.filter(r=>!r.complete).length}));
