/**
 * 怪兽目录（前端镜像）：与 server/src/utils/avatar-shared.ts 的 BOSS_CATALOG 对齐，
 * 这里多带图鉴要用的图片与说明。加怪时两边一起改，boss_id 不要写错。
 * 图片是设计定稿图抠图去底后的 WebP（assets/bosses/）。
 */
import yanshiFull from '../assets/bosses/yanshi-full.webp'
import yanshiMid from '../assets/bosses/yanshi-mid.webp'
import yanshiLow from '../assets/bosses/yanshi-low.webp'
import wuyaShou from '../assets/bosses/wuya-shou.webp'
import yeyiFu from '../assets/bosses/yeyi-fu.webp'
import chenyuanYingjiao from '../assets/bosses/chenyuan-yingjiao.webp'
import lieyueManniu from '../assets/bosses/lieyue-manniu.webp'
import ziyeYanlong from '../assets/bosses/ziye-yanlong.webp'
import suiyueShoumo from '../assets/bosses/suiyue-shoumo.webp'
import ziyeZhong from '../assets/bosses/ziye-zhong.webp'
import yanshiMedal from '../assets/bosses/souvenir-yanshi-medal.webp'

export type BossAvailability = 'fight' | 'roster' | 'weekly' | 'event'

export interface BossInfo {
  id: string
  name: string
  /** 图鉴档位（中文）：普通 / 精英 / 首领 / 周怪级 / 周怪 / 活动怪 */
  tier: string
  availability: BossAvailability
  image: string
  /** 只有一期主线怪有三档血量图（boss-a-states.md 规范） */
  stateImages?: { full: string; mid: string; low: string }
  souvenirItemId: string
  souvenirName: string
  souvenirImage?: string
  blurb: string
}

/** 一期真正能打的怪，前端发起打怪时显式指定它 */
export const PHASE1_BOSS_ID = 'aoye_yanshi'

export const BOSSES: BossInfo[] = [
  {
    id: 'wuya_shou', name: '雾牙兽', tier: '普通', availability: 'roster',
    image: wuyaShou, souvenirItemId: 'wuya_shou_medal', souvenirName: '雾牙兽首胜纪念章',
    blurb: '雾里探头的小个子，牙尖嘴利，跑得飞快。',
  },
  {
    id: 'yeyi_fu', name: '夜翼蝠', tier: '普通', availability: 'roster',
    image: yeyiFu, souvenirItemId: 'yeyi_fu_medal', souvenirName: '夜翼蝠首胜纪念章',
    blurb: '专挑熄灯之后出来扑腾翅膀，吵得人睡不着。',
  },
  {
    id: 'chenyuan_yingjiao', name: '沉渊影蛟', tier: '精英', availability: 'roster',
    image: chenyuanYingjiao, souvenirItemId: 'chenyuan_yingjiao_medal', souvenirName: '沉渊影蛟首胜纪念章',
    blurb: '盘在深水里的影子，身子一沉，半天不露头。',
  },
  {
    id: 'lieyue_manniu', name: '裂月蛮牛', tier: '精英', availability: 'roster',
    image: lieyueManniu, souvenirItemId: 'lieyue_manniu_medal', souvenirName: '裂月蛮牛首胜纪念章',
    blurb: '脾气最冲的一个，认准了方向就直直撞过来。',
  },
  {
    id: PHASE1_BOSS_ID, name: '熬夜魇狮', tier: '首领', availability: 'fight',
    image: yanshiFull, stateImages: { full: yanshiFull, mid: yanshiMid, low: yanshiLow },
    souvenirItemId: 'aoye_yanshi_medal', souvenirName: '魇狮月牙勋章', souvenirImage: yanshiMedal,
    blurb: '夜幕兽群的首领，专在深夜里出没，额头一枚月牙。',
  },
  {
    id: 'ziye_yanlong', name: '子夜魇龙', tier: '周怪级', availability: 'weekly',
    image: ziyeYanlong, souvenirItemId: 'ziye_yanlong_medal', souvenirName: '子夜魇龙首胜纪念章',
    blurb: '全家族最大的一只，要全校一起上才推得动。',
  },
  {
    id: 'suiyue_shoumo', name: '碎月睡魔', tier: '周怪', availability: 'weekly',
    image: suiyueShoumo, souvenirItemId: 'suiyue_shoumo_medal', souvenirName: '碎月睡魔首胜纪念章',
    blurb: '每周只出现一只的大块头，月亮缺口就是它啃的。',
  },
  {
    id: 'ziye_zhong', name: '子夜钟巨像', tier: '活动怪', availability: 'event',
    image: ziyeZhong, souvenirItemId: 'ziye_zhong_medal', souvenirName: '子夜钟巨像首胜纪念章',
    blurb: '踩着熄灯钟声来的巨像，只在活动里现身。',
  },
]

export function bossInfo(id: string | null | undefined): BossInfo | undefined {
  return BOSSES.find((boss) => boss.id === id)
}

/** 血量估算在纯逻辑模块里（方便单测），这里转出给页面用 */
export { estimateMaxHp } from './bossFightState'

/** 纪念物图片（衣柜展示用）：只有已做好的纪念章有图，其余先只显示名字 */
export const SOUVENIR_IMAGES: Record<string, string> = {
  aoye_yanshi_medal: yanshiMedal,
}

/** 一期可打怪的动作（一级可信名单，与服务端冻结名单一致，不要随手扩） */
export const FIGHT_MOVEMENTS = [
  { id: 'squat', name: '深蹲' },
  { id: 'push_up', name: '俯卧撑' },
  { id: 'jumping_jack', name: '开合跳' },
  { id: 'high_knees', name: '高抬腿' },
] as const
export type FightMovement = (typeof FIGHT_MOVEMENTS)[number]['id']

export const FIGHT_DURATIONS = [
  { sec: 180, label: '3 分钟' },
  { sec: 300, label: '5 分钟' },
  { sec: 480, label: '8 分钟' },
] as const
