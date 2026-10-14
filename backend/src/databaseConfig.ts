export function databaseUrlFrom(config: Record<string, string | undefined>) {
  if (config.DATABASE_URL?.trim()) return config.DATABASE_URL.trim();
  if (!config.DB_PASSWORD) throw new Error('缺少 DB_PASSWORD，请在服务器 backend.env 中填写数据库密码');
  const url = new URL('mysql://127.0.0.1:3306/couple');
  url.hostname = config.DB_HOST || '127.0.0.1';
  url.port = config.DB_PORT || '3306';
  url.pathname = config.DB_NAME || 'couple';
  url.username = config.DB_USER || 'couple';
  url.password = config.DB_PASSWORD;
  return url.toString();
}
