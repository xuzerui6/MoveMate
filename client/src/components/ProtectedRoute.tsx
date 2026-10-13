/**
 * 登录校验路由守卫 —— 未登录重定向到 /login
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface Props {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const location = useLocation();

  // store 可能尚未初始化（页面刷新时），同时检查 localStorage
  const token = localStorage.getItem('token');
  const authenticated = isLoggedIn || !!token;

  if (!authenticated) {
    // 保存当前路径，登录后跳回
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
