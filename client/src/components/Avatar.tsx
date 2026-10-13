/**
 * Avatar —— 全站统一头像组件
 * - 有头像图：显示图片，点击打开全局大图预览（除非传入自定义 onClick）
 * - 无头像图：显示昵称首字 + 彩色底，点击不响应（除非传入自定义 onClick）
 */
import React from 'react';
import { openAvatarPreview } from './AvatarPreview';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  /** 自定义点击行为（如打开成员卡片）。传入后不再触发大图预览 */
  onClick?: () => void;
  title?: string;
}


const Avatar: React.FC<AvatarProps> = ({ name, url, size = 40, onClick, title }) => {
  const hasImage = Boolean(url);

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (hasImage) {
      openAvatarPreview(url as string, name);
    }
  };

  return (
    <button
      type="button"
      title={title ?? (hasImage ? '查看头像' : name)}
      onClick={handleClick}
      className="user-avatar" style={{width: size,height: size,fontSize: Math.max(12,size * 0.42),cursor: hasImage || onClick ? 'pointer' : 'default'}}
    >
      {hasImage ? (
        <img
          src={url as string}
          alt={name}
          className="ui-components-avatar-inline-1"
        />
      ) : (
        (name?.charAt(0) || '?')
      )}
    </button>
  );
};

export default Avatar;
