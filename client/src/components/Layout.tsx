import { useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../features/motion/components/Icons';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';
import { useStore } from '../features/motion/lib/store';
const tabs = [{path:'/',label:'首页',icon:'home'},{path:'/train',label:'训练',icon:'dumbbell'},{path:'/groups',label:'组局',icon:'users'},{path:'/notifications',label:'通知',icon:'bell'},{path:'/profile',label:'我的',icon:'user'}];
export default function Layout(){
 const location=useLocation(),screen=useRef<HTMLElement>(null),count=useNotificationStore(s=>s.unreadCount),fetchCount=useNotificationStore(s=>s.fetchUnreadCount),user=useAuthStore(s=>s.user);
 const {error,refresh}=useStore();
 useEffect(()=>{const viewport=window.visualViewport;const resize=()=>{document.documentElement.style.setProperty('--viewport-height',(viewport?.height||window.innerHeight)+'px');const typing=document.activeElement?.matches('input,textarea');document.documentElement.classList.toggle('keyboard-open',Boolean(typing&&window.innerWidth<700&&viewport&&window.innerHeight-viewport.height>120));};viewport?.addEventListener('resize',resize);window.addEventListener('focusin',resize);window.addEventListener('focusout',resize);resize();return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('focusin',resize);window.removeEventListener('focusout',resize);document.documentElement.classList.remove('keyboard-open');document.documentElement.style.removeProperty('--viewport-height');};},[]);
 useEffect(()=>{screen.current?.scrollTo({top:0,behavior:'auto'});},[location.pathname]);
 useEffect(()=>{void fetchCount();const timer=setInterval(()=>void fetchCount(),30000);return()=>clearInterval(timer);},[fetchCount]);
 const active=(path:string)=>path==='/groups'?['/groups','/create','/game/'].some(p=>location.pathname.startsWith(p)):path==='/profile'?['/profile','/avatar','/inventory','/history','/leaderboard','/feedback','/admin'].some(p=>location.pathname.startsWith(p)):location.pathname===path;
 return <div className="app-shell"><aside className="app-sidebar">
 <NavLink to="/" className="app-brand" aria-label="动伴首页"><strong>动伴<span>·</span></strong><small>MOTION BUDDY</small></NavLink>
 <nav className="motion-nav" aria-label="主导航">{tabs.map(t=><NavLink key={t.path} to={t.path} className={active(t.path)?'active':''} aria-current={active(t.path)?'page':undefined}><Icon name={t.icon} size={25} weight={active(t.path)?'fill':'regular'}/><span>{t.label}</span>{t.path==='/notifications'&&count>0&&<em aria-label={count+'条未读通知'}>{count>99?'99+':count}</em>}</NavLink>)}</nav>
 <div className="sidebar-bottom"><p>每次运动，都算数。</p><NavLink to="/profile"><Icon name="user"/><span><b>{user?.nickname}</b><small>{user?.campus_name||'我的运动空间'}</small></span><Icon name="arrow" size={18}/></NavLink></div>
 </aside><main className="motion-screen" ref={screen} id="main-content" tabIndex={-1} data-route={location.pathname}>{location.pathname!=='/'&&<header className="product-top">{location.pathname.startsWith('/game/')||location.pathname==='/admin'?<NavLink to={location.pathname==='/admin'?'/profile':'/groups'} className="round-action" aria-label="返回"><Icon name="back"/></NavLink>:<NavLink to="/" className="wordmark">动伴<span>·</span></NavLink>}<NavLink to="/profile" className="round-action" aria-label="打开我的资料"><Icon name="user" size={26}/></NavLink></header>}{error&&<div className="motion-error" role="alert">运动数据：{error}<button onClick={()=>void refresh()}>重试</button></div>}<Outlet/></main></div>;
}

