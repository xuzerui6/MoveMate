import {useEffect,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from '../features/motion/components/Icons';
const openDialogs=new Set<HTMLDivElement>();
let rootWasInert=false;
export default function Dialog({title,onClose,children,dismissible=true}:{title:string;onClose:()=>void;children:React.ReactNode;dismissible?:boolean}){
 const id=useId(),panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=()=>{if(dismissible)onClose();};
 useEffect(()=>{const old=document.activeElement as HTMLElement|null,element=panel.current,root=document.getElementById('root');if(!element)return;
 if(!openDialogs.size)rootWasInert=root?.inert||false;openDialogs.add(element);if(root)root.inert=true;
 const nodes=()=>Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(x=>x.getClientRects().length);
 const top=()=>Array.from(openDialogs)[openDialogs.size-1]===element;
 const focus=()=>{if(top()&&!element.contains(document.activeElement))(nodes()[0]||element).focus();};focus();
 const key=(e:KeyboardEvent)=>{if(!top())return;if(e.key==='Escape'){e.preventDefault();close.current();}if(e.key==='Tab'){const list=nodes(),first=list[0],last=list[list.length-1];if(!list.length){e.preventDefault();element.focus();return;}if(!element.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first)?.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 document.addEventListener('keydown',key);document.addEventListener('focusin',focus);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);openDialogs.delete(element);if(root&&!openDialogs.size)root.inert=rootWasInert;if(old?.isConnected)old.focus();};},[]);
 return createPortal(<div className="ui-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close.current();}}><div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={panel}><header><h2 id={id}>{title}</h2><button aria-label="关闭弹窗" disabled={!dismissible} onClick={()=>close.current()}><Icon name="close"/></button></header>{children}</div></div>,document.body);
}

