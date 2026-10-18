/** 网页推送只在网页版里有；独立 App 用 push.ts 里的 Expo 推送 */
export type WebPushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';
export async function webPushState(): Promise<WebPushState> { return 'unsupported'; }
export async function enableWebPush(): Promise<WebPushState> { return 'unsupported'; }
export async function disableWebPush() {}
export async function testWebPush() { return { ok: false }; }
