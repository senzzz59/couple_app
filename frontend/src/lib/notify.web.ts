import type { Anniversary, Capsule, Todo } from './types';

// Browser reminders are shown inside the app; closed-page push is not enabled yet.
export async function ensurePermission() { return false; }
export async function rescheduleAll(_anns: Anniversary[], _todos: Todo[], _startDate?: string | null, _capsules: Capsule[] = []) {}
export async function cancelReminders() {}
export async function notifyNow(_title: string, _body: string) {}
