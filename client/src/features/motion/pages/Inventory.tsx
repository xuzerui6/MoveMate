import {useMemo,useState} from 'react';
import {Header} from '../components/Header';
import {useStore} from '../lib/store';
import Dialog from '../../../components/Dialog';
import type {Rarity} from '../types';
const rarityLabel:Record<Rarity,string>={N:'普通',R:'稀有',SR:'超稀有',SSR:'典藏'},rank:Record<Rarity,number>={N:0,R:1,SR:2,SSR:3};
export function Inventory(){
 const {state,equip}=useStore(),[filter,setFilter]=useState<'all'|'owned'|'locked'>('all'),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const items=useMemo(()=>state.equipment.filter(e=>filter==='all'||(filter==='owned'?e.owned:!e.owned)).sort((a,b)=>rank[b.rarity]-rank[a.rarity]),[state.equipment,filter]),current=state.equipment.find(e=>e.id===selected);
 const wear=async()=>{if(!current?.owned||busy)return;setBusy(true);try{if(await equip(current.slot,current.id)){setNotice(current.name+'已装备并保存');setSelected(null);}}finally{setBusy(false);}};
 return <div className="page inventory-page"><Header title="装备背包"/><div className="inventory-tabs">{([['all','全部装备'],['owned','已获得'],['locked','未解锁']] as const).map(([value,label])=><button key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><div className="inventory-meta"><b>{items.length} 件物品</b><span>按稀有度排序</span></div>
 {notice&&<p role="status" className="avatar-save-notice">{notice}</p>}
 <div className="inventory-grid">{items.map(item=>{const equipped=Object.values(state.equipped).includes(item.id);return <button key={item.id} onClick={()=>setSelected(item.id)} className={(item.owned?'owned':'locked')+' rarity-'+item.rarity}><em>{item.rarity}</em><img className="pixel-art equipment-image" src={item.image} alt={item.name}/><b>{item.name}</b><small>{equipped?'已装备':item.owned?'已拥有':'未解锁'}</small></button>;})}</div>
 {!items.length&&<div className="history-empty">这个分类暂时没有装备。</div>}<div className="inventory-tip">持续训练，让动伴和你一起成长。<br/><span>装备解锁由真实运动记录决定，演示动作不计入。</span></div>
 {current&&<Dialog title={current.name} onClose={()=>{if(!busy)setSelected(null);}}><div className="equipment-dialog"><img className="pixel-art equipment-image big" src={current.image} alt={current.name}/><span className={'rarity-label rarity-'+current.rarity}>{current.rarity} · {rarityLabel[current.rarity]}</span><p>{current.owned?'这件装备已经属于你，可以保存到对应槽位。':'解锁条件：'+current.condition}</p><button className="btn btn--primary btn--block" disabled={!current.owned||busy} onClick={()=>void wear()}>{busy?'正在保存…':current.owned?'立即装备':'继续训练解锁'}</button></div></Dialog>}</div>;
}

