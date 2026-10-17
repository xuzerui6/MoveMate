/**
 * 认证状态管理 —— 用户登录、注册、登出、Token 持久化
 */
import { create } from 'zustand';
import {clearAccountCache} from '../features/gym/offline';
import { isAxiosError } from 'axios';
import type { User, LoginData, RegisterData } from '../types';
import * as authApi from '../api/auth';
import { getErrorMessage } from '../api/client';
import { readStoredSession } from '../services/stored-session';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;

  /** 初始化：从 localStorage 恢复登录态 */
  init: () => void;

  /** 持久化当前登录态 */
  setSession: (user: User | null, token?: string | null) => void;

  /** 使用 token 从服务端恢复用户信息 */
  hydrateSession: () => Promise<void>;

  /** 邮箱登录 */
  login: (data: LoginData) => Promise<void>;

  /** 邮箱注册 */
  register: (data: RegisterData) => Promise<void>;

  /** 退出登录 */
  logout: () => void;
  verifyEmail: (code: string) => Promise<void>;

  /** 更新用户资料（本地 + 远端） */
  updateProfile: (data: { nickname?: string; avatar?: string; department?: string; campus_id?: number; qq_email?: string; sport_preferences?: string[] }) => Promise<void>;

  /** 清除错误信息 */
  clearError: () => void;
}

function persistSession(user: User | null, token: string | null) {
  if (token && user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    return;
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  init: () => {
    const session = readStoredSession(localStorage.getItem('token'), localStorage.getItem('user'));
    set({ token: session?.token || null, user: session ? authApi.normalizeUser(session.user) : null, isLoggedIn: !!session, loading: false, error: null });
  },

  setSession: (user, token = get().token) => {
    const old=get().user?.id;if(old!=null&&old!==user?.id)clearAccountCache(old);
    const nextToken = user ? (token ?? null) : null;
    persistSession(user, nextToken);
    set({
      user,
      token: nextToken,
      isLoggedIn: Boolean(user && nextToken),
      loading: false,
      error: null,
    });
  },

  hydrateSession: async () => {
    const token = get().token || localStorage.getItem('token');
    if (!token) return;
    set({ loading: true });
    try {
      const user = await authApi.getMe();
      if (get().token === token) get().setSession(user, token);
    } catch (err) {
      if (get().token !== token) return;
      if (isAxiosError(err) && err.response?.status === 401) get().logout();
      else set({ error: getErrorMessage(err) });
    } finally {
      if (get().token === token) set({ loading: false });
    }
  },

  login: async (data: LoginData) => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.login(data);
      const { user, token } = res;
      get().setSession(user, token);
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: getErrorMessage(err) });
      throw err;
    }
  },

  register: async (data: RegisterData) => {
    set({ loading: true, error: null });
    try {
      const res = await authApi.register(data);
      const { user, token } = res;
      get().setSession(user, token);
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: getErrorMessage(err) });
      throw err;
    }
  },

  logout: () => {
    const uid=get().user?.id;if(uid!=null)clearAccountCache(uid);
    persistSession(null, null);
    set({ user: null, token: null, isLoggedIn: false, loading: false, error: null });
  },

  verifyEmail: async (code) => {
    const session = await authApi.verifyStudentCode(code);
    get().setSession(session.user, session.token);
  },

  updateProfile: async (data) => {
    const token = get().token;
    const updated = await authApi.updateProfile(data);
    if (get().token !== token) return;
    const newUser = { ...get().user!, ...updated };
    get().setSession(newUser);
    window.dispatchEvent(new Event('motion:refresh'));
  },

  clearError: () => set({ error: null }),
}));
