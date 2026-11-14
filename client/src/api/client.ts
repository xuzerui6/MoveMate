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
    'X-MoveMate-Recognition-Version': '6',
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

    // 错误信息统一翻译成大白话（见 toUserMessage）：绝不把 axios 的原始
    // 英文报错（如 "timeout of 10000ms exceeded"）直接展示给用户。
    const message = toUserMessage(error);

    // 将格式化的错误信息挂载到 error 上，方便调用方使用
    (error as any).userMessage = message;

    return Promise.reject(error);
  }
);

export default client;

/**
 * 把任意请求错误翻译成用户能看懂的话。
 * 优先级：服务端给的提示（本身就是大白话）> 超时 > 断网 > 通用兜底。
 * 原始报错文本（axios 英文串、浏览器 TypeError 等）永远不透传给用户。
 */
export function toUserMessage(error: unknown): string {
  const axiosErr = error as AxiosError<{ message?: string; error?: string }> | undefined;
  const serverMessage = axiosErr?.response?.data?.message || axiosErr?.response?.data?.error;
  if (serverMessage) return serverMessage;
  const code = (error as { code?: string } | undefined)?.code;
  const raw = error instanceof Error ? error.message : '';
  if (code === 'ECONNABORTED' || /timeout/i.test(raw)) {
    return '网络有点慢，请稍后再试';
  }
  if (
    code === 'ERR_NETWORK' ||
    (axiosErr && !axiosErr.response && !!axiosErr.request) ||
    /network error|failed to fetch/i.test(raw)
  ) {
    return '网络连接不稳定，请检查网络后再试';
  }
  return '网络请求失败，请稍后重试';
}

/** 从 API 错误中提取用户可读消息 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    return (error as any).userMessage || toUserMessage(error);
  }
  if (error instanceof Error) {
    // 本地主动抛出的中文提示（如「账号已切换，请重新进入训练」）可以直接展示；
    // 英文/技术文本一律走翻译，避免把原始报错甩给用户。
    if (/[一-鿿]/.test(error.message) && !/timeout|network/i.test(error.message)) {
      return error.message;
    }
    return toUserMessage(error);
  }
  return '出了点问题，请稍后再试';
}
