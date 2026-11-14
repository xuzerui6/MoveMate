// 对话窗口政策：陪练「全程在场」，但敞开听用户说话的时间必须有边界。
//
// 两种窗口：
// - followup：用户主动唤醒/点开对话后的跟进窗口（25 秒）。组中也只用这个，
//   避免呼吸声、用力声、室友说话被当成聊天触发。
// - rest：组间休息窗口（75 秒）。到组间时自动打开，小智先开口总结，
//   然后听用户说话；每次被接受的发言/回复结束都会把窗口往后顺延。
//
// 窗口过期后，非指向性的声音不得再进入自由对话（靠唤醒词/点按重新进入）。
// 另外，「思考中」不吃沉默超时：旧代码的沉默计时在 thinking 态也会跑，
// 回复还没生成完就可能把会话打回 idle。这里把两件事分开——thinking 只看
// 它自己的超时，超时是回到 listening，而不是关麦走人。
//
// 纯逻辑、无 IO，可单测。

export const FOLLOWUP_WINDOW_MS = 25_000
export const REST_WINDOW_MS = 75_000
/** thinking 态最长等待；超时回到 listening（不清麦、不关窗）。 */
export const THINKING_TIMEOUT_MS = 20_000
/** thinking 超时回到 listening 后，至少再给这么久把话说完的机会。 */
export const THINKING_RECOVERY_MS = 10_000

export type ConversationWindowKind = 'followup' | 'rest'

export interface ConversationWindow {
  kind: ConversationWindowKind
  openedAt: number
  deadline: number
}

export function openConversationWindow(kind: ConversationWindowKind, now: number): ConversationWindow {
  return { kind, openedAt: now, deadline: now + (kind === 'rest' ? REST_WINDOW_MS : FOLLOWUP_WINDOW_MS) }
}

/** 一次活动（用户被接受的发言、或小智回复结束）后，窗口至少再保留一个跟进时长。 */
export function extendConversationWindow(window: ConversationWindow, now: number): void {
  const next = now + FOLLOWUP_WINDOW_MS
  if (next > window.deadline) window.deadline = next
}

export function conversationWindowExpired(window: ConversationWindow | null, now: number): boolean {
  return !window || now >= window.deadline
}

/** thinking 是否已超时（与沉默超时分开计）。 */
export function thinkingTimedOut(thinkingSince: number, now: number): boolean {
  return thinkingSince > 0 && now - thinkingSince >= THINKING_TIMEOUT_MS
}
