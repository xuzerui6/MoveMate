/**
 * 社交 API（组局社交化一期）：好友 / 申请 / 拉黑 / 举报 / 邀请码 / 社交设置
 * 后端：server/src/routes/social.routes.ts（挂载于 /api/v1）
 */
import client from './client';
import type {
  BlockEntry,
  FriendEntry,
  FriendRequestItem,
  MyInvite,
  PublicUserInfo,
  RecentPartner,
} from '../types';

type Envelope<T> = { data: T };

/** 我的好友列表 */
export async function fetchFriends(): Promise<FriendEntry[]> {
  const res = await client.get('/friends') as unknown as Envelope<{ friends: FriendEntry[] }>;
  return res.data?.friends || [];
}

/** 上次一起运动的人（同过局、还不是好友） */
export async function fetchRecentPartners(): Promise<RecentPartner[]> {
  const res = await client.get('/friends/recent-partners') as unknown as Envelope<{ partners: RecentPartner[] }>;
  return res.data?.partners || [];
}

/** 我收到的待处理好友申请 */
export async function fetchIncomingRequests(): Promise<FriendRequestItem[]> {
  const res = await client.get('/friends/requests') as unknown as Envelope<{ requests: FriendRequestItem[] }>;
  return res.data?.requests || [];
}

/** 发送好友申请（按用户或邀请码；可带一句问候） */
export async function sendFriendRequest(input: {
  userId?: number;
  inviteCode?: string;
  greeting?: string;
  sourceGameId?: number;
}): Promise<void> {
  await client.post('/friends/requests', {
    userId: input.userId,
    inviteCode: input.inviteCode,
    greeting: input.greeting || undefined,
    source_game_id: input.sourceGameId,
  });
}

/** 同意好友申请 */
export async function acceptFriendRequest(requestId: number): Promise<void> {
  await client.post(`/friends/requests/${requestId}/accept`, {});
}

/** 拒绝好友申请（静默，对方不会收到通知） */
export async function rejectFriendRequest(requestId: number): Promise<void> {
  await client.post(`/friends/requests/${requestId}/reject`, {});
}

/** 删除好友（静默） */
export async function deleteFriend(userId: number): Promise<void> {
  await client.delete(`/friends/${userId}`);
}

/** 拉黑（同时解除好友关系，对方不会收到提醒） */
export async function blockUser(userId: number): Promise<void> {
  await client.post('/blocks', { userId });
}

/** 取消拉黑 */
export async function unblockUser(userId: number): Promise<void> {
  await client.delete(`/blocks/${userId}`);
}

/** 我拉黑的人 */
export async function fetchBlocks(): Promise<BlockEntry[]> {
  const res = await client.get('/blocks') as unknown as Envelope<{ blocks: BlockEntry[] }>;
  return res.data?.blocks || [];
}

/** 提交举报（证据由服务端自动带上） */
export async function createReport(input: {
  targetType: 'user' | 'message' | 'game';
  targetId: string | number;
  reason?: string;
}): Promise<void> {
  await client.post('/reports', {
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason || undefined,
  });
}

/** 我的邀请码与邀请链接路径 */
export async function fetchMyInvite(): Promise<MyInvite> {
  const res = await client.get('/users/me/invite') as unknown as Envelope<MyInvite>;
  return res.data;
}

/** 邀请链接落地页：只看邀请人资料，不创建任何东西 */
export async function previewInvite(inviteCode: string): Promise<PublicUserInfo> {
  const res = await client.post('/friends/invite-preview', { inviteCode }) as unknown as Envelope<{ inviter: any }>;
  const inviter = res.data?.inviter;
  return {
    id: String(inviter?.id ?? ''),
    nickname: inviter?.nickname ?? '',
    avatar_url: inviter?.avatar_url ?? '',
    department: inviter?.department ?? '',
    sport_preferences: inviter?.sport_preferences ?? [],
  };
}

/** 谁可以给我发好友申请 */
export async function fetchSocialSettings(): Promise<{ friend_request_scope: 'anyone' | 'played_together' }> {
  const res = await client.get('/users/me/social-settings') as unknown as Envelope<{ friend_request_scope: 'anyone' | 'played_together' }>;
  return res.data;
}

export async function updateSocialSettings(scope: 'anyone' | 'played_together'): Promise<void> {
  await client.put('/users/me/social-settings', { friend_request_scope: scope });
}
