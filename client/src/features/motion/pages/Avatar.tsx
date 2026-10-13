import {useEffect,useState} from 'react';
import {AvatarFigure} from '../components/AvatarFigure';
import {Header} from '../components/Header';
import {Icon} from '../components/Icons';
import {useStore} from '../lib/store';
import {getOutfitAvatar,outfitLabels,outfitPresets,outfitRarities,outfitUnlockCopy} from '../lib/outfits';
import {requiredXp} from '../lib/rewards';
import type {AvatarGender,OutfitPreset,Slot} from '../types';
const slots:{key:Slot;label:string}[]=[{key:'head',label:'头部'},{key:'top',label:'上衣'},{key:'bottom',label:'下装'},{key:'shoes',label:'鞋子'},{key:'gloves',label:'手套'},{key:'prop',label:'道具'},{key:'badge',label:'勋章'},{key:'effect',label:'特效'}];
export function Avatar({inventory}:{inventory:()=>void}){
 const {state,setAvatarGender,setActiveOutfit,markOutfitsSeen}=useStore(),[tab,setTab]=useState('equip'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState('');
 const needed=requiredXp(state.level);
 const real=state.history.filter(s=>s.source!=='demo'&&s.settled);
 const avg=real.length?Math.round(real.reduce((n,s)=>n+s.formScore,0)/real.length):0;
 const stats:Array<[string,number]>=[['力量',Math.min(100,Math.round(state.totalSquats/5))],['耐力',Math.min(100,state.completedWorkoutCount*5)],['爆发',Math.min(100,state.highScoreWorkoutCount*10)],['技巧',avg],['恢复',Math.min(100,Math.floor(real.reduce((n,s)=>n+s.zone3Seconds,0)/60)*2)]];
 useEffect(()=>{if(!state.newlyUnlockedOutfits.length)return;const timer=window.setTimeout(()=>void markOutfitsSeen(state.newlyUnlockedOutfits),1500);return()=>clearTimeout(timer);},[state.newlyUnlockedOutfits,markOutfitsSeen]);
 const wear=async(outfit:OutfitPreset)=>{if(busy||!state.unlockedOutfits[outfit]||state.activeOutfit===outfit)return;setBusy(true);setPending(outfit);setNotice('');try{if(await setActiveOutfit(outfit))setNotice('已保存 · '+outfitLabels[outfit]);}finally{setBusy(false);setPending('');}};
 const gender=async(value:AvatarGender)=>{if(busy||value===state.avatarGender)return;setBusy(true);try{if(await setAvatarGender(value))setNotice('角色形象已保存');}finally{setBusy(false);}};
 return <div className="page avatar-page"><Header title="我的形象"/>
 <div className="avatar-showcase"><AvatarFigure view="front"/><b>{state.nickname}</b><div className="level-row"><span>Lv.{state.level}</span><div className="progress"><i style={{width:Math.min(100,state.xp/needed*100)+'%'}}/></div><small>{state.xp}/{needed} XP</small></div></div>
 <section className="avatar-customize"><div className="customize-heading"><span><small>当前造型</small><b>{outfitLabels[state.activeOutfit]}</b></span><div className="gender-switch" aria-label="角色性别">{([['male','男'],['female','女']] as [AvatarGender,string][]).map(([value,label])=><button key={value} disabled={busy} aria-pressed={state.avatarGender===value} className={state.avatarGender===value?'active':''} onClick={()=>void gender(value)}>{label}</button>)}</div></div>
 <p className="outfit-description">选择适合你的运动风格，造型随训练成长解锁。</p>
 <div className="outfit-list">{outfitPresets.map(outfit=>{const unlocked=state.unlockedOutfits[outfit],active=state.activeOutfit===outfit;return <article key={outfit} className={(active?'active ':'')+(!unlocked?'locked ':'')+'rarity-'+outfitRarities[outfit]}><img className="pixel-art" src={getOutfitAvatar(state.avatarGender,outfit,'front')} alt={outfitLabels[outfit]+'预览'}/><b>{outfitLabels[outfit]}</b><span>{outfitRarities[outfit]}{!unlocked&&' · 未解锁'}</span><small>{active?'已穿戴':unlocked?'已解锁，可立即切换':outfitUnlockCopy[outfit]}</small><button disabled={busy||!unlocked||active} onClick={()=>void wear(outfit)}>{pending===outfit?'正在保存…':active?'已穿戴':unlocked?'使用这个造型':'继续训练解锁'}</button></article>;})}</div>
 {notice&&<p className="avatar-save-notice" role="status"><Icon name="check" size={18}/>{notice}</p>}</section>
 <div className="segmented"><button aria-pressed={tab==='equip'} className={tab==='equip'?'active':''} onClick={()=>setTab('equip')}>装备</button><button aria-pressed={tab==='stats'} className={tab==='stats'?'active':''} onClick={()=>setTab('stats')}>属性</button></div>
 {tab==='equip'?<><div className="slot-grid">{slots.map(slot=>{const item=state.equipment.find(e=>e.id===state.equipped[slot.key]);return <button key={slot.key} onClick={inventory} className={item?'filled':''}>{item?<img className="pixel-art slot-image" src={item.image} alt={item.name}/>:<Icon name="bag"/>}<b>{slot.label}</b><small>{item?.name||'未装备'}</small></button>;})}</div><p className="outfit-description">完整造型与背包装备分别保存，独立装备展示在槽位中。</p><button className="primary inventory-cta" onClick={inventory}><Icon name="bag"/>打开装备背包</button></>:<div className="stats-list">{stats.map(([name,value])=><div key={name}><span>{name}</span><div className="progress"><i style={{width:value+'%'}}/></div><b>{value}</b></div>)}<p className="outfit-description">属性根据已结算的真实训练展示，演示动作不参与成长。</p></div>}</div>;
}

