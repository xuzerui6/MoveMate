/**
 * Axios 实例 —— 统一封装 JWT 注入 + 错误拦截 + Toast 提示
 */
import axios, { AxiosError } from 'axios';
import {clearAccountCache} from '../features/gym/offline';

const client = axios.create({
  baseURL: '/api/v1',
  timeout: Number(import.meta.env?.VITE_API_TIMEOUT_MS) || 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-MoveMate-Recognition-Version': '3',
  },
});

/* ---------- 请求拦截：自动注入 JWT Token ---------- */
client.interceptors.request.use(
  (config) => {
    // 从 localStorage 读取 token（Zustand store 可能尚未初始化）
    const token = localStorage.getItem('token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/* ---------- 响应拦截：统一错误处理 ---------- */
client.interceptors.response.use(
  (response) => {
    // 直接返回 data，减少调用处的 .data 嵌套
    return response.data;
  },
  (error: AxiosError<{ message?: string; error?: string }>) => {
    // 401 未登录 → 清除 token 并跳转登录页
    const sentToken=String(error.config?.headers.Authorization || '');
    const currentToken=localStorage.getItem('token');
    if (error.response?.status === 401 && currentToken && sentToken===`Bearer ${currentToken}`) {
      try{const uid=JSON.parse(localStorage.getItem('user')||'null')?.id;if(uid!=null)clearAccountCache(uid);}catch{}
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      for(const key of Object.keys(localStorage))if(key.startsWith('motion-buddy:account:'))localStorage.removeItem(key);
      // 如果不在登录页，跳转到登录页
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // 从响应中提取错误信息
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      '网络请求失败，请稍后重试';

    // 将格式化的错误信息挂载到 error 上，方便调用方使用
    (error as any).userMessage = message;

    return Promise.reject(error);
  }
);

export default client;

/** 从 API 错误中提取用户可读消息 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    return (error as any).userMessage || '网络请求失败';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '未知错误';
}
