/**
 * AvatarPreview —— 全局头像大图预览
 * 模块级事件中心：任意组件调用 openAvatarPreview(url) 即可弹出全屏大图
 * 挂载一次（App 根节点），全站复用
 */
import React, { useEffect, useState } from 'react';
import Dialog from './Dialog';

interface PreviewState {
  url: string;
  name?: string;
}

let currentPreview: PreviewState | null = null;
let listeners: Array<(s: PreviewState | null) => void> = [];

/** 打开头像大图预览（全局可用） */
export function openAvatarPreview(url: string, name?: string) {
  currentPreview = { url, name };
  listeners.forEach((l) => l(currentPreview));
}

/** 关闭头像预览（全局可用） */
export function closeAvatarPreview() {
  currentPreview = null;
  listeners.forEach((l) => l(null));
}

function subscribe(listener: (s: PreviewState | null) => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

const AvatarPreview: React.FC = () => {
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => subscribe(setPreview), []);

  if (!preview) return null;

  return (
    <Dialog title={preview.name||'头像预览'} onClose={closeAvatarPreview}>
      <div className="ui-components-avatarpreview-inline-1" onClick={(e) => e.stopPropagation()}>
        <img
          src={preview.url}
          alt={preview.name || '头像大图'}
          className="ui-components-avatarpreview-inline-2"
        />
        {preview.name && (
          <div className="ui-components-avatarpreview-inline-3">
            {preview.name}
          </div>
        )}
        <div className="ui-components-avatarpreview-inline-4">
          <button className="btn btn--secondary btn--sm" onClick={closeAvatarPreview}>
            关闭
          </button>
        </div>
        <div className="ui-components-avatarpreview-inline-5">
          点击任意处关闭
        </div>
      </div>
    </Dialog>
  );
};

export default AvatarPreview;
