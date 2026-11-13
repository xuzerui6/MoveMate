/**
 * 密码字段的小工具（纯函数，方便单测）。
 *
 * 2026-11-13 真机事故：同学把分发的密码粘贴进登录框时，首/尾多带了一个看不见的
 * 空格（20 个字符变成 21 个），服务端逐字比对直接拒绝，页面只报「邮箱或密码错误」，
 * 谁也看不出原因。主流登录表单的做法是提交前先把标识类输入的首尾空白裁掉
 * （SSW Rules《Do you trim starting and trailing whitespaces in input fields?》）。
 *
 * 约定：密码提交前只裁掉首尾空白（空格、制表、换行）；中间的空格是用户密码的
 * 一部分，原样保留。登录与注册必须共用同一条规范化规则——注册时裁、登录时不裁
 * （或反过来），都会出现「一边设好的密码另一边进不去」。
 */

/** 提交前规范化密码：只去掉首尾空白，中间内容不动 */
export function normalizePasswordForSubmit(raw: string): string {
  return raw.trim();
}

/**
 * 密码显隐切换按钮的无障碍文案：密码看不见（圆点）时，按钮的作用是「显示密码」；
 * 密码看得见时，按钮的作用是「隐藏密码」。
 */
export function passwordVisibilityToggleLabel(visible: boolean): string {
  return visible ? '隐藏密码' : '显示密码';
}
