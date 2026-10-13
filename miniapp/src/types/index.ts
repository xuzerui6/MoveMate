/* ========== 枚举类型 ========== */

/** 运动类型 */
export const COMMON_SPORT_TYPES = [
  'basketball',
  'badminton',
  'running',
  'fitness',
  'soccer',
  'volleyball',
  'tennis',
  'table_tennis',
  'swimming',
  'roller_skating',
  'skateboarding',
] as const;

export type CommonSportType = typeof COMMON_SPORT_TYPES[number];
export type SportType = string;

/** 运动局状态 */
export type GameState =
  | 'recruiting'
  | 'full'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'archived'
  | 'cancelled';

/** 局标签 */
export type GameTag = 'casual' | 'beginner_friendly' | 'competitive' | 'relaxed';

/* ========== 数据实体 ========== */

export interface Participant {
  id: string;
  game_id: string;
  user_id: string;
  nickname: string;
  avatar: string;
  role: 'creator' | 'member';
  reward_level?: number;
  total_reward_points?: number;
  joined_at: string;
  checked_in_at?: string | null;
  attendance_confirmed_at?: string | null;
  reward_points?: number;
  reward_granted_at?: string | null;
}

export interface Game {
  id: number;
  host_id: number;
  school_id?: number;
  campus_id?: number;
  venue_id?: number | null;
  sport_type: SportType;
  title: string;
  location: string;
  school_name?: string;
  campus_name?: string;
  venue_name?: string;
  venue_name_snapshot?: string;
  meeting_note?: string;
  max_players: number;
  member_count: number;
  is_host?: boolean;
  is_member?: boolean;
  start_time: string;
  end_time: string | null;
  completed_at: string | null;
  status: GameState;
  tag?: GameTag;
  checked_in_at?: string | null;
  attendance_confirmed_at?: string | null;
  reward_points?: number;
  reward_granted_at?: string | null;
  created_at: string;
  updated_at: string;
  // 详情页额外字段
  creator_name?: string;
  host_reward_level?: number;
  host_reward_points?: number;
  participants?: Participant[];
}

/* ========== 展示辅助 ========== */

/** 运动类型中文映射 */
export const SPORT_LABELS: Record<string, string> = {
  basketball: '篮球',
  badminton: '羽毛球',
  running: '跑步',
  fitness: '健身',
  soccer: '足球',
  volleyball: '排球',
  tennis: '网球',
  table_tennis: '乒乓球',
  swimming: '游泳',
  roller_skating: '轮滑',
  skateboarding: '滑板',
};

/** 状态中文映射 */
export const STATE_LABELS: Record<GameState, string> = {
  recruiting: '招募中',
  full: '已满员',
  ready: '即将开始',
  in_progress: '进行中',
  completed: '已结束',
  archived: '已归档',
  cancelled: '已取消',
};

/** 标签中文映射 */
export const TAG_LABELS: Record<GameTag, string> = {
  casual: '娱乐局',
  beginner_friendly: '新手友好',
  competitive: '认真局',
  relaxed: '养生局',
};

/** 标签颜色 */
export const TAG_COLORS: Record<GameTag, string> = {
  casual: '#1A936F',
  beginner_friendly: '#4A90D9',
  competitive: '#E74C3C',
  relaxed: '#F39C12',
};
