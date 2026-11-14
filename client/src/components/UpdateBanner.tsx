import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../features/motion/lib/store';
import {
  UPDATE_CHECK_INTERVAL_MS,
  dismissVersion,
  fetchLatestVersion,
  readDismissedVersion,
  shouldShowUpdateBanner,
} from '../lib/updateCheck';

/**
 * 温和的新版本提示条：部署后还开着的旧标签页会一直跑旧代码，这里在页面底部
 * 浮一条小提示，用户自己点「刷新」才整页刷新；点「稍后」记住这个版本，不再
 * 为它提示（再有更新的版本仍会提示）。检查时机：挂载时、每 3 分钟、标签页
 * 回到前台时、每次路由切换时；检查失败（断网等）一律静默，绝不报错。
 * 训练中（任一会话 running/paused，或计划训练页）不展示，训练结束自然出现。
 * 本组件唯一的整页刷新就是「刷新」按钮——不存在任何自动刷新路径。
 */

/** 构建时由 cloudflare/scripts/web.mjs 注入的版本戳（git 提交号）；没有戳的构建（本地开发）不启用检查。 */
const EMBEDDED_VERSION = (import.meta.env.VITE_BUILD_ID as string | undefined) || null;

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function UpdateBanner() {
  const { sessions } = useStore();
  const location = useLocation();
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() =>
    readDismissedVersion(localStorageOrNull()),
  );
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (!EMBEDDED_VERSION || checking.current) return;
    checking.current = true;
    try {
      const version = await fetchLatestVersion((url, init) =>
        fetch(url, { cache: init?.cache as RequestCache | undefined }),
      );
      if (version) setLatest(version);
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (!EMBEDDED_VERSION) return;
    const timer = setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  useEffect(() => {
    void check();
  }, [location.pathname, check]);

  // 训练中不打扰：与 Training 页「进行中」同一判定（会话 running/paused）；
  // 计划训练页（远距离摄像头界面）在会话建立前也先不展示。
  const sessionActive =
    sessions.some((s) => s.status === 'running' || s.status === 'paused') ||
    location.pathname.startsWith('/train/workout/');
  if (
    !shouldShowUpdateBanner({
      current: EMBEDDED_VERSION,
      latest,
      dismissedVersion: dismissed,
      sessionActive,
    })
  )
    return null;

  const dismiss = () => {
    if (!latest) return;
    dismissVersion(localStorageOrNull(), latest);
    setDismissed(latest);
  };

  return (
    <div className="update-banner" role="status">
      <p className="update-banner-text">
        <strong>有新版本啦</strong>
        <span>刷新一下，就能用上新功能。</span>
      </p>
      <div className="update-banner-actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => window.location.reload()}
        >
          刷新
        </button>
        <button type="button" className="update-banner-later" onClick={dismiss}>
          稍后
        </button>
      </div>
    </div>
  );
}
