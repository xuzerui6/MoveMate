/**
 * 学校开关的「站立状态」维护（组局可用 与 注册开放 解耦）。
 *
 * 背景：吉林体育学院（code=jlsu）按产品定位「只挂列表、暂不开放注册」，
 * 但它的内测账号需要能在自己学校里组局。旧实现把两件事绑死在
 * campuses.is_active 上（没有启用校区 ⇔ 注册关闭），导致吉体账号
 * 要么哪儿都组不了局、要么一启用校区注册就跟着开放。
 *
 * 解耦后：
 * - campuses/venues.is_active 只表示「组局能不能用这个校区/场地」；
 * - schools.registration_open 才是注册开关（注册、改资料换校都只看它）。
 *
 * 下面这组 UPDATE 是吉体当前站立状态的唯一事实来源，Node 启动与
 * Durable Object 启动/导入 open 时都会幂等重跑（与 seedSchoolRegistry
 * 同一模式；空库直接跳过，不挡快照导入）。将来要开放吉体注册时，
 * 改这里的 registration_open 目标值并同步种子即可。
 */
export const JLSU_REGISTRATION_OPEN = 0;

/** 临河校区健身馆的规范运动类型（种子常量之外的存量行靠这里纠正） */
export const JLSU_LINHE_GYM_SPORT_TYPES = '["fitness","basketball","volleyball","badminton","dance","taekwondo"]';

/**
 * 幂等维护语句：只动 code='jlsu' 的学校及其校区/场地，吉大不受影响。
 * 调用前必须保证 schools.registration_open 列已存在（schema/upgradeColumns），
 * 且 schools 表非空（空库跳过，避免污染快照导入的空库校验）。
 */
export const SCHOOL_GATE_SQL: string[] = [
  `UPDATE schools SET registration_open = ${JLSU_REGISTRATION_OPEN} WHERE code = 'jlsu' AND registration_open != ${JLSU_REGISTRATION_OPEN}`,
  `UPDATE campuses SET is_active = 1 WHERE school_id = (SELECT id FROM schools WHERE code = 'jlsu') AND is_active != 1`,
  `UPDATE venues SET is_active = 1 WHERE school_id = (SELECT id FROM schools WHERE code = 'jlsu') AND is_active != 1`,
  `UPDATE venues SET sport_types = '${JLSU_LINHE_GYM_SPORT_TYPES}' WHERE school_id = (SELECT id FROM schools WHERE code = 'jlsu') AND name = '临河校区健身馆' AND sport_types != '${JLSU_LINHE_GYM_SPORT_TYPES}'`,
];
