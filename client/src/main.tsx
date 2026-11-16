/**
 * Vite 入口文件 —— 挂载 React 应用
 * 初始化：全局样式 + Auth Store 恢复登录态 + BrowserRouter
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/noto-sans-sc';
import './design-system.css';
import './training.css';
import './motion-layer.css';

// 挂载前恢复登录态（从 localStorage 读取 token + user）
import { useAuthStore } from './stores/authStore';
useAuthStore.getState().init();
void useAuthStore.getState().hydrateSession();
window.addEventListener('online', () => { void useAuthStore.getState().hydrateSession(); });
window.addEventListener('storage', event => {
  if (event.storageArea !== localStorage || (event.key !== null && !['token', 'user'].includes(event.key))) return;
  const previousToken = useAuthStore.getState().token;
  useAuthStore.getState().init();
  if (useAuthStore.getState().token && useAuthStore.getState().token !== previousToken) void useAuthStore.getState().hydrateSession();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Boot signal for the CDN-shell watchdog (injected into the production
// index.html by cloudflare/scripts/web.mjs): reaching this line means the
// entry module executed and the render was kicked off, so the shell —
// whichever host served it — did its job and the watchdog must stand down.
// Nothing reads the flag in other builds; it lives in shared code on
// purpose, so every shell variant behaves the same.
(window as unknown as { __MOVEMATE_BOOTED__?: boolean }).__MOVEMATE_BOOTED__ = true;

if(import.meta.env.PROD&&"serviceWorker" in navigator)window.addEventListener("load",()=>{void navigator.serviceWorker.register("/sw.js").catch(()=>{});});
