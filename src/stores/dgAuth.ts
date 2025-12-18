import { defineStore } from 'pinia';
import {
    BASE,
    LS_AUTH,
    LS_GAME_TOKEN,
    LS_WSKEY,
} from '@/utils/dgProto';
import type { AuthInfo } from '@/utils/dgProto';

interface State {
    auth: AuthInfo | null;
    gameToken: string;
    bundleUrl: string;
    gameVersion: string;
    wskey: string;
    loginResp: any | null;
    enterResp: any | null;
    wskeyResp: string;
    userName: string;
}

export const useAuthStore = defineStore('dgAuth', {
    state: (): State => ({
        auth: null,
        gameToken: '',
        bundleUrl: '',
        gameVersion: '',
        wskey: '',
        loginResp: null,
        enterResp: null,
        wskeyResp: '',
        userName: '',
    }),
    actions: {
        loadFromLocal() {
            try {
                const a = localStorage.getItem(LS_AUTH);
                if (a) this.auth = JSON.parse(a);
            } catch { }
            const gt = localStorage.getItem(LS_GAME_TOKEN);
            if (gt) this.gameToken = gt;
            const wk = localStorage.getItem(LS_WSKEY);
            if (wk) this.wskey = wk;
        },
        saveAuth(loginData: any): AuthInfo {
            const rs = loginData?.resultSet || {};
            const auth: AuthInfo = {
                tokenHeader: rs.tokenHeader || 'Authorization',
                tokenPrefix: rs.tokenPrefix || 'Bearer_',
                accessToken: rs.accessToken || '',
            };
            if (!auth.accessToken) throw new Error('未获取到 accessToken');
            localStorage.setItem(LS_AUTH, JSON.stringify(auth));
            this.auth = auth;
            return auth;
        },
        buildAuthHeaders(auth: AuthInfo) {
            const h: Record<string, string> = {};
            h[auth.tokenHeader] = auth.tokenPrefix + auth.accessToken;
            return h;
        },
        async login(userName: string, password: string) {
            this.userName = userName
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
            this.loginResp = data;
            this.saveAuth(data);
            return data;
        },
        async enterGame(body: {
            code: string;
            gamerCode: string;
            providerCode: string;
            live: boolean;
            html: boolean;
        }) {
            if (!this.auth?.accessToken)
                throw new Error('本地没有 accessToken，请先登录');

            const res = await fetch(`${BASE}/game/enterGame`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.buildAuthHeaders(this.auth),
                },
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
            const url = data?.resultSet;
            if (url && typeof url === 'string') {
                const u = new URL(url);

                // ✅ 保存 host 给 bundleUrl 用
                const host = u.host || '';
                if (host) {
                    this.bundleUrl = host;
                }

                const gameToken = u.searchParams.get('token') || '';
                if (gameToken) {
                    this.gameToken = gameToken;
                    localStorage.setItem(LS_GAME_TOKEN, gameToken);
                }
            }
            return data;
        },

        async fetchGameVersion() {
            const bundleUrl = this.bundleUrl
            if (!bundleUrl) throw new Error('bundleUrl 为空，无法获取版本号');

            const base = bundleUrl.startsWith('http') ? bundleUrl : `https://${bundleUrl}`;
            const url = `${base}/ddnewpc/index.js`;

            const res = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
            });

            if (!res.ok) {
                const t = await res.text().catch(() => '');
                throw new Error(`获取版本失败 HTTP ${res.status} ${res.statusText} ${t}`);
            }

            // ✅ 更稳：无论展示成“图片/对象”，都先按二进制取回来再解码成文本
            const buf = await res.arrayBuffer();
            const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));

            // 兼容：var/let/const + 单/双引号
            const m = text.match(/\bgameVersion\b\s*=\s*["']([^"']+)["']/);
            const ver = m?.[1] || '';

            if (!ver) throw new Error('未在 index.js 中找到 gameVersion');

            this.gameVersion = ver;
            return ver;
        },
        async fetchWsKey() {
            const bundleUrl = `https://${this.bundleUrl}/ddnewpc/${this.gameVersion}/js/bundle.js`;
            const res = await fetch(bundleUrl);
            const text = await res.text();

            const m = text.match(/t\.wskey\s*=\s*"([^"]+)"/);
            if (!m) throw new Error('未匹配到 t.wskey');

            let wskey = m[1]!;

            wskey = wskey.replace(/\\\\u/g, '\\u');

            // ✅ 解码 \uXXXX -> 实际字符
            wskey = wskey.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16))
            );

            localStorage.setItem(LS_WSKEY, wskey);
            this.wskey = wskey;
            this.wskeyResp = wskey;
            return wskey;
        }
    },
});
