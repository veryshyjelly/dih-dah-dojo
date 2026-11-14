import type { BlockUpload, InputProfile, User } from './types';
export const API = (import.meta.env.VITE_API_ORIGIN || 'https://dojoapi.veryshyjelly.in').replace(
  /\/$/,
  '',
);
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(10000),
  });
  const body = await response
    .json()
    .catch(() => ({ error: 'The account service did not respond.' }));
  if (!response.ok)
    throw new ApiError(
      body.error || body.message || 'The request could not be completed.',
      response.status,
    );
  return body as T;
}
export const toBase64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
export const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export const getSession = () =>
  request<{
    user: User | null;
    providers: { google: boolean; github: boolean };
  }>('/api/session');
export const getProfile = (profile: InputProfile) =>
  request<{
    epoch: string;
    state: string;
    revision: number;
    records: string[];
  }>(`/api/profile/${profile}`);
export const updateProfile = (
  profile: InputProfile,
  action: string,
  values: Record<string, unknown>,
  revision: number,
  epoch: string,
) =>
  request<{ state: string; revision: number }>(`/api/profile/${profile}`, {
    method: 'POST',
    body: JSON.stringify({ action, ...values, baseRevision: revision, epoch }),
  });
export const uploadBlock = (block: BlockUpload) =>
  request<{
    state: string;
    revision: number;
    summary: unknown;
    conflict: boolean;
  }>('/api/blocks', {
    method: 'POST',
    body: JSON.stringify({ ...block, packet: toBase64(block.packet) }),
  });
export async function signIn(provider: 'google' | 'github') {
  const result = await request<{ url: string }>('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider,
      callbackURL: location.origin + '/?welcome=1',
      errorCallbackURL: location.origin + '/?authError=1',
    }),
  });
  if (!result.url) throw new Error('The sign-in provider is not configured.');
  location.assign(result.url);
}
export const signOut = () => request('/api/auth/sign-out', { method: 'POST', body: '{}' });
