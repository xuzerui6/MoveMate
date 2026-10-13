import dotenv from 'dotenv';

// 加载 .env 文件，优先于默认值
dotenv.config({ path: process.env.ENV_FILE || '.env' });

/**
 * 全局配置对象，从环境变量读取所有运行时参数
 */
export const config = {
  /** 服务端口 */
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  /** 运行环境 */
  nodeEnv: process.env.NODE_ENV || 'development',

  /** 数据库连接配置 */
  database: {
    url: process.env.DATABASE_URL || 'postgresql://dajju:dajju_password@127.0.0.1:5432/dajju',
  },

  /** JWT 认证配置 */
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production-min-64-chars-long',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  /** 学号脱敏盐值 */
  studentIdSalt: process.env.STUDENT_ID_SALT || 'your-student-id-salt-change-in-production',

  /** 邮箱验证码过期时间（分钟） */
  verifyCodeExpireMinutes: parseInt(process.env.VERIFY_CODE_EXPIRE_MINUTES || '10', 10),

  /** 对外可访问的站点 URL（用于邮件中的链接） */
  baseUrl: process.env.BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${process.env.PORT || '3001'}`),

  /** CORS 允许的前端域名（多个用逗号分隔，* 表示允许所有） */
  corsOrigin: process.env.CORS_ORIGIN || '*',

  /** SMTP 邮件配置 */
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  /** Redis 连接配置 */
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  },
};
