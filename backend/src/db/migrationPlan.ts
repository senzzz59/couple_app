type Migration = { folderMillis: number; hash: string };
type Applied = { created_at: number | string; hash: string };

/** Published SQL is immutable; older binaries may see later additive migrations. */
export function pendingMigrations(migrations: Migration[], applied: Applied[]) {
  const known = new Map(migrations.map((migration) => [migration.folderMillis, migration]));
  const latestKnown = Math.max(0, ...migrations.map((migration) => migration.folderMillis));
  const latestApplied = Math.max(0, ...applied.map((row) => Number(row.created_at)));
  const recorded = new Set<number>();
  for (const row of applied) {
    const timestamp = Number(row.created_at);
    if (!Number.isSafeInteger(timestamp)) throw new Error('数据库迁移记录无效');
    const migration = known.get(timestamp);
    if (migration && migration.hash !== row.hash) throw new Error('已发布的迁移 SQL 被修改，请恢复原文件并追加新迁移');
    if (!migration && timestamp <= latestKnown) throw new Error('已发布的迁移文件丢失，不能自动部署');
    recorded.add(timestamp);
  }
  for (const migration of migrations) {
    if (migration.folderMillis <= latestApplied && !recorded.has(migration.folderMillis)) throw new Error('数据库迁移历史不完整，不能跳过旧迁移');
  }
  return migrations.filter((migration) => migration.folderMillis > latestApplied);
}
