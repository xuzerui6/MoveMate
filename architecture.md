# 《搭个局》系统架构设计 v1.0

> 对应 PRD v2（比赛展示版）| 设计目标：2-3 周可落地的 MVP 架构

---

## 1. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        客户端层 (Client)                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Web SPA (React 18 + TypeScript + Vite)                   │    │
│  │  - 移动端优先响应式布局 (手机浏览器 + PC 均适配)             │    │
│  │  - 邮箱注册/登录                                          │    │
│  │  - Socket.IO 实时通信                                     │    │
│  └────────┬─────────────────────────────────────────────────┘    │
│           │ HTTPS + WSS                                            │
└───────────┼───────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼────────────────────────────────────────┐
│                      Nginx 反向代理                                │
│                /api/* → 后端服务  |  /ws/* → WebSocket              │
│                    静态资源托管 | HTTPS 终止                        │
└──────────────────────────┼────────────────────────────────────────┘
                           │
┌──────────────────────────┼────────────────────────────────────────┐
│                      API 网关 & 业务层                              │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐                │
│  │ REST API     │  │ WebSocket     │  │ 定时任务     │                │
│  │ (Express)    │  │ (Socket.IO)   │  │ (node-cron)  │                │
│  │ - 局 CRUD    │  │ - 聊天消息     │  │ - 状态机推进  │                │
│  │ - 用户模块   │  │ - 实时通知     │  │ - 过期处理    │                │
│  │ - 通知查询   │  │ - 在线状态     │  │ - 自动归档    │                │
│  └──────┬───────┘  └───────┬──────┘  └──────┬───────┘                │
│         │                  │                 │                       │
│         └──────────────────┼─────────────────┘                       │
│                            │                                         │
│  ┌─────────────────────────┼──────────────────────────────────┐     │
│  │                    业务服务层                                │     │
│  │  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │     │
│  │  │ GameService │ │ChatService│ │NotifySvc │ │ AuthService │ │     │
│  │  │ - 局生命周期 │ │- 消息存储 │ │- 推送路由 │ │- 学号认证   │ │     │
│  │  │ - 状态机执行 │ │- 房间管理 │ │- 红点计数 │ │- Token签发  │ │     │
│  │  │ - 人数管理  │ │- 归档关闭 │ │- 模板组装 │ │- 校园校验   │ │     │
│  │  └─────┬──────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘ │     │
│  └────────┼─────────────┼────────────┼───────────────┼───────┘     │
│           │             │            │               │              │
└───────────┼─────────────┼────────────┼───────────────┼──────────────┘
            │             │            │               │
┌───────────┼─────────────┼────────────┼───────────────┼──────────────┐
│           │         数据层           │               │              │
│  ┌────────┴────────┐  ┌─────────────┴───┐  ┌────────┴──────────┐   │
│  │   PostgreSQL     │  │     Redis        │  │   本地文件存储    │   │
│  │  - 用户/局/消息  │  │  - Session缓存   │  │  - 头像图片      │   │
│  │  - 通知/参与者   │  │  - 在线状态      │  │  - 静态资源      │   │
│  │  - 状态机持久化  │  │  - 限流计数器    │  │                  │   │
│  │  - 迁移脚本      │  │  - Pub/Sub桥接   │  │                  │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**各层职责：**

| 层 | 职责 | 关键约束 |
|----|------|---------|
| 客户端层 | UI 渲染、用户交互、本地状态管理、WebSocket 长连接维持 | 小程序主路径，H5 为兜底 |
| 反向代理 | HTTPS 终止、静态资源、路由分发 | 单 Nginx 进程 |
| API 网关 & 业务层 | REST + WebSocket + 定时任务，共享同一进程 | MVP 不过度拆分，一个 Node 进程承载全部 |
| 业务服务 | 领域逻辑封装：局生命周期、聊天、通知、认证 | 每个 Service 为纯逻辑模块，不含 HTTP 细节 |
| 数据层 | 持久化、缓存、文件存储 | PostgreSQL 为主，Redis 做热数据和 Pub/Sub |

---

## 2. 技术架构分层

### 2.1 技术选型总览

```
┌──────────────────────────────────────────────────────┐
│ 层级        │ 技术选型          │ 选型理由           │
├──────────────────────────────────────────────────────┤
│ 前端        │ React 18 + TypeScript│ 生态最成熟、移动端优先  │
│             │ + Vite + Zustand     │ 响应式、比赛链接即用    │
│ 后端运行时   │ Node.js 18 LTS   │ 全栈 JS、生态成熟    │
│ 后端框架    │ Express + TypeScript│ 简单可控、团队熟悉   │
│ WebSocket  │ Socket.IO         │ 自动降级、房间管理    │
│ 关系数据库  │ PostgreSQL 15     │ 状态机需 ACID、      │
│             │                   │ JSONB 存扩展字段     │
│ 缓存/PubSub│ Redis 7           │ Session、在线状态、   │
│             │                   │ 跨进程消息桥接       │
│ 定时任务    │ node-cron         │ 进程内轻量、MVP 够用 │
│ 对象存储    │ 本地文件系统       │ MVP 可本地，          │
│             │                   │ 后续迁移 OSS/COS     │
│ 部署        │ 云服务器 2C4G     │ 腾讯云/阿里云均可     │
│             │ + Nginx + PM2     │ 前端静态文件 + API   │
└──────────────────────────────────────────────────────┘
```

### 2.2 前端架构

#### 路由与页面结构（React Router, 5 个页面）

```
src/
├── pages/
│   ├── Lobby/             首页 · 运动局大厅  (路由: /)
│   │   ├── GameCard.tsx         局卡片列表
│   │   ├── SportFilter.tsx      运动类型筛选栏
│   │   ├── EmptyState.tsx       空状态提示
│   │   └── FAB.tsx              底部"发局"浮动按钮
│   │
│   ├── CreateGame/         发局页  (路由: /create)
│   │   ├── SportPicker.tsx      运动类型选择器
│   │   ├── TimePicker.tsx       时间选择器 (默认今晚7:00)
│   │   ├── LocationPicker.tsx   地点选择器 (预设 + 手动输入)
│   │   ├── PlayerCount.tsx      人数选择器
│   │   └── TagSelector.tsx      标签选择器
│   │
│   ├── GameDetail/         局详情 & 聊天室  (路由: /game/:id)
│   │   ├── GameHeader.tsx       局信息头部
│   │   ├── MemberList.tsx       参与者头像列表
│   │   ├── ChatList.tsx         聊天消息列表 (文字 only)
│   │   ├── ChatInput.tsx        消息输入框 (固定在底部)
│   │   ├── JoinButton.tsx       加入/退出按钮
│   │   └── HostActions.tsx      发起人操作 (取消/确认结束)
│   │
│   ├── Notifications/      通知列表  (路由: /notifications)
│   │   └── NotificationItem.tsx
│   │
│   └── Profile/            个人中心  (路由: /profile)
│       ├── ProfileEditor.tsx    头像 & 昵称编辑
│       ├── CampusVerify.tsx     校园认证状态
│       └── MyGames.tsx          我发起的局 / 我加入的局
│
├── components/             复用组件
│   ├── GameCard/           局卡片
│   ├── SportPicker/        运动类型选择
│   ├── ChatMessage/        聊天消息气泡
│   ├── AvatarGroup/        参与者头像叠放
│   ├── StateBadge/         状态标签
│   ├── EmptyState/         空状态占位图
│   └── CountdownBadge/     倒计时组件
│
├── stores/                 状态管理 (Zustand)
│   ├── authStore.ts        用户登录状态 + JWT Token
│   ├── gameStore.ts        大厅列表 + 筛选状态
│   ├── notificationStore.ts 未读计数 + 通知列表
│   └── socketStore.ts      WebSocket 连接状态
│
├── hooks/                  自定义 Hook
│   ├── useAuth.ts          登录/注册/登出
│   ├── useGames.ts         局列表请求 + 缓存
│   ├── useGameDetail.ts    局详情 + 成员列表
│   ├── useChat.ts          聊天消息收发
│   ├── useNotifications.ts 通知拉取 + 已读
│   └── useSocket.ts        Socket.IO 连接管理
│
├── api/                    网络层封装
│   ├── client.ts           Axios 实例 (JWT 自动注入 + 响应拦截)
│   ├── auth.ts             登录/注册 API
│   ├── games.ts            运动局 CRUD API
│   ├── messages.ts         聊天 API
│   └── notifications.ts    通知 API
│
├── App.tsx                 路由配置 + 全局布局
└── main.tsx                Vite 入口
```

#### 状态管理方案 (Zustand)

```typescript
// stores/authStore.ts
interface AuthStore {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

// stores/gameStore.ts
interface GameStore {
  games: Game[];
  filter: { sportType?: string };
  loading: boolean;
  fetchGames: () => Promise<void>;
  setFilter: (filter: Partial<GameFilter>) => void;
}

// stores/notificationStore.ts
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}
```

不需要 Redux。Zustand 足够轻量，API 简洁，适合 MVP 快速迭代。

#### 网络层封装

```typescript
// api/client.ts
import axios from 'axios';

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
});

// 请求拦截: 自动注入 JWT
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截: 统一错误处理
client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(err);
  }
);

export default client;
```

#### WebSocket 管理

```typescript
// hooks/useSocket.ts
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';

let socket: Socket | null = null;

export function useSocket() {
  const token = useAuthStore((s) => s.token);

  const connect = () => {
    if (socket?.connected) return;
    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification', (data) => {
      useNotificationStore.getState().addNotification(data);
    });

    socket.on('game_update', (data) => {
      useGameStore.getState().updateGame(data.gameId, data.changes);
    });
  };

  const joinRoom = (gameId: string) => {
    socket?.emit('join_room', { gameId });
  };

  const leaveRoom = (gameId: string) => {
    socket?.emit('leave_room', { gameId });
  };

  return { socket, connect, joinRoom, leaveRoom };
}
```

### 2.3 后端架构

#### 服务拆分（MVP 单进程，模块化拆分）

```
server/
├── src/
│   ├── app.ts                 # Express 启动入口
│   ├── config.ts              # 环境变量 & 配置项
│   │
│   ├── routes/                # 路由层 (薄层, 仅做参数校验和响应)
│   │   ├── auth.routes.ts     # POST /auth/login, /auth/verify
│   │   ├── game.routes.ts     # CRUD 运动局
│   │   ├── message.routes.ts  # 聊天记录拉取
│   │   ├── notification.routes.ts # 通知列表/已读
│   │   └── user.routes.ts     # 用户资料
│   │
│   ├── services/              # 业务逻辑层 (核心, 不含 HTTP)
│   │   ├── auth.service.ts    # 登录、Token签发、校园认证
│   │   ├── game.service.ts    # 局CRUD、状态机、人数管理
│   │   ├── chat.service.ts    # 消息存储、房间管理、归档关闭
│   │   ├── notification.service.ts # 通知创建、推送路由、红点计算
│   │   └── user.service.ts    # 用户资料、头像
│   │
│   ├── models/                # 数据访问层 (SQL 封装)
│   │   ├── user.model.ts
│   │   ├── game.model.ts
│   │   ├── participant.model.ts
│   │   ├── message.model.ts
│   │   └── notification.model.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts  # JWT 验证中间件
│   │   ├── rate-limit.ts      # 限流 (Redis-based)
│   │   └── error-handler.ts   # 全局错误处理
│   │
│   ├── websocket/
│   │   ├── index.ts           # Socket.IO 初始化 & 认证
│   │   ├── chat.handler.ts    # 聊天事件处理
│   │   └── notification.handler.ts # 通知推送
│   │
│   ├── cron/
│   │   └── state-machine.cron.ts  # 每分钟检查状态迁移
│   │
│   └── utils/
│       ├── jwt.ts             # JWT 签发 & 校验
│       ├── hash.ts            # 学号哈希
│       ├── validator.ts       # 输入校验
│       └── errors.ts          # 自定义错误类
│
├── migrations/                # 数据库迁移脚本
│   ├── 001_create_users.sql
│   ├── 002_create_games.sql
│   ├── 003_create_participants.sql
│   ├── 004_create_messages.sql
│   └── 005_create_notifications.sql
│
├── package.json
└── tsconfig.json
```

#### API 设计（RESTful，v1）

```
Base URL: /api/v1

认证 (Auth) —— 无需 Token
  POST   /auth/login              # 微信登录: code → JWT
  POST   /auth/verify-student     # 校园认证: 学号 + 校园邮箱验证码

运动局 (Game) —— 需要 Token
  GET    /games                   # 局列表 (筛选: ?sport=basketball&state=recruiting)
                                  #         排序: ?sort=start_time, 分页: ?page=1&size=20)
  POST   /games                   # 创建运动局 { sport, location, startTime, maxParticipants, tag }
  GET    /games/:id               # 局详情 (含参与者列表)
  POST   /games/:id/join          # 加入局
  POST   /games/:id/leave         # 退出局
  POST   /games/:id/cancel        # 取消局 (仅发起人)
  POST   /games/:id/confirm-start # 确认活动已开始 (仅发起人)
  POST   /games/:id/confirm-end   # 确认活动已结束 (仅发起人)

消息 (Message) —— Token
  GET    /games/:id/messages      # 拉取聊天记录 (?before=msg_id 向前翻页)

通知 (Notification) —— Token
  GET    /notifications           # 通知列表 (?page=1)
  POST   /notifications/read-all  # 全部标记已读
  POST   /notifications/:id/read  # 单条已读
  GET    /notifications/unread-count # 未读数

用户 (User) —— Token
  GET    /users/me                # 当前用户信息
  PUT    /users/me                # 更新昵称/头像/院系
  GET    /users/me/games          # 我的局 (created + joined)
```

#### WebSocket 事件定义

```
客户端 → 服务端:
  join_room        { gameId }             # 进入局聊天房间
  leave_room       { gameId }             # 离开房间
  send_message     { gameId, content }    # 发送消息

服务端 → 客户端:
  new_message      { gameId, message }    # 新消息 (推给房间内所有人)
  notification     { notification }       # 新通知 (定向推送)
  game_update      { gameId, changes }    # 局信息变更 (推给房间内所有人)
  member_change    { gameId, userId, action }  # 成员加入/退出 (推给房间)
```

### 2.4 数据层

#### 数据库选型原则

| 需求 | Postgres 胜任 | Redis 补充 |
|------|:---:|:---:|
| 局状态需保证一致性（状态机不可跳步） | ACID 事务 | — |
| 并发加入同一局（防止超员） | `SELECT ... FOR UPDATE` 行锁 | — |
| 聊天消息持久化 | JSONB 可灵活扩展 | — |
| 用户在线状态 | 不合适 | `SETEX user:{id}:online 60` |
| 未读计数 | 可做但没必要 | `INCR notif:{user_id}:unread` |
| 限流（发局/加入频率） | 太重 | `INCR rate:{user}:{action}` + TTL |

#### 核心数据表关系

```
┌──────────┐        ┌──────────────┐        ┌───────────────┐
│  users   │        │    games      │        │  participants │
├──────────┤        ├───────────────┤        ├───────────────┤
│ id (PK)  │───────→│ creator_id(FK)│←───────│ game_id (FK)  │
│ nickname │        │ sport_type    │        │ user_id (FK)  │
│ avatar   │        │ location      │        │ role          │
│ dept     │        │ start_time    │        │ joined_at     │
│ stu_hash │        │ max_parts     │        │ left_at       │
│ email_h  │        │ cur_parts     │        └───────────────┘
│ campus   │        │ state ★       │               │
└──────────┘        │ tag           │               │ user_id (FK)
       │            │ campus        │               │
       │            │ ended_at      │        ┌──────┴────────┐
       │            │ archived_at   │        │  notifications │
       │            │ created_at    │        ├───────────────┤
       │            └───────────────┘        │ id (PK)       │
       │                   │                 │ user_id (FK)  │
       │                   │ game_id (FK)    │ type          │
       │            ┌──────┴────────┐        │ title         │
       │            │   messages    │        │ body          │
       │            ├───────────────┤        │ game_id (FK)  │
       └───────────→│ sender_id(FK) │        │ is_read       │
                    │ game_id (FK)  │        │ created_at    │
                    │ content       │        └───────────────┘
                    │ created_at    │
                    └───────────────┘

★ state 取值范围:
  'recruiting' | 'full' | 'upcoming' | 'in_progress' |
  'ended' | 'archived' | 'cancelled'
```

#### 关键表 DDL 要点

```sql
-- 游戏局表 —— 核心表
CREATE TABLE games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES users(id),
  sport_type      VARCHAR(20) NOT NULL CHECK (
                    sport_type IN ('basketball','badminton','running','fitness','football')
                  ),
  location        VARCHAR(200) NOT NULL,
  start_time      TIMESTAMPTZ NOT NULL,
  max_participants INT NOT NULL CHECK (max_participants >= 2),
  cur_participants INT NOT NULL DEFAULT 1,
  state           VARCHAR(20) NOT NULL DEFAULT 'recruiting',
  tag             VARCHAR(20),
  campus          VARCHAR(100) DEFAULT 'default',  -- 后续多校扩展
  ended_at        TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 核心索引：首页查询
CREATE INDEX idx_games_state_start ON games(state, start_time)
  WHERE state IN ('recruiting', 'full', 'upcoming');

-- 加入操作防超员的关键约束
-- 在 application 层用 SELECT ... FOR UPDATE 锁定行后校验
-- 因为 cur_participants <= max_participants 是跨行条件

-- 参与者表
CREATE TABLE participants (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id   UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  role      VARCHAR(10) NOT NULL DEFAULT 'member'
              CHECK (role IN ('creator', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at   TIMESTAMPTZ,
  UNIQUE (game_id, user_id)
);

-- 消息表 —— 按时间查询，需要复合索引
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL CHECK (char_length(content) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_game_time ON messages(game_id, created_at DESC);
```

---

## 3. 核心模块设计

### 3.1 运动局生命周期管理（状态机实现）

#### 状态定义与转换规则

```
                         ┌──────────────────────────────────────┐
                         │                                      │
                         ▼                                      │
          ┌──────────────────────┐                              │
          │    RECRUITING        │                              │
          │    (招募中)           │                              │
          │  首页展示: 是         │                              │
          │  可加入: 是           │                              │
          └──────┬──────┬────────┘                              │
                 │      │                                        │
    成员加入     │      │ 发起人取消                               │
    未满员       │      │                                        │
                 ▼      ▼                                        │
          ┌──────────┐ ┌──────────┐                              │
          │ RECRUITING│ │CANCELLED │                              │
          │ (有成员)  │ │ (已取消)  │                              │
          └────┬─────┘ └──────────┘                              │
               │                                                  │
    成员加入   │ 人数=上限                                        │
               ▼                                                  │
          ┌──────────┐                                           │
          │  FULL    │                                           │
          │ (已满员)  │                                           │
          │ 首页展示: 否                                          │
          └────┬─────┘                                           │
               │                                                  │
    距开始     │ ≤ 30分钟                                         │
               ▼                                                  │
          ┌──────────┐     有人退出                               │
          │ UPCOMING │ ←────────────────────┐                    │
          │(即将开始) │                      │                    │
          │ 首页展示: 否                     │                    │
          │ 通知: 提醒所有参与者              │                    │
          └────┬─────┘                      │                    │
               │                            │                    │
    时间到     │                            │                    │
               ▼                            │                    │
          ┌───────────┐                     │                    │
          │IN_PROGRESS│                     │                    │
          │ (进行中)   │                     │                    │
          │ 首页展示: 否                     │                    │
          └─────┬─────┘                     │                    │
                │                           │                    │
    发起人确认  │ 或超时12h自动               │                    │
    结束       ▼                            │                    │
          ┌──────────┐                      │                    │
          │  ENDED   │                      │                    │
          │ (已结束)  │    有人退出时不满     │                    │
          │ 聊天: 只读 │ ←──2人→─────────────┘                    │
          └────┬─────┘  回退到RECRUITING                         │
               │                                                  │
     24h后     │                                                  │
               ▼                                                  │
          ┌──────────┐                                           │
          │ ARCHIVED │                                           │
          │ (已归档)  │                                           │
          │ 聊天: 关闭 │                                          │
          └──────────┘                                           │
```

#### 状态机实现方案

采用 **状态表驱动 + Service 层校验** 模式，不引入状态机库：

```typescript
// server/src/services/game.service.ts

// 状态转换白名单 —— 只有此处列出的转换合法
const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  recruiting:  ['recruiting', 'full', 'upcoming', 'cancelled'],
  full:        ['full', 'recruiting', 'upcoming', 'cancelled'],
  upcoming:    ['upcoming', 'recruiting', 'in_progress', 'cancelled'],
  in_progress: ['in_progress', 'ended'],
  ended:       ['ended', 'archived'],
  archived:    [],    // 终态
  cancelled:   [],    // 终态
};

// 核心转换函数
async function transitionGame(gameId: string, to: GameState): Promise<Game> {
  const game = await GameModel.findByIdForUpdate(gameId); // SELECT ... FOR UPDATE
  if (!game) throw new NotFoundError('局不存在');

  // 1. 校验转换合法性
  if (!VALID_TRANSITIONS[game.state].includes(to)) {
    throw new InvalidTransitionError(
      `非法状态转换: ${game.state} → ${to}`
    );
  }

  // 2. 执行转换前的业务校验
  await validateTransition(game, to);

  // 3. 更新数据库
  const updated = await GameModel.updateState(gameId, to);

  // 4. 触发副作用 (通知、WebSocket推送)
  await handleSideEffects(updated, game.state, to);

  return updated;
}

// 加入局的并发安全实现
async function joinGame(gameId: string, userId: string): Promise<void> {
  // 使用数据库事务 + 行锁防止超员
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 锁定该局行
    const { rows } = await client.query(
      'SELECT * FROM games WHERE id = $1 FOR UPDATE', [gameId]
    );
    const game = rows[0];
    if (!game) throw new NotFoundError();
    if (game.state !== 'recruiting' && game.state !== 'upcoming') {
      throw new InvalidStateError('当前状态不可加入');
    }
    if (game.cur_participants >= game.max_participants) {
      throw new FullGameError('局已满员');
    }
    // 检查是否已加入
    const existing = await client.query(
      'SELECT id FROM participants WHERE game_id=$1 AND user_id=$2 AND left_at IS NULL',
      [gameId, userId]
    );
    if (existing.rows.length > 0) throw new AlreadyJoinedError();

    // 加入
    await client.query(
      'INSERT INTO participants (game_id, user_id, role) VALUES ($1,$2,$3)',
      [gameId, userId, 'member']
    );
    // 更新人数
    const newCount = game.cur_participants + 1;
    const newState = newCount >= game.max_participants ? 'full' : game.state;
    await client.query(
      'UPDATE games SET cur_participants=$1, state=$2, updated_at=NOW() WHERE id=$3',
      [newCount, newState, gameId]
    );
    await client.query('COMMIT');

    // 事务完成后触发通知 (不在事务内)
    if (newState === 'full') {
      await onGameFull(gameId);
    }
    await notifyCreator(gameId, userId, 'member_joined');
    await broadcastMemberChange(gameId, userId, 'joined');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

#### 定时任务 (每分钟执行)

```typescript
// server/src/cron/state-machine.cron.ts

export async function tickStateMachine(): Promise<void> {
  const now = new Date();

  // 1. 招募中/已满员 → 即将开始 (距开始 ≤ 30分钟)
  await db.query(`
    UPDATE games SET state = 'upcoming', updated_at = NOW()
    WHERE state IN ('recruiting', 'full')
      AND start_time - INTERVAL '30 minutes' <= $1
      AND start_time > $1
  `, [now]);

  // 包含通知副作用: 查到刚转换的局 → 批量通知参与者

  // 2. 即将开始 → 进行中 (开始时间已到)
  await db.query(`
    UPDATE games SET state = 'in_progress', updated_at = NOW()
    WHERE state = 'upcoming'
      AND start_time <= $1
  `, [now]);

  // 3. 进行中 → 已取消 (超过开始时间30分钟未确认)
  await db.query(`
    UPDATE games SET state = 'cancelled', updated_at = NOW()
    WHERE state = 'in_progress'
      AND start_time + INTERVAL '30 minutes' < $1
      AND ended_at IS NULL
  `, [now]);

  // 4. 已结束 → 已归档 (结束24小时后)
  await db.query(`
    UPDATE games SET state = 'archived', updated_at = NOW()
    WHERE state = 'ended'
      AND ended_at + INTERVAL '24 hours' <= $1
  `, [now]);
}
```

### 3.2 通知系统模块

#### 整体数据流

```
┌──────────┐   事件发生     ┌──────────────┐   路由判断    ┌───────────────┐
│ 业务操作  │ ────────────→ │ Notification │ ───────────→ │  推送分发器    │
│ (加入/退出│              │   Service     │              │               │
│  消息…)   │              │ - 创建通知记录 │              │ - WebSocket?  │
└──────────┘              │ - 组装文案    │              │ - 仅存DB?     │
                          └──────────────┘              └───┬───────┬───┘
                                                     在线  │       │  离线
                                                           ▼       ▼
                                                    ┌────────┐ ┌────────┐
                                                    │SocketIO│ │  DB    │
                                                    │实时推送 │ │持久化   │
                                                    │+ Redis │ │下次登录 │
                                                    │未读计数 │ │再拉取   │
                                                    └────────┘ └────────┘
```

#### 通知类型与文案模板

```typescript
// server/src/services/notification.service.ts

type NotificationType =
  | 'member_joined'    // 有人加入你的局
  | 'member_left'      // 有人退出
  | 'game_starting'    // 局即将开始
  | 'game_cancelled'   // 局已取消
  | 'new_message'      // 局内新消息
  | 'game_full'        // 局已满员
  | 'game_full_rollback' // 满员回退 (有人退出导致重新招募)

const TEMPLATES: Record<NotificationType, { title: string }> = {
  member_joined:       { title: '{userName} 加入了你的{sport}局' },
  member_left:         { title: '{userName} 退出了你的{sport}局' },
  game_starting:       { title: '你加入的{sport}局 30 分钟后开始' },
  game_cancelled:      { title: '你加入的{sport}局已取消' },
  new_message:         { title: '{sport}局有新消息' },
  game_full:           { title: '你的{sport}局已满员' },
  game_full_rollback:  { title: '{userName} 退出了，局已重新展示在首页' },
};
```

#### 推送通道实现

```typescript
// WebSocket 推送 —— 在线用户实时收到
async function pushRealtime(userId: string, notification: Notification): Promise<void> {
  // 从 Redis 获取该用户的活跃 socket 列表
  const socketIds = await redis.smembers(`user:${userId}:sockets`);
  if (socketIds.length === 0) return;

  // 定向推送给该用户的所有连接 (手机 + 可能的多端)
  const io = getIO();
  socketIds.forEach(sid => {
    io.to(sid).emit('notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      gameId: notification.game_id,
      createdAt: notification.created_at
    });
  });
}

// 通知核心函数
async function createAndNotify(
  userId: string,
  type: NotificationType,
  gameId: string,
  context: Record<string, string>
): Promise<void> {
  const title = fillTemplate(TEMPLATES[type].title, context);

  // 1. 写入数据库 (离线也能看到)
  const notif = await NotificationModel.create({
    userId, type, title, gameId,
    body: JSON.stringify(context)  // 后续扩展结构化数据
  });

  // 2. Redis 未读计数 +1
  await redis.incr(`notif:${userId}:unread`);

  // 3. 尝试实时推送
  await pushRealtime(userId, notif);
}
```

#### 消息去重与聚合策略

MVP 阶段采用简单策略：

| 场景 | 策略 |
|------|------|
| 同一局的连续新消息 | 5 分钟内同局的 `new_message` 通知只发一次，内容为"有 N 条新消息" |
| 同一用户的连续进出 | 不做去重（退出和加入是两个独立事件） |
| 重复推送 | 不做去重（通知关联 gameId，客户端按 gameId 合并展示） |

实现方式：Redis key `notif:cooldown:{userId}:{gameId}:new_message` TTL 300秒。

### 3.3 用户认证模块

#### 认证流程

```
┌─────────────────────────────────────────────────────────┐
│                    邮箱注册/登录流程                       │
│                                                         │
│  浏览器端                    服务端                        │
│  ────────                   ──────                       │
│  ① 注册表单                  ② POST /auth/register       │
│     昵称 + 邮箱 + 密码           { nickname, email,        │
│     + 学号                       password, student_id }   │
│     │                          │                         │
│     │                   ③ 校验邮箱唯一性                  │
│     │                      发送验证邮件                   │
│     │                          │                         │
│     │                   ④ POST /auth/verify-email        │
│     │                      { code }                      │
│     │                          │                         │
│     │                   ⑤ 签发 JWT (7天)                 │
│     │                   ⑥ 返回 token + userInfo          │
│     └──── ⑦ 存储 token        │                         │
│            到 Zustand store                                │
│                                                         │
│  ⑧ 后续请求均带 Authorization: Bearer <token>             │
│     服务端 middleware 解析 JWT，注入 req.user             │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  登录流程 (已注册用户):                                    │
│  ① POST /auth/login  { email, password }               │
│  ② 服务端校验 bcrypt 密码 → 签发 JWT                     │
│  ③ 返回 token + userInfo                                │
└─────────────────────────────────────────────────────────┘
```

#### 校园认证方案

```
┌─────────────────────────────────────────────────────────┐
│                    校园认证流程                            │
│                                                         │
│  ① 用户输入: 学号 + 校园邮箱后缀自动补全 (@xxx.edu.cn)     │
│  ② 服务端发送验证码到校园邮箱                              │
│  ③ 用户输入验证码                                         │
│  ④ 服务端校验通过后:                                      │
│     - users.campus_verified = true                       │
│     - users.student_id_hash = SHA256(学号 + salt)        │
│     - users.campus_email_hash = SHA256(邮箱 + salt)       │
│  ⑤ 返回认证成功                                            │
│                                                         │
│  安全考虑:                                                │
│  - 学号不存明文，哈希后存储                                │
│  - 验证码 10 分钟内有效，同一邮箱 1 小时内最多 3 次         │
│  - 一个学号只能绑定一个账号 (通过 UNIQUE 约束)              │
│  - MVP 阶段用户未认证也可以使用 (降低门槛)，但局页面显眼     │
│    位置提示"建议认证，获取更安全的组局体验"                  │
└─────────────────────────────────────────────────────────┘
```

#### JWT Token 设计

```typescript
interface JwtPayload {
  sub: string;        // user.id
  campus?: string;    // 学校标识 (MVP 为空或多校时使用)
  iat: number;        // 签发时间
  exp: number;        // 过期时间 (7天)
}

// Token 刷新策略: MVP 不做 refresh token
// 每次请求时检查过期时间，过期前 1 天内自动续签
// 用户长时间未使用 → 重新登录
```

### 3.4 实时聊天模块

#### 聊天架构

```
┌─────────────────────────────────────────────────────────┐
│                     聊天数据流                            │
│                                                         │
│  ┌──────┐  send_message  ┌──────────┐  save  ┌────────┐ │
│  │ 用户A │ ─────────────→│ Socket.IO│ ─────→│ Postgre│ │
│  │ (在线) │              │ Server   │       │ SQL    │ │
│  └──────┘               └──────────┘       └────────┘ │
│                              │                         │
│                              │ broadcast               │
│                    ┌─────────┼─────────┐               │
│                    ▼         ▼         ▼               │
│               ┌──────┐  ┌──────┐  ┌──────┐             │
│               │ 用户B │  │ 用户C │  │ 用户D │             │
│               │(在线) │  │(在线) │  │(离线) │             │
│               └──────┘  └──────┘  └──────┘             │
│                                        │               │
│                                        │ 下次上线        │
│                                        ▼               │
│                                   GET /messages        │
│                                   拉取历史消息           │
└─────────────────────────────────────────────────────────┘
```

#### 房间管理

```typescript
// server/src/websocket/chat.handler.ts

// 用户进入局详情页 → 加入 Socket.IO room
socket.on('join_room', async ({ gameId }) => {
  const game = await GameService.getGame(gameId);

  // 校验：已归档/已取消的局，不接受新消息
  if (game.state === 'archived' || game.state === 'cancelled') {
    socket.emit('error', { message: '该局已结束，聊天已关闭' });
    return;
  }

  // 校验：已结束的局，只读模式 (可以加入房间收历史消息，但不能发)
  if (game.state === 'ended') {
    socket.join(`game:${gameId}`);
    socket.emit('game_update', { gameId, chatMode: 'readonly' });
    return;
  }

  // 正常房间
  socket.join(`game:${gameId}`);
  socket.emit('game_update', { gameId, chatMode: 'active' });
});

// 发送消息
socket.on('send_message', async ({ gameId, content }) => {
  // 1. 内容校验
  if (!content || content.trim().length === 0) return;
  if (content.length > 500) {
    socket.emit('error', { message: '消息不能超过 500 字' });
    return;
  }

  // 2. 权限校验: 用户必须是该局参与者
  const isMember = await ParticipantModel.isMember(gameId, socket.data.userId);
  if (!isMember) {
    socket.emit('error', { message: '未加入该局，无法发送消息' });
    return;
  }

  // 3. 写入数据库
  const message = await ChatService.saveMessage(gameId, socket.data.userId, content);

  // 4. 广播给房间内所有人 (包括发送者，用于确认)
  io.to(`game:${gameId}`).emit('new_message', {
    id: message.id,
    gameId,
    sender: {
      id: socket.data.userId,
      nickname: socket.data.userName,
      avatar: socket.data.userAvatar
    },
    content: message.content,
    createdAt: message.created_at
  });

  // 5. 触发通知 (有节流)
  await ChatService.notifyGameMembers(gameId, socket.data.userId);
});
```

#### 聊天归档关闭逻辑

```typescript
// 聊天状态随局状态变化

// 局状态 → 聊天行为
const CHAT_RULES: Record<GameState, { canRead: boolean; canSend: boolean }> = {
  recruiting:   { canRead: true,  canSend: true  },
  full:         { canRead: true,  canSend: true  },
  upcoming:     { canRead: true,  canSend: true  },
  in_progress:  { canRead: true,  canSend: true  },
  ended:        { canRead: true,  canSend: false }, // 只读
  archived:     { canRead: false, canSend: false }, // 关闭
  cancelled:    { canRead: false, canSend: false }, // 关闭
};
```

---

## 4. 部署架构

### 4.1 MVP 部署方案（单机，2 天内可搭建）

```
┌─────────────────────────────────────────────────────────────────┐
│                    云服务器 (腾讯云/阿里云 2C4G CentOS 8)          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      Nginx (:443)                        │    │
│  │  - HTTPS (Let's Encrypt 免费证书)                         │    │
│  │  - / → /var/www/dajju/ (前端 SPA 静态文件)                │    │
│  │  - /api/v1/* → proxy_pass http://127.0.0.1:3000          │    │
│  │  - /socket.io/* → proxy_pass http://127.0.0.1:3000       │    │
│  │    (带 Upgrade 头，支持 WebSocket)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                  Node.js App (:3000)                       │  │
│  │  - PM2 cluster mode (2 实例，利用双核)                     │  │
│  │  - Express + Socket.IO 共享同一 HTTP Server                │  │
│  └───────────────────────────┼───────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                  PostgreSQL 15 (:5432)                     │  │
│  │  - 同机部署，数据目录挂载独立云盘 (防系统盘满丢失数据)        │  │
│  │  - 每日 3:00 自动 pg_dump 备份到 /backup/                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Redis 7 (:6379)                          │  │
│  │  - 同机部署，仅本地绑定 (bind 127.0.0.1)                    │  │
│  │  - AOF 持久化开启 (避免重启丢数据)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  成本估算: 云服务器 ~¥100/月 + 云盘 ~¥30/月 = ¥130/月            │
└─────────────────────────────────────────────────────────────────┘

部署命令清单 (一次性设置):

  # 1. 环境安装
  yum install -y nginx postgresql15-server redis7 nodejs18

  # 2. 数据库初始化
  initdb -D /data/pgdata
  pg_ctl -D /data/pgdata start
  createdb dajju
  psql dajju < migrations/*.sql
  # 配置 cron: pg_dump dajju > /backup/dajju_$(date +%Y%m%d).sql

  # 3. 前端构建
  cd /opt/dajju/client
  npm ci
  npm run build
  cp -r dist/* /var/www/dajju/

  # 4. 后端部署
  cd /opt/dajju/server
  npm ci --production
  npm run build
  pm2 start dist/app.js --name dajju -i 2

  # 4. Nginx 配置
  # 见下方 nginx.conf 片段
```

#### Nginx 关键配置

```nginx
server {
    listen 443 ssl http2;
    server_name api.dajju.com;

    ssl_certificate     /etc/letsencrypt/live/api.dajju.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.dajju.com/privkey.pem;

    # 前端静态文件
    location / {
        root /var/www/dajju;
        index index.html;
        try_files $uri $uri/ /index.html;  # SPA fallback
    }

    # API 路由
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;  # 长连接不超时
    }

    # 静态资源
    location /static/ {
        alias /var/www/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4.2 后续扩展路径

```
MVP (单机)                  v1.0 (校内推广)              v2.0 (多校)
────────                    ────────                    ────────
单服务器                     + 应用服务器分离               + API 网关 (Kong)
Node 单进程                   Node × Docker 容器化         服务拆分:
PostgreSQL 单机              + PostgreSQL 读写分离           - game-service
Redis 单机                   + Redis Sentinel 高可用        - chat-service
本地文件存储                  + 腾讯云 COS 对象存储          - notify-service
手动部署                     + CI/CD (GitHub Actions)       - user-service
                             + 监控 (Prometheus+Grafana)   + 消息队列 (RabbitMQ)
                                                        + 独立搜索服务 (ES)
                                                        多校数据隔离层
```

---

## 5. 关键技术风险与应对

### 5.1 实时通知延迟问题

| 风险项 | 描述 | MVP 应对 | 后续优化 |
|--------|------|---------|---------|
| WebSocket 断连 | 浏览器切后台/锁屏后 Socket.IO 被挂起，用户收不到实时通知 | ① Socket.IO 自动重连 + 心跳 (pingInterval: 25000) ② 页面 visibilitychange 时主动 GET /notifications/unread-count 补漏 ③ 小红点兜底：用户一定能在通知 tab 看到漏掉的通知 | 后续考虑 PWA Service Worker + Web Push API |
| PM2 多实例 | Cluster mode 下两个 Node 进程，Socket.IO 房间状态不共享 | 使用 Redis Adapter 让 Socket.IO 跨进程通信：`socket.io-adapter-redis` 包一行配置搞定 | 升级到独立 Socket 服务 |
| 通知风暴 | 群里 8 个人同时发消息 → 8 轮 pushRealtime → 64 次 emit | 节流：同一局 5 分钟内只在第一次发 `new_message` 通知 (Redis key TTL 300s) | 消息聚合服务 |

### 5.2 冷启动空数据问题

| 风险项 | 描述 | 应对方案 |
|--------|------|---------|
| 首页空白 | 新用户打开 App 看到空的局列表 → 立即流失 | ① **种子局机制**：运营同学（或种子用户）提前手动创建 5-8 个示例局，设置合理的开始时间，让首页永远不空 ② **空状态文案引导**："还没有局？发起第一个！" + 醒目的发局按钮 ③ **时间敏感默认值**：默认发局时间为"今晚 7:00"，确保创建的局在当天可参与 |
| 种子局管理 | 示例局需要像真的一样运行 | ① 种子局在数据库标记 `is_seed = true` ② 定时任务自动让种子局按正常生命周期流转（到时间推进状态，不需要真实用户参与）③ 运营后台可以批量创建/批量推进种子局 |
| 密度感知 | 用户看到某个局只有 1 人（发起人），不愿意加入 | ① 首页排序：即将开始 > 人数多的优先 ② 卡片文案优化：不说"1/5人"，而是"缺4人，等你加入" ③ 只有发起人的局 30 分钟内没有被加入，自动取消，不长期挂着 |

### 5.3 多校扩展数据隔离方案

| 阶段 | 方案 | 说明 |
|------|------|------|
| MVP（单校） | 无隔离，`campus` 字段默认 `'default'` | 所有数据同库同表，查询不过滤 campus |
| v1.0（3-5 校） | 共享数据库 + `campus` 字段过滤 | 所有接口查询自动加 `WHERE campus = $currentUser.campus`。Auth middleware 从 JWT 中读取 campus 注入 req.user。首页局列表只展示本校的局。用户只能加入本校的局。 |
| v2.0（多城） | 共享数据库 + Schema 级别隔离 (可选) | 如果某些学校需要独立部署（如国外学校合规要求），通过 PostgreSQL Schema 或独立数据库实例隔离。引入 `campus_resolver` 中间件，根据请求域名或 JWT claims 动态路由到对应数据源。 |

#### v1.0 多校隔离的具体实现

```typescript
// middleware/campus.middleware.ts
// 在 auth middleware 之后执行，自动注入 campus 过滤

function campusFilter(req, res, next) {
  // 从 JWT 解析的 user 中获取 campus
  const campus = req.user?.campus;
  if (!campus) {
    return res.status(403).json({ error: '未绑定校园' });
  }
  // 注入到 request context，后续所有查询自动使用
  req.campus = campus;
  next();
}

// 所有 games 相关查询自动带 campus 条件
// game.model.ts
async function listGames(campus: string, filters: any) {
  return db.query(
    'SELECT * FROM games WHERE campus = $1 AND state = $2 ORDER BY ...',
    [campus, filters.state]
  );
}
```

**为什么不用独立数据库？**

对于 3-5 所学校、日活千人的规模，单 PostgreSQL 实例完全能支撑（PostgreSQL 单表千万级数据无性能问题）。独立数据库带来的运维复杂度（多实例管理、跨校查询困难、迁移脚本多库执行）远大于收益。共享数据库 + campus 字段是这种规模下的最优解。

### 5.4 其他风险速览

| 风险 | 等级 | 应对 |
|------|:---:|------|
| 浏览器兼容性 | 低 | 移动端优先，测试 Chrome/Safari/微信内置浏览器。使用 Vite + autoprefixer 自动处理 CSS 兼容 |
| 并发加入超员 | 高 | `SELECT ... FOR UPDATE` 行锁 + 事务内校验 cur_participants < max_participants |
| 时区问题 | 低 | 所有时间统一存 TIMESTAMPTZ，前端展示时转本地时区 |
| 密码学安全 | 低 | 学号仅存哈希 (SHA256 + salt)，原始学号不落盘 |
| XSS/注入 | 中 | 输入校验: 昵称 ≤ 20 字，消息 ≤ 500 字，所有查询用参数化 SQL (`$1`, `$2`) |

---

## 附录 A：开发阶段排期建议（2 周）

```
Week 1                          Week 2
────────                        ────────
Day 1-2: 项目初始化              Day 6-7: 聊天模块 + WebSocket
  - DB 建表 + 迁移脚本             - Socket.IO 集成
  - Express 脚手架                 - 消息收发 + 存储
  - 用户认证 (邮箱注册/登录)         - 通知系统实现
  - React + Vite 项目搭建
                                  Day 8-9: 前端页面开发
Day 3-4: 局 CRUD + 状态机          - 首页大厅 + 局卡片
  - 发局/列表/详情 API              - 发局页面
  - 加入/退出 API                  - 局详情 + 聊天页面
  - 状态机 + 定时任务
                                Day 10-11: 联调 + 打磨
Day 5: 联调 + 部署                 - 通知列表 + 个人中心
  - 首页列表前后端联调              - 种子局填充 + 演示准备
  - Nginx + 云服务器部署           - 响应式适配测试
                                Day 12-14: 测试 + 修复
```

## 附录 B：关键环境变量清单

```bash
# server/.env.example
PORT=3000
NODE_ENV=production

# PostgreSQL
DATABASE_URL=postgresql://dajju:password@127.0.0.1:5432/dajju

# Redis
REDIS_URL=redis://127.0.0.1:6379

# JWT
JWT_SECRET=<random-64-char-string>
JWT_EXPIRES_IN=7d

# 邮箱验证码 (校园认证)
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=noreply@dajju.com
SMTP_PASS=<password>

# 学生ID哈希盐值
STUDENT_ID_SALT=<random-32-char-string>
```
