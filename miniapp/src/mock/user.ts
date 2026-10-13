/**
 * 模拟当前登录用户（样例阶段，无真实登录）
 */
export interface MockUser {
  id: number
  nickname: string
  campus: string
  schoolName: string
}

export const MOCK_USER: MockUser = {
  id: 1,
  nickname: '小林',
  campus: '前卫校区',
  schoolName: '吉林大学',
}
