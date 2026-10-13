/**
 * 日期/时间工具 —— 从 Web 端 Lobby / GameCard 搬运
 */

/** 返回 YYYY-MM-DD（当天偏移 offsetDays） */
export function getDateText(offsetDays = 0): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 过滤日期展示文案：YYYY-MM-DD → '8月3日' */
export function formatFilterDateLabel(date?: string): string {
  if (!date) return '全部日期';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '已选日期';
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

/** 单时间格式化：今天 18:00 / 明天 07:30 / 8月5日 09:00 */
export function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const hour = d.getHours().toString().padStart(2, '0');
  const minute = d.getMinutes().toString().padStart(2, '0');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString()) {
    return `今天 ${hour}:${minute}`;
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return `明天 ${hour}:${minute}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hour}:${minute}`;
}

/** 时间范围格式化 */
export function formatTimeRange(start: string, end: string | null): string {
  if (!end) return formatTime(start);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const endHour = endDate.getHours().toString().padStart(2, '0');
  const endMinute = endDate.getMinutes().toString().padStart(2, '0');

  if (startDate.toDateString() === endDate.toDateString()) {
    return `${formatTime(start)} - ${endHour}:${endMinute}`;
  }
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/** 详情页时间格式化：8月3日 18:00 */
export function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  const hour = d.getHours().toString().padStart(2, '0');
  const minute = d.getMinutes().toString().padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hour}:${minute}`;
}
