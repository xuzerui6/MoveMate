import Dialog from '../../components/Dialog';
import loginAvatar from '../../features/motion/assets/avatars/outfits/male/default/front.png';
/**
 * 登录/注册页面 —— 校园邮箱验证 + 邮箱注册和登录
 * 支持切换登录/注册模式
 * 注册需要校园邮箱验证码
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';
import * as authApi from '../../api/auth';
import type { Campus } from '../../types';
import client, {getErrorMessage} from '../../api/client';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { login, register, loading, error, clearError } = useAuth();

  const [bootstrapError,setBootstrapError]=useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // 登录字段
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 注册额外字段
  const [nickname, setNickname] = useState('');
  const [studentId, setStudentId] = useState('');
  const [qqEmail, setQqEmail] = useState('');
  const [campusId, setCampusId] = useState<number | ''>('');
  const [campuses, setCampuses] = useState<Campus[]>([]);

  // 邮箱验证
  const [verifyCodeSent, setVerifyCodeSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyCodeSending, setVerifyCodeSending] = useState(false);
  const [verifyCountdown, setVerifyCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 倒计时清理
  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const startCountdown = () => {
    setVerifyCountdown(60);
    countdownRef.current = setInterval(() => {
      setVerifyCountdown((prev) => {
        if (prev <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidationErrors({ email: '请先输入正确的邮箱地址' });
      return;
    }
    setVerifyCodeSending(true);
    try {
      await client.post('/verify/send', { email: email.trim() });
      setVerifyCodeSent(true);
      startCountdown();
      setValidationErrors({});
    } catch (err: any) {
      const msg = err?.response?.data?.message || '发送失败，请稍后再试';
      setValidationErrors({ verify: msg });
    } finally {
      setVerifyCodeSending(false);
    }
  };

  // 表单校验错误
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // 用户协议
  const [agreed, setAgreed] = useState(false);
  const [showAgreement, setShowAgreement] = useState<'terms' | 'privacy' | null>(null);

  // 已登录则直接跳转
  const from = (location.state as any)?.from || '/';
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      // 恢复 store 状态后跳转
      useAuthStore.getState().init();
      navigate(from, { replace: true });
    }
  }, []); // 空依赖，只在首次进入时检查

  // 登录成功后由 useAuth hook 负责导航

  // 切换登录/注册时清除错误
  useEffect(() => {
    clearError();
    setValidationErrors({});
    setAgreed(false);
  }, [mode]);

  useEffect(() => {
    authApi.fetchBootstrap()
      .then((data) => {
        setCampuses(data.campuses || []);
        if (!campusId && data.campuses?.[0]) {
          setCampusId(data.campuses[0].id);
        }
      })
      .catch((e) => {
        setBootstrapError(getErrorMessage(e));
        setCampuses([]);
      });
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = '请输入邮箱';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = '请输入有效的邮箱地址';
    }

    if (!password) {
      errors.password = '请输入密码';
    } else if (password.length < 6) {
      errors.password = '密码至少 6 位';
    }

    if (mode === 'register') {
      if (!nickname.trim()) {
        errors.nickname = '请输入昵称';
      } else if (nickname.trim().length > 20) {
        errors.nickname = '昵称不能超过 20 个字';
      }
      if (!campusId) {
        errors.campus_id = '请选择默认校区';
      }
      if (!agreed) {
        errors.agreement = '请阅读并同意用户协议和隐私政策';
      }
      if (qqEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(qqEmail.trim())) {
        errors.qq_email = 'QQ邮箱格式不正确';
      }
      if (!verifyCodeSent) {
        errors.verify = '请先发送验证码';
      } else if (!verifyCode.trim()) {
        errors.verify = '请输入验证码';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (mode === 'login') {
      await login({ email: email.trim(), password });
    } else {
      await register({
        verify_code: verifyCode.trim(),
        email: email.trim(),
        password,
        nickname: nickname.trim(),
        student_id: studentId.trim() || undefined,
        campus_id: Number(campusId),
        qq_email: qqEmail.trim() || undefined,
      });
    }
  };

  return (
    <div className="ui-pages-login-login-container">
      {/* Logo 区域 */}
      <div className="ui-pages-login-login-logoArea">
        <img className="auth-avatar pixel-art" src={loginAvatar} alt="动伴运动分身"/>
        <h1 className="ui-pages-login-login-logoTitle">动伴</h1>
        <p className="ui-pages-login-login-logoDesc">和 AI 训练，也和搭子一起运动</p>
      </div>

      {/* 登录/注册切换 */}
      <div className="ui-pages-login-login-tabs">
        <button
          className="ui-pages-login-login-tab" style={{color: mode === 'login' ? '#009c55' : '#9CA3AF',borderBottomColor: mode === 'login' ? '#009c55' : 'transparent'}}
          onClick={() => setMode('login')}
        >
          登录
        </button>
        <button
          className="ui-pages-login-login-tab" style={{color: mode === 'register' ? '#009c55' : '#9CA3AF',borderBottomColor: mode === 'register' ? '#009c55' : 'transparent'}}
          onClick={() => setMode('register')}
        >
          注册
        </button>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="ui-pages-login-login-form">
{bootstrapError&&<div className="inline-error" role="alert"><p>校区和场地信息暂时无法读取：{bootstrapError}</p><button type="button" className="btn btn--secondary" onClick={()=>window.location.reload()}>重新加载</button></div>}
        {/* 全局错误 */}
        {error && <div className="ui-pages-login-login-globalError">{error}</div>}

        {/* 昵称（仅注册） */}
        {mode === 'register' && (
          <div className="form-group">
            <label className="form-label" htmlFor="auth-nickname">昵称 <span className="form-label__required">*</span>
            </label>
            <input
              className={`form-input ${validationErrors.nickname ? 'form-input--error' : ''}`}
              type="text"
              id="auth-nickname" value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              autoFocus
            />
            {validationErrors.nickname && (
              <p className="form-error">{validationErrors.nickname}</p>
            )}
          </div>
        )}

        {mode === 'register' && (
          <div className="form-group">
            <label className="form-label">
              学校
            </label>
            <input className="form-input" type="text" value="吉林大学" disabled />
          </div>
        )}

        {mode === 'register' && (
          <div className="form-group">
            <label className="form-label" htmlFor="auth-campusId">默认校区 <span className="form-label__required">*</span>
            </label>
            <select
              className={`form-select ${validationErrors.campus_id ? 'form-input--error' : ''}`}
              id="auth-campusId" value={campusId}
              onChange={(e) => setCampusId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">请选择校区</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
            {validationErrors.campus_id && (
              <p className="form-error">{validationErrors.campus_id}</p>
            )}
          </div>
        )}

        {/* 邮箱 */}
        <div className="form-group">
          <label className="form-label" htmlFor="auth-email">校园邮箱 <span className="form-label__required">*</span>
          </label>
          {mode === 'register' && (
            <p className="ui-pages-login-login-inline-0">
              仅支持 @mails.jlu.edu.cn 或 @jlu.edu.cn
            </p>
          )}
          {mode === 'register' && (
            <p className="ui-pages-login-login-inline-1">
              验证码可能进入垃圾邮件，请注意查看
            </p>
          )}
          <div className="ui-pages-login-login-inline-2">
            <input
              
              type="email"
              id="auth-email" value={email}
              onChange={(e) => { setEmail(e.target.value); setVerifyCodeSent(false); }}
              placeholder=""
              autoFocus={mode === 'login'}
              className={[`form-input ${validationErrors.email ? 'form-input--error' : ''}`,"ui-pages-login-login-inline-3"].filter(Boolean).join(" ")}
            />
            {mode === 'register' && (
              <button
                type="button"
                
                className={["btn btn--primary","ui-pages-login-login-inline-4"].filter(Boolean).join(" ")}
                disabled={verifyCodeSending || verifyCountdown > 0}
                onClick={handleSendCode}
              >
                {verifyCodeSending ? '发送中...' : verifyCountdown > 0 ? `${verifyCountdown}s` : '发送验证码'}
              </button>
            )}
          </div>
          {validationErrors.email && (
            <p className="form-error">{validationErrors.email}</p>
          )}
        </div>

        {/* 验证码输入（仅注册且已发送） */}
        {mode === 'register' && verifyCodeSent && (
          <div className="form-group">
            <label className="form-label" htmlFor="auth-verifyCode">验证码 <span className="form-label__required">*</span>
            </label>
            <input
              className={`form-input ${validationErrors.verify ? 'form-input--error' : ''}`}
              type="text"
              id="auth-verifyCode" value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              maxLength={6}
            />
            {validationErrors.verify && (
              <p className="form-error">{validationErrors.verify}</p>
            )}
          </div>
        )}

        {/* QQ邮箱（仅注册，选填） — 放在密码前 */}
        {mode === 'register' && (
          <div className="form-group">
            <label className="form-label" htmlFor="auth-qqEmail">QQ邮箱 <span className="ui-pages-login-login-inline-5">（选填，用于接收活动通知）</span>
            </label>
            <input
              className={`form-input ${validationErrors.qq_email ? 'form-input--error' : ''}`}
              type="email"
              id="auth-qqEmail" value={qqEmail}
              onChange={(e) => setQqEmail(e.target.value)}
            />
            {validationErrors.qq_email && (
              <p className="form-error">{validationErrors.qq_email}</p>
            )}
          </div>
        )}

        {/* 密码 */}
        <div className="form-group">
          <label className="form-label" htmlFor="auth-password">密码 <span className="form-label__required">*</span>
          </label>
          <input
            className={`form-input ${validationErrors.password ? 'form-input--error' : ''}`}
            type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            id="auth-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位密码"
          />
          {validationErrors.password && (
            <p className="form-error">{validationErrors.password}</p>
          )}
        </div>

        {/* 学号（仅注册，选填） */}
        {mode === 'register' && (
          <div className="form-group">
            <label className="form-label">学号（选填，用于校园认证）</label>
            <input
              className="form-input"
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
          </div>
        )}

        {/* 用户协议（仅注册） */}
        {mode === 'register' && (
          <div className="ui-pages-login-login-inline-6">
            <div className="ui-pages-login-login-agreementRow">
              <input
                type="checkbox" aria-label="同意用户协议和隐私政策"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="ui-pages-login-login-checkbox"
              />
              <span className="ui-pages-login-login-agreementText">
                我已阅读并同意
                <button type="button" className="ui-pages-login-login-agreementLink" onClick={() => setShowAgreement('terms')}>《用户协议》</button>
                和
                <button type="button" className="ui-pages-login-login-agreementLink" onClick={() => setShowAgreement('privacy')}>《隐私政策》</button>
              </span>
            </div>
            {validationErrors.agreement && (
              <p className="form-error">{validationErrors.agreement}</p>
            )}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          
          disabled={loading}
          className={["btn btn--primary btn--lg btn--block","ui-pages-login-login-inline-7"].filter(Boolean).join(" ")}
        >
          {loading
            ? mode === 'login'
              ? '登录中...'
              : '注册中...'
            : mode === 'login'
            ? '登录'
            : '注册'}
        </button>

        {/* 切换提示 */}
        <p className="ui-pages-login-login-switchHint">
          {mode === 'login' ? (
            <>
              还没有账号？{' '}
              <button
                type="button"
                className="ui-pages-login-login-switchBtn"
                onClick={() => setMode('register')}
              >
                立即注册
              </button>
            </>
          ) : (
            <>
              已有账号？{' '}
              <button
                type="button"
                className="ui-pages-login-login-switchBtn"
                onClick={() => setMode('login')}
              >
                立即登录
              </button>
            </>
          )}
        </p>
      </form>

      {/* 协议弹窗 */}
      {showAgreement && (
        <Dialog title={showAgreement === 'terms' ? '用户协议' : '隐私政策'} onClose={()=>setShowAgreement(null)}>
            <div className="agreement-body">
              {showAgreement === 'terms' ? (
                <>
                  <p className="ui-pages-login-login-modalP">欢迎使用<strong>动伴</strong>！</p>
                  <p className="ui-pages-login-login-modalP">动伴是一个基于运动场景的校园即时组局平台，旨在帮助同学们方便地找到运动伙伴和组织运动活动。</p>
                  <h4 className="ui-pages-login-login-modalH4">1. 服务说明</h4>
                  <p className="ui-pages-login-login-modalP">本平台提供运动组局、成员管理、签到打卡等服务。用户发布的信息应真实准确，不得发布虚假或违法内容。</p>
                  <h4 className="ui-pages-login-login-modalH4">2. 用户行为规范</h4>
                  <p className="ui-pages-login-login-modalP">用户应文明参与、互相尊重。禁止发布不当言论、骚扰他人或利用平台从事违法活动。平台有权对违规用户采取限制措施。</p>
                  <h4 className="ui-pages-login-login-modalH4">3. 免责声明</h4>
                  <p className="ui-pages-login-login-modalP">运动活动涉及人身安全风险，参与者应自行评估身体状况并注意安全。平台仅提供信息匹配服务，不对活动过程中的人身伤害或财产损失承担责任。</p>
                  <h4 className="ui-pages-login-login-modalH4">4. 账号管理</h4>
                  <p className="ui-pages-login-login-modalP">用户可随时通过个人中心编辑或删除个人信息。如不再使用本平台，可联系管理员注销账号。</p>
                </>
              ) : (
                <>
                  <p className="ui-pages-login-login-modalP">动伴<strong>重视</strong>你的隐私。</p>
                  <h4 className="ui-pages-login-login-modalH4">1. 我们收集的信息</h4>
                  <p className="ui-pages-login-login-modalP">注册时收集：邮箱、昵称、院系、校区。使用过程中收集：运动偏好、组局记录、签到记录。可选提供：学号（用于校园认证）、头像（从相册选取或拍摄）。</p>
                  <h4 className="ui-pages-login-login-modalH4">2. 信息的使用方式</h4>
                  <p className="ui-pages-login-login-modalP">昵称、院系、运动偏好和头像在组局详情页对参与者展示。邮箱仅用于登录和找回密码，不会公开显示。学号仅用于校园身份认证，不会对外展示。</p>
                  <h4 className="ui-pages-login-login-modalH4">3. 信息安全</h4>
                  <p className="ui-pages-login-login-modalP">我们采取合理的技术手段保护你的信息安全。密码经过加密存储，不会以明文形式保存。</p>
                  <h4 className="ui-pages-login-login-modalH4">4. 你的权利</h4>
                  <p className="ui-pages-login-login-modalP">你可以随时在个人中心修改或删除个人信息。如需注销账号和数据，请联系管理员。注销后所有数据将被永久删除。</p>
                </>
              )}
            </div>
            <div className="ui-pages-login-login-modalFooter">
              <button
                type="button"
                className="ui-pages-login-login-modalAgreeBtn"
                onClick={() => {
                  setShowAgreement(null);
                }}
              >
                我知道了
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
};



export default Login;
