// 布尔型字段名（SQLite 用 INTEGER 0/1 存）
const BOOLEAN_COLUMNS = new Set<string>([
  'is_active', 'email_verified', 'is_read',
]);

/** PG 风格 $1, $2 占位符 → SQLite ?, ? */
function toSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$\d+/g, '?');
}

interface ConvertResult { sql: string; params: any[]; }

/**
 * PG 风格 $1, $2, $3 ... → SQLite ?, ?, ? ...
 * 同时按 $N 出现顺序重排参数数组，使 ? 按出现顺序绑定到正确的参数。
 *
 * 例如：SQL = '... WHERE id = $1 AND name = $2'，params = [10, 'Alice']
 *   → SQL: '... WHERE id = ? AND name = ?', params: [10, 'Alice']
 *
 *      SQL = '... SET a = $2, b = $3, c = $1'，params = [1, 2, 3]
 *   → SQL: '... SET a = ?, b = ?, c = ?', params: [2, 3, 1]
 */
export function pgToSqlite(sql: string, params: any[] = []): ConvertResult {
  const PH = new RegExp('\\$\\d+', 'g');
  const NAMES: number[] = [];
  const replaced = sql.replace(PH, (m) => {
    const idx = parseInt(m.slice(1), 10) - 1;
    NAMES.push(idx);
    return '?';
  });
  if (NAMES.length === 0) return { sql: replaced, params };
  const reordered = NAMES.map((i) => params[i] ?? null);
  return { sql: replaced, params: reordered };
}

/**
 * PG 方言 → SQLite 方言的轻量改写
 * 业务层继续使用 PG 习惯的 SQL（NOW() / TRUE / FALSE / CURRENT_TIMESTAMP），
 * 由适配层在执行前统一转换，保持上层代码与 PG 兼容。
 */
export function toSqliteDialect(sql: string): string {
  return sql
    // 关键字大小写保留原文，仅替换函数/字面量
    .replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')")
    .replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')")
    .replace(/\bTRUE\b/g, '1')
    .replace(/\bFALSE\b/g, '0')
    // 移除 PG 行级锁：SQLite 用 BEGIN IMMEDIATE 事务锁替代
    .replace(/\bFOR\s+UPDATE\b/gi, '');
}

/** 规范化布尔字段：DB 0/1 → JS boolean */
export function coerceRow(row: any, columns: string[]): any {
  if (!row) return row;
  for (const col of columns) {
    if (BOOLEAN_COLUMNS.has(col) && typeof row[col] === 'number') {
      row[col] = row[col] !== 0;
    }
    // SQLite datetime('now') is UTC but omits its timezone. Keep API dates explicit.
    if ((col.endsWith('_at') || col === 'start_time' || col === 'end_time') &&
      typeof row[col] === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(row[col])) {
      row[col] = row[col].replace(' ', 'T') + 'Z';
    }
  }
  return row;
}

/** 规范化参数：JS boolean → 0/1 */
export function coerceParams(params: any[] | undefined): any[] {
  if (!params) return [];
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}
