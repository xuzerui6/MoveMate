/**
 * 好友与安全（个人中心里的一张卡）：
 * 我的邀请链接、谁能给我发好友申请、拉黑名单。都用大白话，不搞设置黑话。
 */
import React, { useCallback, useEffect, useState } from 'react';
import Avatar from '../../components/Avatar';
import * as socialApi from '../../api/social';
import { getErrorMessage } from '../../api/client';
import { showToast } from '../../hooks/useAuth';
import type { BlockEntry } from '../../types';
import './SocialSettingsCard.css';

const SocialSettingsCard: React.FC = () => {
  const [invitePath, setInvitePath] = useState('');
  const [scope, setScope] = useState<'anyone' | 'played_together'>('anyone');
  const [blocks, setBlocks] = useState<BlockEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingScope, setSavingScope] = useState(false);

  const load = useCallback(async () => {
    try {
      const [invite, settings, blockList] = await Promise.all([
        socialApi.fetchMyInvite(),
        socialApi.fetchSocialSettings(),
        socialApi.fetchBlocks(),
      ]);
      setInvitePath(invite.invite_path);
      setScope(settings.friend_request_scope);
      setBlocks(blockList);
    } catch {
      /* 读不到就不显示内容，卡片本身还在 */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copyInvite = async () => {
    if (!invitePath) return;
    const url = `${window.location.origin}${invitePath}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('邀请链接复制好了，发给同学吧', 'success');
    } catch {
      showToast('复制没成功，长按链接复制一下吧', 'error');
    }
  };

  const changeScope = async (next: 'anyone' | 'played_together') => {
    if (next === scope || savingScope) return;
    setSavingScope(true);
    try {
      await socialApi.updateSocialSettings(next);
      setScope(next);
      showToast('设置好了', 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSavingScope(false);
    }
  };

  const unblock = async (entry: BlockEntry) => {
    try {
      await socialApi.unblockUser(entry.user_id);
      setBlocks((prev) => prev.filter((b) => b.user_id !== entry.user_id));
      showToast(`已把${entry.nickname}移出拉黑名单`, 'success');
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="social-settings-card">
      <h2>好友与安全</h2>

      <div className="social-settings-block">
        <h3>我的邀请链接</h3>
        <p className="social-settings-note">把链接发给现实里的同学、室友，他点开就能加你为好友。</p>
        <div className="social-settings-invite-row">
          <span className="social-settings-invite-link">
            {invitePath ? `${window.location.origin}${invitePath}` : '正在生成…'}
          </span>
          <button className="btn btn--primary" onClick={() => void copyInvite()} disabled={!invitePath}>
            复制链接
          </button>
        </div>
      </div>

      <div className="social-settings-block">
        <h3>谁能给我发好友申请</h3>
        <div className="social-settings-scope" role="radiogroup" aria-label="谁能给我发好友申请">
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'anyone'}
            className={`social-settings-scope-option${scope === 'anyone' ? ' social-settings-scope-option--active' : ''}`}
            onClick={() => void changeScope('anyone')}
            disabled={savingScope}
          >
            谁都可以
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'played_together'}
            className={`social-settings-scope-option${scope === 'played_together' ? ' social-settings-scope-option--active' : ''}`}
            onClick={() => void changeScope('played_together')}
            disabled={savingScope}
          >
            只给一起练过的人
          </button>
        </div>
        <p className="social-settings-note">
          {scope === 'anyone'
            ? '任何人看到你，都能给你发好友申请，你点头才算数。'
            : '只有和你一起练过的人能给你发申请，清净一些。'}
        </p>
      </div>

      <div className="social-settings-block">
        <h3>拉黑名单</h3>
        {!loaded ? (
          <p className="social-settings-note">正在读取…</p>
        ) : blocks.length === 0 ? (
          <p className="social-settings-note">你还没有拉黑过谁。真遇上不舒服的人，在他的资料卡里就能拉黑。</p>
        ) : (
          <ul className="social-settings-blocks">
            {blocks.map((b) => (
              <li key={b.user_id}>
                <Avatar name={b.nickname} url={b.avatar_url} size={40} />
                <span className="social-settings-block-name">{b.nickname}</span>
                <button className="btn btn--secondary btn--sm" onClick={() => void unblock(b)}>
                  取消拉黑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SocialSettingsCard;
