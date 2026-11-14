import type { CameraExerciseType } from './lib/exercises'
import type { AxisAssessments, DepthBandCounts } from './lib/axisAssessment'
export type Route = 'home' | 'workout' | 'summary' | 'avatar' | 'inventory'
export type AvatarGender = 'male' | 'female'
export type OutfitPreset = 'default' | 'penguin' | 'sakura' | 'sunset_sakura' | 'sea_runner' | 'violet_court' | 'sunlight_explorer'
export type AvatarView = 'front' | 'side'
export type Slot = 'head' | 'top' | 'bottom' | 'shoes' | 'gloves' | 'prop' | 'badge' | 'effect'
export type Rarity = 'N' | 'R' | 'SR' | 'SSR'
export type HeartRateZone = 1 | 2 | 3 | 4 | 5
export type WorkoutPhase = 'standing' | 'descending' | 'bottom' | 'ascending'
export type XiaozhiState = 'off' | 'idle' | 'activating' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'reconnecting' | 'fallback' | 'failed'
export type XiaozhiIdentityMode = 'personal' | 'shared' | 'disabled'
export type CoachEmotion = 'neutral' | 'listening' | 'thinking' | 'happy' | 'confident' | 'caring' | 'concerned' | 'celebrating'
export type PoseIssue = 'out_of_frame' | 'insufficient_depth' | 'knee_instability' | 'excessive_trunk_lean' | 'asymmetry' | 'insufficient_range' | 'unstable_movement' | 'body_alignment' | 'poor_coordination'
export type PoseConfidence = 'stable' | 'adjust' | 'uncertain'

export interface FormBreakdown {
  depth: number
  stability: number
  trunk: number
  symmetry: number
}

export interface PoseFeedback {
  status: PoseConfidence
  confidence: number
  issues: PoseIssue[]
  primaryIssue: PoseIssue | null
  message: string
  affectedJoints: number[]
  calibrated: boolean
}

export interface VisionInsight {
  id: string
  /** 结果到达时刻 */
  createdAt: string
  /** 真实拍照时刻（ISO）。旧代码曾把到达时刻冒充拍照时刻，过期结果会
   * 被当成实时指导——新鲜度判断以这个字段为准（见 visionGuidance.ts）。 */
  capturedAt?: string
  trigger: 'user' | 'completed_rep' | 'repeated_issue'
  issue: PoseIssue | null
  rep?: number
  summary: string
}

export interface XiaozhiEnvelope<T = unknown> {
  type: string
  session_id?: string
  payload?: T
  [key: string]: unknown
}

export interface McpTextResult {
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
}

export interface VisionFrameJob {
  id: string
  rep: number | null
  /** 拍照时刻（ms epoch），入队时记录，不是结果回来时补的 */
  capturedAt: number
  image: string
  question: string
  trigger: VisionInsight['trigger']
  issue: PoseIssue | null
  retries: number
  priority: 'user' | 'automatic'
  mcpId?: string | number
  sessionId?: string
}

export interface XiaozhiDataSyncState {
  mcpReady: boolean
  lastRepSynced: number
  visionRep: number | null
  visionStatus: 'idle' | 'queued' | 'reviewed' | 'failed'
  wakeDetected: boolean
}

export type XiaozhiDeviceBootstrap =
  | { status: 'ready'; mode: 'shared' | 'personal'; leaseId?: string; test?: boolean }
  | { status: 'activating'; mode: 'personal'; code: string; message: string; expiresAt: number }

export interface WorkoutContext {
  exerciseType: CameraExerciseType | 'plan'
  plan?: { name:string; exerciseName:string; setNumber:number; weightKg:number; restSeconds:number; phase:string; instruction:string }
  countUnit: string
  reps: number
  targetReps: number
  phase: WorkoutPhase
  durationSeconds: number
  bpm: number | null
  active: boolean
  poseStatus: PoseConfidence
  poseIssues: PoseIssue[]
  recentScore: number
  lastRepAt: string | null
  lastRepIssues: PoseIssue[]
  latestVisionInsight: VisionInsight | null
}

export interface Equipment {
  id: string
  name: string
  slot: Slot
  rarity: Rarity
  image: string
  accent: string
  condition: string
  owned: boolean
}

export interface ScoreAccumulator extends FormBreakdown { count: number; total: number; leftReps?: number; rightReps?: number; /** Per-rep symmetry values in emit order (hammer curls, 2026-11-08): the set's symmetry axis aggregates these by median instead of the mean of `symmetry` sums. Absent on accumulators written before this field existed — consumers fall back to the mean. The `symmetry` sum itself is still maintained for that fallback. */ symmetryValues?: number[]; /** Step-3 contract: per-rep bilateral peak-timing offsets in ms (hammer curls). The set's symmetry presentation is the category of their median; no numeric symmetry is emitted or accumulated for new sets. */ symmetryOffsetsMs?: number[]; /** Step-3 contract: per-side tallies of scored front-raise reps per depth band; the set's depth presentation is each side's modal band. */ depthBandCounts?: DepthBandCounts }

export interface WorkoutMetrics {
  lastRepScore?: number | null
  scoreAccumulator?: ScoreAccumulator
  /** Step-3 contract: per-axis assessability for this session's scores.
   * Absent = every axis numeric (all pre-contract sessions and movements). */
  axisAssessment?: AxisAssessments
  reps: number
  targetReps: number
  formScore: number
  perfectReps: number
  feedback: string
  phase: WorkoutPhase
}

export interface ZoneDurations {
  zone1Seconds: number
  zone2Seconds: number
  zone3Seconds: number
  zone4Seconds: number
  zone5Seconds: number
}

export interface WorkoutSession extends WorkoutMetrics, ZoneDurations {
  workoutId?: string;
  planSquatReps?: number;
  source?: 'camera' | 'timer' | 'demo';
  settled?: boolean;
  growthPending?: boolean;
  id: string
  exerciseType: string
  startTime: string
  endTime: string | null
  durationSeconds: number
  currentBpm: number | null
  averageBpm: number | null
  maxBpm: number | null
  heartRateSource: 'ble' | null
  xpEarned: number
  baseXpEarned?: number
  missionXpEarned?: number
  xpBefore?: number
  xpAfter?: number
  levelBefore?: number
  levelAfter?: number
  unlocked: string[]
  unlockedOutfits?: OutfitPreset[]
  formBreakdown: FormBreakdown
  correctionCounts: Record<PoseIssue, number>
  visionInsights: VisionInsight[]
  conversationTurnCount: number
}

export interface DailyMissionProgress {
  date: string
  squatReps: number
  zone3Seconds: number
  hasHighScoreWorkout: boolean
}

/** 分身自定义（与 server/src/utils/avatar-parts.ts 的 look 结构一致） */
export type AvatarSlotKey = 'hair' | 'eyes' | 'glasses' | 'face' | 'top' | 'pants' | 'shoes'
export type AvatarFace = 'genki' | 'calm'
export type AvatarSkin = 'fair' | 'natural' | 'wheat'
export type AvatarPartGroup = 'A' | 'B'

export interface AvatarCustomCore {
  group: AvatarPartGroup
  face: AvatarFace
  skin: AvatarSkin
  parts: Record<AvatarSlotKey, string | null>
}

export interface AvatarLook {
  v: 1
  mode: 'outfit' | 'custom'
  outfit?: OutfitPreset
  custom?: AvatarCustomCore
  presets?: Array<AvatarCustomCore | null>
}

export interface AppState {
  avatarGender: AvatarGender
  activeOutfit: OutfitPreset
  /** 当前形象（自定义搭配或套装口径）；旧缓存没有时由 adapt 派生 */
  avatarLook: AvatarLook
  /** 已解锁部件（partId → bool，服务端按下发） */
  unlockedParts: Record<string, boolean>
  unlockedOutfits: Record<OutfitPreset, boolean>
  seenOutfits: OutfitPreset[]
  newlyUnlockedOutfits: OutfitPreset[]
  nickname: string
  age: number
  level: number
  xp: number
  totalXp: number
  streakDays: number
  workouts: number
  completedWorkoutCount: number
  highScoreWorkoutCount: number
  totalSquats: number
  equipment: Equipment[]
  equipped: Partial<Record<Slot, string>>
  history: WorkoutSession[]
  dailyMissionProgress: DailyMissionProgress
  /** 打怪首胜纪念物（服务端 training/state 下发；旧缓存没有时为空数组） */
  souvenirs: Array<{ item_id: string; name: string; granted_at: string }>
}
