/**
 * 摄像头先行开启 + 失败分类（打怪页摄像头打不开事故，2026-11-14）。
 *
 * iOS Safari 只在「用户手势还有效」的短窗口里允许 getUserMedia；打怪页旧
 * 流程先 await 整个识别模型下载/初始化（4G 下数秒起步），再去申请摄像
 * 头，手势窗口早已过期，系统直接拒绝，而页面把所有失败都写成同一句
 * 「检查一下权限」。训练页没事，是因为它进门就后台预下载、最后一次点
 * 击里立刻申请摄像头。
 *
 * 约定：点击处理函数里的第一个异步动作就是 acquireCameraStream()，
 * 先把流握在手里，再做模型准备等慢活，最后把流交给识别层接管。
 */

/** 与识别层一致的前置摄像头约束（ideal 偏好，不锁死设备） */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 }, aspectRatio: { ideal: 3 / 4 } },
  audio: false,
};

/** 在手势窗口内申请摄像头流。失败时原样抛出，由 classifyCameraError 分类。 */
export async function acquireCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('camera-unsupported');
  }
  return navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
}

export type CameraErrorKind = 'denied' | 'busy' | 'no-device' | 'unsupported' | 'other';

/** 把 getUserMedia 的失败分成可行动的几类（纯名字判定，不看浏览器私有字段） */
export function classifyCameraError(error: unknown): CameraErrorKind {
  if (error instanceof Error && error.message === 'camera-unsupported') return 'unsupported';
  const name = (error as { name?: string } | null)?.name || '';
  if (name === 'NotAllowedError') return 'denied';
  if (name === 'NotReadableError') return 'busy';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  return 'other';
}

const CAMERA_ERROR_COPY: Record<CameraErrorKind, string> = {
  denied: '摄像头没得到允许。在 Safari 地址栏左侧的按钮里允许摄像头，或者去系统设置里打开，再点一次试试。',
  busy: '摄像头正被别的页面或应用占着，先把它们关掉，再点一次试试。',
  'no-device': '没找到能用的摄像头，检查一下设备，再点一次试试。',
  unsupported: '这个浏览器打不开摄像头，换 Safari 或 Chrome 再试试。',
  other: '摄像头没能打开，再点一次试试。',
};

/** 失败分类 → 大白话、可照着做的提示 */
export function cameraErrorCopy(kind: CameraErrorKind): string {
  return CAMERA_ERROR_COPY[kind];
}

/**
 * 识别层启动失败后的文案：优先用识别层自己给出的具体原因
 * （useAdaptivePose / useLegacyPose 的 errorReason 已经按权限/占用/
 * 没设备/模型失败写好了大白话），没有时按失败阶段兜底，
 * 绝不再一律怪到摄像头权限头上。
 */
export function poseFailureCopy(
  phase: string | null | undefined,
  reason: string | null | undefined,
): string {
  if (reason) return reason;
  if (phase === 'model') return '识别没能准备好，检查一下网络，再点一次试试。';
  return '摄像头没能打开，再点一次试试。';
}
