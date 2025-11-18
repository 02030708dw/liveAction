// src/types/via/api.ts

/** 所有接口统一的返回格式 */
export interface ApiResponse<T> {
    code: number;
    data: T;
    message: string;
    serverTime: number;
}

/** 登录返回里的 tokenInfo */
export interface ViaTokenInfo {
    vendorId: string;
    vendorPlayerId: string;
    langKey: string;
    currency: string;
    isTipDealer: boolean;
    isTipLiveStreamer: boolean;
    vendorType: string;
}

/** 登录返回里的 data 字段 */
export interface ViaPlayerLoginData {
    token: string;
    tokenIssueAt: number;
    msgToken: string;
    mucPlayerId: string;
    tokenInfo: ViaTokenInfo;
    loginIp: string;
    loginTime: number;
}

/** 登录接口完整返回 */
export type ViaPlayerLoginResp = ApiResponse<ViaPlayerLoginData>;

