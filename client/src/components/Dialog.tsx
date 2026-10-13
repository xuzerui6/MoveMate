import {useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from '../features/motion/components/Icons';
export default function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const id=useId(),panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const old=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLElement>('button,input,select,textarea,[tabindex="0"]')?.focus();
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'){const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);old?.focus();};},[]);
 return createPortal(<div className="ui-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={id} ref={panel}><header><h2 id={id}>{title}</h2><button aria-label="关闭弹窗" onClick={onClose}><Icon name="close"/></button></header>{children}</div></div>,document.body);
}

