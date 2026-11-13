import { useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../features/motion/components/Icons';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';
import { useStore } from '../features/motion/lib/store';
// 全局动效层 S1：底部导航的五个栏目根路径；栏目间切换用横滑，其余路由切换用淡入上浮，
// 摄像头训练页（/train/workout/*）只淡入不位移，避免干扰画面内的定位元素。
const TAB_ROOTS = ['/', '/train', '/groups', '/notifications', '/profile'];
const tabs = [{path:'/',label:'首页',icon:'home'},{path:'/train',label:'训练',icon:'dumbbell'},{path:'/groups',label:'组局',icon:'users'},{path:'/notifications',label:'通知',icon:'bell'},{path:'/profile',label:'我的',icon:'user'}];
export default function Layout(){
 const location=useLocation(),screen=useRef<HTMLElement>(null),count=useNotificationStore(s=>s.unreadCount),fetchCount=useNotificationStore(s=>s.fetchUnreadCount),user=useAuthStore(s=>s.user);
 const {error,refresh,loading}=useStore();
 const sessionError=useAuthStore(s=>s.error),sessionLoading=useAuthStore(s=>s.loading),verifySession=useAuthStore(s=>s.hydrateSession);
 // data-enter 供 motion-layer.css 选择入场动画。渲染期记录「到达本页的转场类型」并保持到
 // 下一次导航：同一路径的后续重渲染复用同一类型，属性不会在动画途中被摘掉。
 const navAnim=useRef<{path:string;kind:''|'page'|'fade'|'tab-next'|'tab-prev'}>({path:'',kind:''});
 if(navAnim.current.path!==location.pathname){
  const prev=navAnim.current.path,prevTab=TAB_ROOTS.indexOf(prev),nextTab=TAB_ROOTS.indexOf(location.pathname);
  navAnim.current={path:location.pathname,kind:!prev?'':prevTab>=0&&nextTab>=0?(nextTab>prevTab?'tab-next':nextTab<prevTab?'tab-prev':'page'):location.pathname.startsWith('/train/workout/')?'fade':'page'};
 }
 const enterKind=navAnim.current.kind;
 useEffect(()=>{const viewport=window.visualViewport;const resize=()=>{document.documentElement.style.setProperty('--viewport-height',(viewport?.height||window.innerHeight)+'px');const typing=document.activeElement?.matches('input,textarea');document.documentElement.classList.toggle('keyboard-open',Boolean(typing&&window.innerWidth<700&&viewport&&window.innerHeight-viewport.height>120));};viewport?.addEventListener('resize',resize);window.addEventListener('focusin',resize);window.addEventListener('focusout',resize);resize();return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('focusin',resize);window.removeEventListener('focusout',resize);document.documentElement.classList.remove('keyboard-open');document.documentElement.style.removeProperty('--viewport-height');};},[]);
 useEffect(()=>{screen.current?.scrollTo({top:0,behavior:'auto'});},[location.pathname]);
 useEffect(()=>{void fetchCount();const timer=setInterval(()=>void fetchCount(),30000);return()=>clearInterval(timer);},[fetchCount]);
 useEffect(()=>{const raw=sessionError||error;if(raw)console.error('[Layout] 数据读取问题（原始信息仅记日志）:',raw);},[sessionError,error]);
 const active=(path:string)=>path==='/groups'?['/groups','/create','/game/','/friends','/invite/'].some(p=>location.pathname.startsWith(p)):path==='/profile'?['/profile','/avatar','/inventory','/history','/leaderboard','/feedback','/admin'].some(p=>location.pathname.startsWith(p)):path==='/train'?location.pathname.startsWith('/train'):location.pathname===path;
 return <div className="app-shell"><aside className="app-sidebar">
 <NavLink to="/" className="app-brand" aria-label="动伴首页"><strong>动伴<span>·</span></strong><small>MOTION BUDDY</small></NavLink>
 <nav className="motion-nav" aria-label="主导航">{tabs.map(t=><NavLink key={t.path} to={t.path} className={active(t.path)?'active':''} aria-current={active(t.path)?'page':undefined}><Icon name={t.icon} size={25} weight={active(t.path)?'fill':'regular'}/><span>{t.label}</span>{t.path==='/notifications'&&count>0&&<em aria-label={count+'条未读通知'}>{count>99?'99+':count}</em>}</NavLink>)}</nav>
 <div className="sidebar-bottom"><p>每次运动，都算数。</p><NavLink to="/profile"><Icon name="user"/><span><b>{user?.nickname}</b><small>{user?.campus_name||'我的运动空间'}</small></span><Icon name="arrow" size={18}/></NavLink></div>
 </aside><main className="motion-screen" ref={screen} id="main-content" tabIndex={-1} data-route={location.pathname} data-enter={enterKind||undefined}>{location.pathname!=='/'&&<header className="product-top">{location.pathname.startsWith('/game/')||location.pathname==='/admin'?<NavLink to={location.pathname==='/admin'?'/profile':'/groups'} className="round-action" aria-label="返回"><Icon name="back"/></NavLink>:<NavLink to="/" className="wordmark">动伴<span>·</span></NavLink>}<NavLink to="/profile" className="round-action" aria-label="打开我的资料"><Icon name="user" size={26}/></NavLink></header>}{(sessionError||error)&&<div className="inline-error" role="alert"><p>{sessionError?'暂时无法验证登录状态，检查一下网络再试试':'运动数据暂未更新，检查一下网络再试试'}</p><button className="btn btn--secondary" disabled={loading||sessionLoading} onClick={()=>void (sessionError?Promise.all([verifySession(),refresh()]):refresh())}>{loading||sessionLoading?'正在重试…':'重试连接'}</button></div>}<Outlet/></main></div>;
}

