/** Audio is optional. Unsupported/rejected/suspended contexts leave the visual timer usable. */
export async function activateRestAudio(
  current: AudioContext | null,
  Factory?: typeof AudioContext,
) {
  if (!Factory)
    return {
      context: null,
      ready: false,
      message: "当前浏览器不支持声音提醒，将继续显示休息倒计时",
    };
  let context = current;
  try {
    if (!context || context.state === "closed") context = new Factory();
    await context.resume();
    const ready = context.state === "running";
    return {
      context,
      ready,
      message: ready
        ? "本次声音提醒已激活；请保持页面在前台"
        : "声音暂未获准播放，将继续显示倒计时，可再次激活",
    };
  } catch {
    return {
      context,
      ready: false,
      message: "无法启用声音提醒，将继续显示休息倒计时",
    };
  }
}
