/**
 * 色板常量 —— 沿用 Web 端「现代极简」风格
 * 供 JS 内联样式 / SCSS 变量引用
 */
export const COLORS = {
  primary: '#0F172A',        // 深色主色（标题/选中态/主按钮）
  accent: '#10B981',         // 绿色点缀
  bg: '#F8FAFC',             // 页面背景
  card: '#FFFFFF',           // 卡片背景
  text: '#334155',           // 正文文字
  textSecondary: '#64748B',  // 次要文字
  textMuted: '#94A3B8',      // 弱化文字
  border: '#E2E8F0',         // 边框
  borderLight: '#F1F5F9',    // 浅边框
  danger: '#EF4444',         // 危险操作
  blue: '#2563EB',           // 强调蓝（剩余人数/链接）
  purple: '#7C3AED',         // 等级紫
  purpleBg: '#F5F3FF',       // 等级紫底
  orange: '#FF6B35',         // 发起人橙
  orangeBg: '#FFF3EE',       // 发起人橙底
} as const;
