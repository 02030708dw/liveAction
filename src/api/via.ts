// src/api/via.ts
import { viaRequest } from '@/utils/via';
import type {
    ViaPlayerLoginResp,
    ViaPlayerLoginData,
} from '@/types/via/api';

/**
 * 步骤1：登录
 * 返回值直接是 data 字段（已经过 code 检查）
 */
export async function apiLogin(
    bodyToken: string,
    authToken?: string,
): Promise<ViaPlayerLoginData> {
    const resp = await viaRequest.post<ViaPlayerLoginResp>(
        '/player/login',
        { token: bodyToken },
        {
            headers: authToken
                ? { Authorization: authToken }
                : undefined,
        },
    );

    const res = resp.data;

    if (res.code !== 0) {
        throw new Error(res.message || 'Login failed');
    }

    return res.data;
}
