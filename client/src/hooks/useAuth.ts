/**
 * 认证 Hook —— 封装登录/注册/登出逻辑 + Toast 反馈
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import type { LoginData, RegisterData } from '../types';

/** 简易 Toast 工具函数（避免引入额外依赖） */
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  // 移除旧 toast
  const existing = document.querySelector('.toast-container');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const container = document.createElement('div');
  container.className = 'toast-container';
  // textContent 拼接，避免 innerHTML 被消息内容注入（XSS 纵深防御）
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  document.body.appendChild(container);

  toastTimer = setTimeout(() => {
    container.remove();
  }, 2500);
}

export { showToast };

export function useAuth() {
  const navigate = useNavigate();
  const { login: storeLogin, register: storeRegister, logout: storeLogout, loading, clearError } =
    useAuthStore();

  const handleLogin = useCallback(
    async (data: LoginData) => {
      try {
        await storeLogin(data);
        showToast('登录成功', 'success');
        navigate('/', { replace: true });
      } catch (err: any) {
        showToast(err?.userMessage || '登录失败', 'error');
      }
    },
    [storeLogin, navigate]
  );

  const handleRegister = useCallback(
    async (data: RegisterData) => {
      try {
        await storeRegister(data);
        showToast('注册成功', 'success');
        navigate('/', { replace: true });
      } catch (err: any) {
        showToast(err?.userMessage || '注册失败', 'error');
      }
    },
    [storeRegister, navigate]
  );

  const handleLogout = useCallback(() => {
    storeLogout();
    showToast('已退出登录', 'info');
    navigate('/login', { replace: true });
  }, [storeLogout, navigate]);

  const storeError = useAuthStore((s) => s.error);

  return {
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    loading,
    error: storeError,
    clearError,
    showToast,
  };
}
