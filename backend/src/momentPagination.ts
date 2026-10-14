import { z } from 'zod';

export function momentPagination(query: { limit?: string; before?: string }) {
  const limit = z.coerce.number().int().min(1).max(100).default(30).parse(query.limit);
  const parts = query.before === undefined ? null : z.tuple([z.iso.datetime(), z.uuid()]).parse(query.before.split('|'));
  return { limit, before: parts ? { at: new Date(parts[0]), id: parts[1] } : null };
}
