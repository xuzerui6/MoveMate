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

/** 通知类型 */
export type NotificationType =
  | 'member_joined'
  | 'member_left'
  | 'game_starting'
  | 'game_cancelled'
  | 'new_message'
  | 'game_full'
  | 'game_full_rollback'
  | 'check_in_reminder'
  | 'reward_granted'
  | 'penalty_applied';

/* ========== 数据实体 ========== */

export interface School {
  id: number;
  code: string;
  name: string;
}

export interface Campus {
  id: number;
  school_id: number;
  code: string;
  name: string;
}

export interface Venue {
  id: number;
  school_id: number;
  campus_id: number;
  name: string;
  sport_types?: string | string[];
}

export interface User {
  id: string;
  nickname: string;
  avatar: string;
  email: string;
  qq_email?: string;
  department?: string;
  is_admin?: boolean;
  campus_verified: boolean;
  campus?: string;
  school_id?: number;
  campus_id?: number;
  school_name?: string;
  campus_name?: string;
  reward_points?: number;
  reward_level?: number;
  reward_streak?: number;
  completed_games?: number;
  hosted_completed_games?: number;
  reward_badges?: string[];
  sport_preferences?: string[];
  created_at: string;
}

/** 公开用户信息（点击头像查看） */
export interface PublicUserInfo {
  id: string;
  nickname: string;
  avatar_url: string;
  department: string;
  sport_preferences: string[];
}

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

export interface Message {
  id: string;
  game_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string;
  content: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  game_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  nickname: string;
  avatar: string;
  department?: string;
  campus_name?: string;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
}

export interface LeaderboardResponse {
  rankings: LeaderboardEntry[];
  current_user: LeaderboardEntry | null;
}

/* ========== API 请求/响应 ========== */

export interface RegisterData {
  verify_code: string;
  nickname: string;
  email: string;
  password: string;
  student_id?: string;
  campus_id: number;
  qq_email?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateGameData {
  sport_type: SportType;
  campus_id: number;
  venue_id?: number;
  location?: string;
  meeting_note?: string;
  start_time: string;
  end_time?: string;
  max_players: number;
  tag?: GameTag;
}

export interface GameFilter {
  sport_type?: SportType;
  status?: GameState;
  campus_id?: number;
  scope?: 'campus' | 'school';
  date?: string;
  page?: number;
  size?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

export interface BootstrapData {
  school: School | null;
  campuses: Campus[];
  venues: Venue[];
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
