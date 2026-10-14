import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 后端地址：优先用登录页里填写的，其次 EXPO_PUBLIC_API_URL。
 * 本地开发时手机和电脑在同一个 Wi-Fi，填电脑的局域网 IP，例如 http://192.168.1.6:8787
 */
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? (__DEV__ ? 'http://127.0.0.1:8787' : typeof window !== 'undefined' ? window.location.origin : '') : '');

let baseUrl = DEFAULT_URL;
let token: string | null = null;

const TOKEN_KEY = 'couple.token';
const URL_KEY = 'couple.serverUrl';

const secure = {
  get: (k: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

export async function loadCredentials() {
  baseUrl = Platform.OS === 'web' ? DEFAULT_URL : (await AsyncStorage.getItem(URL_KEY)) ?? DEFAULT_URL;
  token = await secure.get(TOKEN_KEY);
  return { baseUrl, token };
}

export async function saveCredentials(url: string, t: string) {
  baseUrl = url;
  token = t;
  await AsyncStorage.setItem(URL_KEY, url);
  await secure.set(TOKEN_KEY, t);
}

export async function clearToken() {
  token = null;
  await secure.del(TOKEN_KEY);
}

export const getBaseUrl = () => baseUrl;
export const getToken = () => token;
export const normalizeUrl = (u: string) => {
  let url = u.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//.test(url)) url = `http://${url}`;
  return url;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown, url = baseUrl): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('连不上服务器，检查一下网络或服务器地址', 0);
  }
  const text = await res.text();
  let data: { message?: string } | null = null;
  try { data = text ? JSON.parse(text) : null; } catch {
    throw new ApiError(res.status >= 500 ? '服务器暂时无法连接，请稍后重试' : '服务器响应异常，请检查网站配置', res.status);
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    throw new ApiError(data?.message ?? `请求失败 (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = { ok: boolean }>(path: string) => request<T>('DELETE', path),
  deletePushToken: (pushToken: string) => request('DELETE', '/api/push-token', { token: pushToken }),
  login: (url: string, email: string, password: string) => request<AuthResult>('POST', '/api/auth/login', { email, password }, url),
  authStatus: (url: string) => request<{ registrationOpen: boolean; users: number; maxUsers: number; mail: boolean }>('GET', '/api/auth/status', undefined, url),
  sendCode: (url: string, email: string, purpose: 'register' | 'reset') =>
    request<{ ok: boolean; resendAfter: number }>('POST', '/api/auth/send-code', { email, purpose }, url),
  register: (url: string, body: { email: string; code: string; password: string; name: string }) => request<AuthResult>('POST', '/api/auth/register', body, url),
  resetPassword: (url: string, body: { email: string; code: string; password: string }) => request<AuthResult>('POST', '/api/auth/reset', body, url),
};

type AuthResult = { token: string; user: import('./types').User };

/** 上传本地图片，返回服务器上的文件名 */
export async function uploadImages(uris: string[]): Promise<string[]> {
  if (!uris.length) return [];
  const form = new FormData();
  for (const [i, uri] of uris.entries()) {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('file', blob, `photo-${i}.jpg`);
    } else {
      form.append('file', { uri, name: `photo-${i}.jpg`, type: 'image/jpeg' } as unknown as Blob);
    }
  }
  const res = await fetch(`${baseUrl}/api/files`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? '图片上传失败', res.status);
  return data.files;
}

export const fileUrl = (name: string | null | undefined, thumb = false) =>
  name ? `${baseUrl}/files/${thumb ? 'thumb/' : ''}${name}` : undefined;

export const wsUrl = () => `${baseUrl.replace(/^http/, 'ws')}/api/ws?token=${encodeURIComponent(token ?? '')}`;
