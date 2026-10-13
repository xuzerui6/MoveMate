/**
 * 头像工具 —— 从 Web 端 Avatar / AvatarGroup 搬运
 * 无真实头像 URL 时生成色块 + 首字
 */

const COLORS = [
  '#FF6B35', '#004E89', '#1A936F', '#9B5DE5',
  '#F72585', '#4361EE', '#4CC9F0', '#F8961E',
];

/** 基于昵称哈希生成头像背景色（同昵称颜色稳定一致） */
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** 头像展示文字（昵称首字） */
export function getAvatarText(nickname: string): string {
  return nickname?.charAt(0) || '?';
}
