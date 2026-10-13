import {Icon} from './Icons';
export function Header({title,back,action}:{title:string;back?:()=>void;action?:React.ReactNode}){return <header className="page-header">{back&&<button className="icon-btn" aria-label="返回" onClick={back}><Icon name="back"/></button>}<strong>{title}</strong><div className="header-action">{action}</div></header>;}

