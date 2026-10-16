import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import client, { getErrorMessage } from '../../api/client';
import ConfirmDialog from './components/ConfirmDialog';
import './voice-service.css';

type Device = { slot: number; state: string; enabled: boolean; verified: boolean; bound: boolean; occupiedBy: number | null; lastError: string; activation: { code: string; expiresAt: number } | null };
type Snapshot = { enabled: boolean; quotaConfirmed: boolean; validationUsers: number[]; configured: boolean; devices: Device[] };
const STATES: Record<string, string> = { empty: '未绑定', activating: '待激活', unverified: '待隔离验证', ready: '可用', busy: '占用', error: '异常', disabled: '停用', bound: '已绑定' };

export default function VoiceService() {
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [validation, setValidation] = useState('');
  const [reset, setReset] = useState<number>();
  const alive = useRef(true);
  const apply = (next: Snapshot) => { if (alive.current) { setData(next); setValidation(next.validationUsers.join(', ')); } };
  const perform = async (key: string, request: () => Promise<any>) => {
    setBusy(key); setError('');
    try { const result = await request(); apply(result.data); }
    catch (e) { if (alive.current) setError(getErrorMessage(e)); }
    finally { if (alive.current) setBusy(''); }
  };
  useEffect(() => {
    alive.current = true;
    void perform('load', () => client.get('/admin/voice'));
    return () => { alive.current = false; };
  }, []);
  const configure = (body: Partial<Snapshot>) => perform('settings', () => client.patch('/admin/voice', body));
  const change = (slot: number, body: Partial<Device>) => perform(String(slot), () => client.patch(`/admin/voice/devices/${slot}`, body));
  const bind = (slot: number, create: boolean) => perform(String(slot), () => client.post(`/admin/voice/devices/${slot}/${create ? 'create' : 'activate'}`, {}, { timeout: 45000 }));
  return <section className="voice-service" aria-label="语音服务配置">
    <div className="voice-service__heading"><div><h2>统一语音陪练</h2><p>你集中绑定专用设备，用户登录动伴后即可开启语音。</p></div><button className="btn btn--secondary" disabled={!!busy} onClick={() => void perform('load', () => client.get('/admin/voice'))}>刷新状态</button></div>
    {error && <p className="voice-service__error" role="alert">{error}</p>}
    {!data ? <p role="status">{busy ? '正在读取服务状态…' : '未能读取配置，请刷新重试。'}</p> : <>
      {!data.configured && <p role="alert">服务端尚未配置设备加密密钥，暂不能生成或分配设备。</p>}
      <div className="voice-service__settings">
        <label><input type="checkbox" checked={data.enabled} disabled={!!busy} onChange={e => void configure({ enabled: e.target.checked })}/><span><b>向所有登录用户开放</b><small>当前{data.enabled ? '已开放' : '未开放'}。只有绑定并通过隔离验证的设备可供普通用户使用。</small></span></label>
        <label><input type="checkbox" checked={data.quotaConfirmed} disabled={!!busy} onChange={e => void configure({ quotaConfirmed: e.target.checked })}/><span>已在小智控制台确认当前免费额度允许所需设备数及并发；不启用付费服务</span></label>
        <div className="voice-service__validation"><label htmlFor="voice-validation">验证账号的用户 ID（最多 5 个，以逗号分隔）</label><div><input id="voice-validation" value={validation} onChange={e => setValidation(e.target.value)} placeholder="例如：1, 2" inputMode="text"/><button className="btn btn--secondary" disabled={!!busy} onClick={() => { const ids = validation.trim() ? validation.split(/[,，\s]+/).filter(Boolean).map(Number) : []; void configure({ validationUsers: ids }); }}>保存验证账号</button></div><small>公开开关关闭时，仅这些账号可使用已绑定、已启用的待验证设备。先完成两路有声与跨用户隔离测试，再勾选设备的隔离确认。</small></div>
      </div>
      <p>最多 5 路，一人一路；实际容量以可用设备数和上游额度为准。用户进入训练不会占位，点击开启后才分配。断线 45 秒内回收，静默 2 分钟自动释放。</p>
      <div className="voice-service__devices">{data.devices.map(device => <article className="voice-device" key={device.slot}>
        <div className="voice-device__heading"><h3>设备 {device.slot}</h3><span className={`voice-device__state ${device.state}`}>{STATES[device.state] || device.state}</span></div>
        {device.occupiedBy && <p>正在使用：用户 #{device.occupiedBy}</p>}
        {device.activation && <div className="voice-device__activation"><span>小智设备激活码</span><strong>{device.activation.code}</strong><small>{device.activation.expiresAt > Date.now() ? `有效至 ${new Date(device.activation.expiresAt).toLocaleTimeString()}` : '激活码已过期，请检查绑定以重新获取'}</small><a href="https://xiaozhi.me" target="_blank" rel="noreferrer">前往小智控制台绑定专用运动智能体</a></div>}
        {device.lastError && <p role="alert" className="voice-service__error">{device.lastError}</p>}
        {device.bound && <>
          <label><input type="checkbox" checked={device.enabled} disabled={!!busy} onChange={e => void change(device.slot, { enabled: e.target.checked })}/><span>允许分配（待验证时仅验证账号）</span></label>
          <label><input type="checkbox" checked={device.verified} disabled={!!busy} onChange={e => void change(device.slot, { verified: e.target.checked })}/><span>已使用专用运动智能体，关闭长期记忆及私人工具，并完成跨用户隔离测试</span></label>
        </>}
        <div className="voice-device__actions">
          {device.state === 'empty' ? <button className="btn btn--primary" disabled={!!busy || !data.configured} onClick={() => void bind(device.slot, true)}>生成激活码</button> : <button className="btn btn--secondary" disabled={!!busy || !!device.occupiedBy} onClick={() => void bind(device.slot, false)}>{busy === String(device.slot) ? '正在检查…' : '检查绑定'}</button>}
          {device.bound && <Link className="btn btn--secondary" to={`/train?voiceTestSlot=${device.slot}`} target="_blank">管理员设备测试</Link>}
          {device.state !== 'empty' && <button className="btn btn--secondary" disabled={!!busy || !!device.occupiedBy} onClick={() => setReset(device.slot)}>重置</button>}
        </div>
      </article>)}</div>
      <p className="voice-service__privacy">每次分配建立新的上游连接。本站不保存完整录音、图片或陪练对话；共享前须确认上游不会继承先前使用者的内容。设备密钥与上游令牌不会返回此页面。</p>
    </>}
    <ConfirmDialog open={reset !== undefined} title={`重置设备 ${reset || ''}？`} description="将清除本站保存的设备身份，需重新绑定。小智控制台中的旧设备需你另行移除。" confirmText="重置设备" onCancel={() => setReset(undefined)} onConfirm={() => { const slot = reset; setReset(undefined); if (slot) void perform(String(slot), () => client.delete(`/admin/voice/devices/${slot}`)); }}/>
  </section>;
}
