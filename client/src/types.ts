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
  'dance',
  'taekwondo',
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
  | 'penalty_applied'
  | 'friend_request'
  | 'friend_accepted'
  | 'game_invite'
  | 'report_outcome'
  | 'member_removed';

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
  /** 仅好友/本人可见：连续运动天数 */
  reward_streak?: number;
  /** 仅好友/本人可见：最近完成的局 */
  recent_games?: { id: number; title: string; sport_type: string; start_time: string; status: string }[];
  /** 仅好友/本人可见：和我一起练过的次数与最近一次 */
  together?: { count: number; last_played_at: string | null };
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
  /** 谁能看到：public 公开大厅 / friends 好友局 */
  visibility?: 'public' | 'friends';
  /** 发起人手动开放补位 */
  fill_open?: boolean;
  /** 人不够时自动开放补位 */
  auto_fill?: boolean;
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
  /** 'user' 普通发言 / 'system' 系统小提示（如「XX 加入了本局」） */
  kind?: 'user' | 'system';
  /** 发送者被我拉黑：内容已屏蔽 */
  masked?: boolean;
}

/* ========== 社交（好友）一期 ========== */

/** 我与某人的关系（页面按钮状态由此派生） */
export type FriendshipStatus = 'self' | 'friends' | 'none' | 'pending' | 'pending_out' | 'pending_in' | 'blocked';

export interface FriendEntry {
  user_id: number;
  nickname: string;
  avatar_url: string;
  department: string;
  sport_preferences: string[];
  streak: number;
  last_sport_at: string | null;
  together_count: number;
  last_played_at: string | null;
}

export interface RecentPartner {
  user_id: number;
  nickname: string;
  avatar_url: string;
  department: string;
  sport_preferences: string[];
  streak: number;
  together_count: number;
  last_played_at: string | null;
}

export interface FriendRequestItem {
  id: number;
  requester_id: number;
  greeting: string;
  source_game_id: number | null;
  created_at: string;
  nickname: string;
  avatar_url: string;
  department: string;
  sport_preferences: string[];
}

export interface BlockEntry {
  user_id: number;
  nickname: string;
  avatar_url: string;
  created_at: string;
}

export interface EndSummaryAttendee {
  user_id: number;
  nickname: string;
  avatar_url: string;
  friendship_status: FriendshipStatus;
}

export interface EndSummary {
  game: Game;
  attendees: EndSummaryAttendee[];
  my_stats: { xp: number; effective_ms: number; reps: number };
  rebooked_game_id: number | null;
}

export interface MyInvite {
  invite_code: string;
  invite_path: string;
  inviter: { id: number; nickname: string; avatar_url: string; department: string } | null;
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
  /** 谁能看到：public 公开大厅（默认）/ friends 好友局 */
  visibility?: 'public' | 'friends';
  /** 好友局人不够时自动开放补位（默认关） */
  auto_fill?: boolean;
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

/** 建局表单数据：服务端按当前用户学校过滤后的校区/场地 */
export interface GameMeta {
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
  dance: '舞蹈',
  taekwondo: '跆拳道',
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
