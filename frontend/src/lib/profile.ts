import type { User } from './types';

/** 未设置性别时不推断用户的形象。 */
export function mascotFor(user?: Pick<User, 'gender'> | null): 'him' | 'her' | undefined {
  if (user?.gender === 'male') return 'him';
  if (user?.gender === 'female') return 'her';
  return undefined;
}
