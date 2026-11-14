import {useEffect,useMemo,useState} from 'react';
import {LayeredAvatar} from '../components/LayeredAvatar';
import {Header} from '../components/Header';
import {Icon} from '../components/Icons';
import {useStore} from '../lib/store';
import {getOutfitAvatar,outfitLabels,outfitPresets,outfitRarities,outfitUnlockCopy} from '../lib/outfits';
import {
  AVATAR_PART_BY_ID, AVATAR_SLOT_LABELS, AVATAR_SLOT_ORDER, HAIR_HIDING_FACE_PARTS,
  decomposeOutfit, defaultCore, outfitLook, partName, partRarityName, partUnlockCopy, partsForSlot,
} from '../lib/avatarParts';
import {requiredXp} from '../lib/rewards';
import type {AvatarCustomCore,AvatarGender,AvatarLook,AvatarPartGroup,AvatarSkin,AvatarSlotKey,OutfitPreset,Slot} from '../types';
const slots:{key:Slot;label:string}[]=[{key:'head',label:'头部'},{key:'top',label:'上衣'},{key:'bottom',label:'下装'},{key:'shoes',label:'鞋子'},{key:'gloves',label:'手套'},{key:'prop',label:'道具'},{key:'badge',label:'勋章'},{key:'effect',label:'特效'}];
const skinOptions:{key:AvatarSkin;label:string}[]=[{key:'fair',label:'白皙'},{key:'natural',label:'自然'},{key:'wheat',label:'小麦'}];

export function Avatar({inventory}:{inventory:()=>void}){
 const {state,setAvatarGender,setAvatarLook,markOutfitsSeen}=useStore(),[tab,setTab]=useState('equip'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState('');
 const [slot,setSlot]=useState<AvatarSlotKey>('hair');
 const [lockNotice,setLockNotice]=useState(false);
 const [draft,setDraft]=useState<AvatarCustomCore|null>(null);
 const [presets,setPresets]=useState<Array<AvatarCustomCore|null>>(state.avatarLook.presets||[]);
 const needed=requiredXp(state.level);
 const real=state.history.filter(s=>s.source!=='demo'&&s.settled);
 const avg=real.length?Math.round(real.reduce((n,s)=>n+s.formScore,0)/real.length):0;
 const stats:Array<[string,number]>=[['力量',Math.min(100,Math.round(state.totalSquats/5))],['耐力',Math.min(100,state.completedWorkoutCount*5)],['爆发',Math.min(100,state.highScoreWorkoutCount*10)],['技巧',avg],['恢复',Math.min(100,Math.floor(real.reduce((n,s)=>n+s.zone3Seconds,0)/60)*2)]];
 useEffect(()=>{if(!state.newlyUnlockedOutfits.length)return;const timer=window.setTimeout(()=>void markOutfitsSeen(state.newlyUnlockedOutfits),1500);return()=>clearTimeout(timer);},[state.newlyUnlockedOutfits,markOutfitsSeen]);
 useEffect(()=>{setPresets(state.avatarLook.presets||[]);},[state.avatarLook.presets]);

 const savedLook=state.avatarLook;
 const seedCore=():AvatarCustomCore=>{
   // 本轮自由搭配只开侧身（A 组）：正面经典三套的身体轮廓各不相同，拆开混穿会露基底残边，
   // 先整套穿（资产线 STATUS 的备选口径，Edward 已拍板 A 组主线）。存量若有 B 组搭配，展示照常渲染。
   if(savedLook.mode==='custom'&&savedLook.custom&&savedLook.custom.group==='A')return savedLook.custom;
   const core=decomposeOutfit(state.activeOutfit);
   return core.group==='A'?core:defaultCore('A');
 };
 const ensureDraft=()=>draft??seedCore();
 const editing=draft!==null;
 const draftDirty=useMemo(()=>{
   if(!draft)return false;
   if(savedLook.mode!=='custom'||!savedLook.custom)return true;
   return JSON.stringify(draft)!==JSON.stringify(savedLook.custom);
 },[draft,savedLook]);
 const previewLook:AvatarLook=editing&&draft?{v:1,mode:'custom',custom:draft}:savedLook;
 const currentCore=draft??(savedLook.mode==='custom'&&savedLook.custom?savedLook.custom:seedCore());

 const wear=async(outfit:OutfitPreset)=>{
   if(busy||!state.unlockedOutfits[outfit])return;
   if(savedLook.mode==='outfit'&&savedLook.outfit===outfit&&!editing)return;
   setBusy(true);setPending(outfit);setNotice('');
   try{if(await setAvatarLook({...outfitLook(outfit),presets})){setDraft(null);setLockNotice(false);setNotice('已保存 · '+outfitLabels[outfit]);}}
   finally{setBusy(false);setPending('');}
 };
 const gender=async(value:AvatarGender)=>{if(busy||value===state.avatarGender)return;setBusy(true);try{if(await setAvatarGender(value))setLockNotice(false);setNotice('角色形象已保存');}finally{setBusy(false);}};
 const pickPart=(partId:string|null,lockedCopy?:string)=>{
   if(lockedCopy){setLockNotice(true);setNotice(lockedCopy);return;}
   const core=ensureDraft();
   // 脸型与眼睛是同一件事的两面：沉稳就是细眼层，选了细眼脸型自动跟上，反之亦然
   const face=slot==='eyes'?(partId==='eyes-calm'?'calm':'genki'):core.face;
   setDraft({...core,face,parts:{...core.parts,[slot]:partId}});
   setLockNotice(false);setNotice('');
 };
 const saveDraft=async()=>{
   if(busy||!draft)return;setBusy(true);setNotice('');
   try{if(await setAvatarLook({v:1,mode:'custom',custom:draft,presets}))setLockNotice(false);setNotice('形象已保存');}
   finally{setBusy(false);}
 };
 const storePreset=async(index:number)=>{
   if(busy)return;setBusy(true);setNotice('');
   const next=[...presets];next[index]=JSON.parse(JSON.stringify(currentCore));
   const base:AvatarLook=editing&&draft?{v:1,mode:'custom',custom:draft,presets:next}:{...savedLook,presets:next};
   try{if(await setAvatarLook(base)){setPresets(next);setLockNotice(false);setNotice('已存到搭配 '+(index+1));}}
   finally{setBusy(false);}
 };
 const clearPreset=async(index:number)=>{
   if(busy)return;setBusy(true);setNotice('');
   const next=[...presets];next[index]=null;
   try{if(await setAvatarLook({...savedLook,presets:next})){setPresets(next);setLockNotice(false);setNotice('已清空搭配 '+(index+1));}}
   finally{setBusy(false);}
 };
 const applyPreset=(index:number)=>{
   const core=presets[index];if(!core)return;
   setDraft(JSON.parse(JSON.stringify(core)));setLockNotice(false);setNotice('已套用搭配 '+(index+1)+'，点保存才会生效');
 };

 const group='A' as const;
 const slotParts=partsForSlot(slot,group);
 const hairHidden=currentCore.parts.face!==null&&HAIR_HIDING_FACE_PARTS.has(currentCore.parts.face);
 const thumbLook=(partId:string|null):AvatarLook=>({v:1,mode:'custom',custom:{...currentCore,parts:{...currentCore.parts,[slot]:partId}}});

 return <div className="page avatar-page"><Header title="我的形象"/>
 <div className="look-layout">
 <div className={'avatar-showcase'+(editing?' editing':'')}><div className="avatar-figure large"><LayeredAvatar look={previewLook} gender={state.avatarGender}/></div><b>{state.nickname}</b><div className="level-row"><span>Lv.{state.level}</span><div className="progress"><i style={{width:Math.min(100,state.xp/needed*100)+'%'}}/></div><small>{state.xp}/{needed} XP</small></div></div>
 <section className="avatar-customize"><div className="customize-heading"><span><small>当前造型</small><b>{savedLook.mode==='custom'?'我的自定义搭配':outfitLabels[state.activeOutfit]}</b></span><div className="gender-switch" aria-label="角色性别">{([['male','男'],['female','女']] as [AvatarGender,string][]).map(([value,label])=><button key={value} disabled={busy} aria-pressed={state.avatarGender===value} className={state.avatarGender===value?'active':''} onClick={()=>void gender(value)}>{label}</button>)}</div></div>
 <p className="outfit-description">整套造型一键换，也可以拆开自己搭：发型、眼睛、眼镜、面饰、上衣、裤子、鞋都能单独换。造型随训练成长解锁。</p>

 <h3 className="look-subtitle">整套造型</h3>
 <div className="outfit-list">{outfitPresets.map(outfit=>{const unlocked=state.unlockedOutfits[outfit],active=savedLook.mode==='outfit'&&savedLook.outfit===outfit&&!editing;return <article key={outfit} className={(active?'active ':'')+(!unlocked?'locked ':'')+'rarity-'+outfitRarities[outfit]}><img className="pixel-art" src={getOutfitAvatar(state.avatarGender,outfit,'front')} alt={outfitLabels[outfit]+'预览'}/><b>{outfitLabels[outfit]}</b><span>{partRarityName[outfitRarities[outfit]]}{!unlocked&&' · 未解锁'}</span><small>{active?'已穿戴':unlocked?'已解锁，可立即切换':outfitUnlockCopy[outfit]}</small><button disabled={busy||!unlocked||active} onClick={()=>void wear(outfit)}>{pending===outfit?'正在保存…':active?'已穿戴':unlocked?'使用这个造型':'继续训练解锁'}</button></article>;})}</div>

 <p className="outfit-description">樱花、企鹅、落日是正面经典造型，先整套穿；拆开自由搭还在打磨中，很快就来。</p>

 <h3 className="look-subtitle">我存的搭配</h3>
 <div className="preset-slots">{[0,1,2].map(index=>{const core=presets[index];return <div key={index} className="preset-slot">{core?<div className="avatar-figure small preset-thumb"><LayeredAvatar look={{v:1,mode:'custom',custom:core}} gender={state.avatarGender}/></div>:<div className="preset-empty">空</div>}<b>搭配 {index+1}</b><div className="preset-actions">{core&&<button disabled={busy} onClick={()=>applyPreset(index)}>套用</button>}<button disabled={busy} onClick={()=>void storePreset(index)}>存当前搭配</button>{core&&<button disabled={busy} onClick={()=>void clearPreset(index)}>清空</button>}</div></div>;})}</div>

 <h3 className="look-subtitle">自己搭</h3>
 <div className="look-base-row">
   <div className="look-base-group"><span>脸型</span><div className="gender-switch" aria-label="脸型">{([['genki','元气'],['calm','沉稳']] as const).map(([value,label])=><button key={value} disabled={busy} aria-pressed={currentCore.face===value} className={currentCore.face===value?'active':''} onClick={()=>{const core=ensureDraft();const eyes=value==='calm'?'eyes-calm':(core.parts.eyes==='eyes-calm'?'eyes-green':core.parts.eyes);setDraft({...core,face:value,parts:{...core.parts,eyes}});}}>{label}</button>)}</div></div>
   <div className="look-base-group"><span>肤色</span><div className="gender-switch" aria-label="肤色">{skinOptions.map(({key,label})=>{const value=key as AvatarSkin;return <button key={value} disabled={busy} aria-pressed={currentCore.skin===value} className={currentCore.skin===value?'active':''} onClick={()=>{const core=ensureDraft();setDraft({...core,skin:value});}}>{label}</button>;})}</div></div>
 </div>
 <div className="slot-tabs" role="tablist" aria-label="换装部位">{AVATAR_SLOT_ORDER.map(key=><button key={key} role="tab" aria-selected={slot===key} className={slot===key?'active':''} onClick={()=>setSlot(key)}>{AVATAR_SLOT_LABELS[key]}</button>)}</div>
 <div className="part-grid">
   {(slot==='glasses'||slot==='face')&&<button className={'part-card'+(currentCore.parts[slot]===null?' active':'')} onClick={()=>pickPart(null)}><span className="part-thumb part-none">{slot==='glasses'?'不戴眼镜':'无面饰'}</span><b>{slot==='glasses'?'不戴眼镜':'无面饰'}</b><small>日常</small></button>}
   {slotParts.map(part=>{
     const unlocked=Boolean(state.unlockedParts[part.id]);
     const active=currentCore.parts[slot]===part.id;
     return <button key={part.id} className={'part-card rarity-border-'+part.rarity+(active?' active':'')+(!unlocked?' locked':'')} onClick={()=>pickPart(part.id,unlocked?undefined:partUnlockCopy[part.rarity])}>
       <span className="part-thumb"><LayeredAvatar look={thumbLook(part.id)} gender={state.avatarGender}/></span>
       <b>{partName(part,state.avatarGender)}</b>
       <small>{partRarityName[part.rarity]}{!unlocked&&' · 未解锁'}</small>
       {!unlocked&&<span className="part-lock"><Icon name="lock" size={16}/></span>}
     </button>;
   })}
 </div>
 {slot==='hair'&&hairHidden&&<p className="outfit-description">现在戴着兜帽或头巾，发型先藏起来了，摘下就能看到。</p>}
 <div className="look-save-bar"><button className="primary" disabled={busy||!draftDirty} onClick={()=>void saveDraft()}>{busy?'正在保存…':draftDirty?'保存形象':'已是最新形象'}</button>{editing&&<button className="secondary" disabled={busy} onClick={()=>setDraft(null)}>放弃修改</button>}</div>
 {notice&&<p className="avatar-save-notice" role="status"><Icon name={lockNotice?'lock':'check'} size={18}/>{notice}</p>}</section>
 </div>
 <div className="segmented"><button aria-pressed={tab==='equip'} className={tab==='equip'?'active':''} onClick={()=>setTab('equip')}>装备</button><button aria-pressed={tab==='stats'} className={tab==='stats'?'active':''} onClick={()=>setTab('stats')}>属性</button></div>
 {tab==='equip'?<><div className="slot-grid">{slots.map(slotItem=>{const item=state.equipment.find(e=>e.id===state.equipped[slotItem.key]);return <button key={slotItem.key} onClick={inventory} className={item?'filled':''}>{item?<img className="pixel-art slot-image" src={item.image} alt={item.name}/>:<Icon name="bag"/>}<b>{slotItem.label}</b><small>{item?.name||'未装备'}</small></button>;})}</div><p className="outfit-description">完整造型与背包装备分别保存，独立装备展示在槽位中。</p><button className="primary inventory-cta" onClick={inventory}><Icon name="bag"/>打开装备背包</button></>:<div className="stats-list">{stats.map(([name,value])=><div key={name}><span>{name}</span><div className="progress"><i style={{width:value+'%'}}/></div><b>{value}</b></div>)}<p className="outfit-description">属性根据已结算的真实训练展示，演示动作不参与成长。</p></div>}</div>;
}
