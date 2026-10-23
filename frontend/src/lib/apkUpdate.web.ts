import type { ReleaseNote } from './updates';

/** 网页版没有安装包更新（App 里才有，见 apkUpdate.ts） */
export type ApkInfo = { version: string; build: string; runtime: string; size: number; url: string; notes: ReleaseNote[] };
export type ApkPhase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
export type ApkState = { phase: ApkPhase; info: ApkInfo | null; received: number; total: number; speed: number; open: boolean; error: string | null };

const state: ApkState = { phase: 'idle', info: null, received: 0, total: 0, speed: 0, open: false, error: null };
export const useApkUpdate = () => state;
export const apkUpdateSupported = () => false;
export const checkApkUpdate = async (_manual = false) => false;
export const closeApkUpdate = () => {};
export const downloadApk = async () => {};
export const cancelApkDownload = () => {};
export const installApk = async () => false;
