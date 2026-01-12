// src/stores/auth.ts
import { defineStore } from 'pinia';

const BASE = 'https://phpclientb.nakibet.xyz';
const LS_AUTH = 'DG_AUTH';
const LS_GAME_TOKEN = 'DG_GAME_TOKEN';

export interface AuthInfo {
    tokenPrefix: string;
    tokenHeader: string;
    accessToken: string;
}

export interface AuthState {
    auth: AuthInfo | null;
    loginResp: any | null;
    enterResp: any | null;
    gameToken: string;
}

export const useAuthStore = defineStore('auth', {
    state: (): AuthState => ({
        auth: loadAuthFromStorage(),
        loginResp: null,
        enterResp: null,
        gameToken: localStorage.getItem(LS_GAME_TOKEN) || '',
    }),

    actions: {
        reloadAuth() {
            this.auth = loadAuthFromStorage();
        },

        /** ✅ 这里专门处理你这份返回结构 */
        saveAuth(payload: any) {
            // 登录接口返回在 resultSet 里
            const rs = payload?.resultSet;
            if (!rs) {
                console.warn('saveAuth: payload 里没有 resultSet', payload);
                this.auth = null;
                localStorage.removeItem(LS_AUTH);
                return;
            }

            const auth: AuthInfo = {
                tokenPrefix: rs.tokenPrefix || '',            // 比如 "Bearer_"
                tokenHeader: rs.tokenHeader || 'Authorization',
                accessToken: rs.accessToken || '',
            };

            this.auth = auth;

            try {
                localStorage.setItem(LS_AUTH, JSON.stringify(auth));
            } catch (e) {
                console.warn('保存 auth 到 localStorage 失败', e);
            }
        },

        /** 用后台返回的 tokenHeader + tokenPrefix 拼出正确的请求头 */
        buildAuthHeaders(authOverride?: AuthInfo) {
            const auth = authOverride || this.auth;
            if (!auth || !auth.accessToken) return {};

            const headerName = auth.tokenHeader || 'Authorization';
            const prefix = auth.tokenPrefix || '';

            // 后台给的是 "Bearer_"，我们就按原样拼：Bearer_ + token
            // 如果你想要 "Bearer token" 再自己改这里
            const value = `${prefix}${auth.accessToken}`;

            return {
                [headerName]: value,
            };
        },

        async login(userName: string, password: string) {
            const res = await fetch(`${BASE}/member/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    `HTTP ${res.status} ${res.statusText} - ${JSON.stringify(data)}`,
                );
            }

            // 建议加上 resCode 判断（可选）
            if (data.resCode && data.resCode !== '000000') {
                throw new Error(`登录失败：${data.resDesc || data.resCode}`);
            }

            this.loginResp = data;
            this.saveAuth(data);   // 👈 这里现在是有实现的了

            return data;
        },

        async enterGame(body: {
            code: string;
            gamerCode: string;
            providerCode: string;
            isCockfighting?: boolean;
            live: boolean;
            html: boolean;
        }) {
            if (!this.auth) {
                throw new Error('本地没有 auth，请先登录');
            }

            const headers = {
                'Content-Type': 'application/json',
                ...this.buildAuthHeaders(this.auth),
            };

            const res = await fetch(`${BASE}/game/enterGame`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    code: body.code,
                    gamerCode: body.gamerCode,
                    providerCode: body.providerCode,
                    live: body.live,
                    isCockfighting: false,
                    html: body.html,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    `HTTP ${res.status} ${res.statusText} - ${JSON.stringify(data)}`,
                );
            }

            this.enterResp = data;

            // 从 resultSet.url 里解析 gameToken（保持你原来的逻辑）
            const url = data?.resultSet;
            if (url && typeof url === 'string') {
                const u = new URL(url);
                const gameToken = u.searchParams.get('token') || '';
                if (gameToken) {
                    this.gameToken = gameToken;
                    localStorage.setItem(LS_GAME_TOKEN, gameToken);
                }
            }

            return data;
        },

        /** VIA 专用：参数固定 */
        async enterViaGame() {
            return this.enterGame({
                code: '1',
                gamerCode: 'Via_PHP',
                providerCode: 'cq9',
                live: true,
                html: false,
            });
        },

        /** VIA 专用：参数固定 */
        async enterWMGame() {
            return this.enterGame({
                code: '1',
                gamerCode: 'WM_PHP',
                providerCode: 'cq9',
                isCockfighting: false,
                live: true,
                html: false,
            });
        },
    },
});

function loadAuthFromStorage(): AuthInfo | null {
    try {
        const raw = localStorage.getItem(LS_AUTH);
        if (!raw) return null;
        return JSON.parse(raw) as AuthInfo;
    } catch {
        return null;
    }
}
