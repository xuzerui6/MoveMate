import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { showToast } from '../../hooks/useAuth';

const Feedback: React.FC = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      showToast('请输入反馈内容', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await client.post('/feedback', { content: content.trim(), contact: contact.trim() || undefined });
      showToast('感谢反馈！我们会尽快处理。', 'success');
      navigate(-1);
    } catch (err: any) {
      showToast(err?.userMessage || '提交失败，请重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ui-pages-feedback-feedback-page">
      <div className="ui-pages-feedback-feedback-header">
        <button className="ui-pages-feedback-feedback-backBtn" onClick={() => navigate(-1)}>← 返回</button>
        <h1 className="ui-pages-feedback-feedback-title">意见反馈</h1>
      </div>
      <p className="ui-pages-feedback-feedback-desc">遇到问题或有建议？请告诉我们，帮助我们做得更好。</p>
      <form onSubmit={handleSubmit} className="ui-pages-feedback-feedback-form">
        <div className="form-group">
          <label className="form-label" htmlFor="feedback-content">反馈内容</label>
          <textarea
            id="feedback-content"
            required
            aria-describedby="feedback-count"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="请详细描述你遇到的问题或建议..."
            rows={6}
            maxLength={1000}
            className={["form-input","ui-pages-feedback-feedback-inline-0"].filter(Boolean).join(" ")}
            autoFocus
          />
          <span id="feedback-count" className="ui-pages-feedback-feedback-charCount">{content.length}/1000</span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="feedback-contact">联系方式（选填）</label>
          <input
            id="feedback-contact"
            className="form-input"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="微信/QQ/手机号，方便我们联系你"
            maxLength={200}
          />
        </div>
        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          disabled={submitting}
        >
          {submitting ? '提交中...' : '提交反馈'}
        </button>
      </form>
    </div>
  );
};



export default Feedback;
