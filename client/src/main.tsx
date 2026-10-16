/**
 * Vite 入口文件 —— 挂载 React 应用
 * 初始化：全局样式 + Auth Store 恢复登录态 + BrowserRouter
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource-variable/noto-sans-sc';
import './foundation.css';
import './design-system.css';

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
