import type { NudgeEvent } from './session';
export function subscribeNudgeNotifications(_receive: (event: NudgeEvent) => void) { return () => {}; }
