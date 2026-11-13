/**
 * 敏感词过滤（起步词库 + 挂钩点）
 *
 * 说明：这只是一个起步词库和统一的检查入口，不是完整的词典。
 * 命中时拦下并给一句人话提示；暗示、绕弯子这类情况靠举报闭环兜底。
 * 后续扩充词库只需要往 SENSITIVE_WORDS 里加词，不用改调用方。
 */
import { ValidationError } from './errors';

/** 起步敏感词库（小写匹配，包含即命中） */
export const SENSITIVE_WORDS: string[] = [
  // 脏话 / 辱骂
  '傻逼', '煞笔', 'sb', 'nmsl', '他妈的', '妈的', '操你', '草你', ' fuck', 'fuck you', 'shit',
  '贱人', '婊子', '废物东西', '去死',
  // 广告 / 引流
  '加微信', '加vx', '加v信', '微信号', '扫码加', '返利机器人', '刷单', '兼职日结',
  '博彩', '赌博', '网赌', '六合彩', '时时彩',
  // 色情 / 违禁
  '约炮', '一夜情', '裸聊', '色情', 'porn', '大麻', '冰毒', '摇头丸', '代孕',
  // 诈骗
  '稳赚不赔', '带你回血', '内部消息包赢',
];

/** 文本里是否包含敏感词 */
export function containsSensitiveWord(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  return SENSITIVE_WORDS.some((word) => normalized.includes(word.toLowerCase()));
}

/** 命中敏感词时抛出一句人话错误；没命中什么都不做 */
export function assertNoSensitiveWord(text: unknown, _fieldLabel = '这段文字'): void {
  if (containsSensitiveWord(text)) {
    throw new ValidationError('这段文字里有不太合适的词，换个说法再试试吧');
  }
}
