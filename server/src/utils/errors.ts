/**
 * 自定义错误类
 * 统一错误码体系，参考 backend-design.md 附录 A
 */

export class AppError extends Error {
  public code: number;
  public httpStatus: number;

  constructor(code: number, message: string, httpStatus: number = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** 20001 - 邮箱未验证，无法执行此操作 */
export class EmailNotVerifiedError extends AppError {
  constructor(msg = '邮箱未验证，无法执行此操作') {
    super(20001, msg, 403);
    this.name = 'EmailNotVerifiedError';
  }
}

/** 20002 - 该局已满员 */
export class GameFullError extends AppError {
  constructor(msg = '该局已满员') {
    super(20002, msg, 409);
    this.name = 'GameFullError';
  }
}

/** 20003 - 当前状态不允许此操作 */
export class InvalidStateError extends AppError {
  constructor(msg = '当前状态不允许此操作') {
    super(20003, msg, 409);
    this.name = 'InvalidStateError';
  }
}

/** 20004 - 发起人不能退出自己的局 */
export class HostCannotLeaveError extends AppError {
  constructor(msg = '发起人不能退出，请取消该局') {
    super(20004, msg, 409);
    this.name = 'HostCannotLeaveError';
  }
}

/** 20005 - 已开始的局不可取消 */
export class CannotCancelInProgressError extends AppError {
  constructor(msg = '已开始的局不可取消') {
    super(20005, msg, 409);
    this.name = 'CannotCancelInProgressError';
  }
}

/** 20006 - 只能结束进行中的局 */
export class NotInProgressError extends AppError {
  constructor(msg = '只能结束进行中的局') {
    super(20006, msg, 409);
    this.name = 'NotInProgressError';
  }
}

/** 20007 - 你已在该局中 */
export class AlreadyJoinedError extends AppError {
  constructor(msg = '你已在该局中') {
    super(20007, msg, 409);
    this.name = 'AlreadyJoinedError';
  }
}

/** 20000 - 参数校验错误 */
export class ValidationError extends AppError {
  constructor(msg = '参数校验失败') {
    super(20000, msg, 400);
    this.name = 'ValidationError';
  }
}

/** 20008 - 你不在该局中 */
export class NotMemberError extends AppError {
  constructor(msg = '你不在该局中') {
    super(20008, msg, 409);
    this.name = 'NotMemberError';
  }
}

/** 404 - 资源不存在 */
export class NotFoundError extends AppError {
  constructor(msg = '资源不存在') {
    super(40401, msg, 404);
    this.name = 'NotFoundError';
  }
}

/** 403 - 无权限 */
export class ForbiddenError extends AppError {
  constructor(msg = '无权限执行此操作') {
    super(40301, msg, 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * 非法状态转换错误（用于 transitionGame 内部校验）
 */
export class InvalidTransitionError extends AppError {
  constructor(msg: string) {
    super(20003, msg, 409);
    this.name = 'InvalidTransitionError';
  }
}
