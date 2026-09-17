/** 统一业务错误：带机器可读 code，API 层转为 { code, error } 响应 */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
