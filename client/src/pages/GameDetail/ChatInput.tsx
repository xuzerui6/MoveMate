/**
 * 聊天输入框 —— 固定在底部，支持回车发送
 * MVP：纯文字，最大 500 字
 */
import React, { useState, useRef } from 'react';
import {Icon} from '../../features/motion/components/Icons';

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_LENGTH = 500;

const ChatInput: React.FC<Props> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (trimmed.length > MAX_LENGTH) return;

    onSend(trimmed);
    setValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ui-pages-gamedetail-chatinput-container">
      <div className="ui-pages-gamedetail-chatinput-inputWrapper">
        <input
          ref={inputRef}
          className="form-input ui-pages-gamedetail-chatinput-input"
          
          type="text"
          aria-label="聊天消息"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={MAX_LENGTH}
          disabled={disabled}
        />
        <span className="ui-pages-gamedetail-chatinput-counter">
          {value.length}/{MAX_LENGTH}
        </span>
      </div>
      <button
        className="btn btn--primary ui-pages-gamedetail-chatinput-sendBtn"
        
        onClick={handleSend}
        aria-label="发送"
        disabled={!value.trim() || disabled}
      >
        <Icon name="send" size={24}/>
      </button>
    </div>
  );
};



export default ChatInput;
