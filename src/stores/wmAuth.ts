import { defineStore } from "pinia";
import { BASE, LS_AUTH, LS_GAME_TOKEN, LS_WSKEY } from "@/utils/dgProto";
import type { AuthInfo } from "@/utils/dgProto";

interface State {
  auth: AuthInfo | null; //登录信息
  gameToken: string; //游戏token
  loginResp: any | null; //登录得到的信息
  enterResp: any | null; //进入游戏得到的信息
}

export const useWmAuthStore = defineStore("wmAuth", {
  state: (): State => ({
    auth: null,
    gameToken: "",
    loginResp: null,
    enterResp: null,
  }),
  actions: {
    loadFromLocal() {
      try {
        const a = localStorage.getItem(LS_AUTH);
        if (a) this.auth = JSON.parse(a);
      } catch {}
      const gt = localStorage.getItem(LS_GAME_TOKEN);
      if (gt) this.gameToken = gt;
    },
    buildAuthHeaders(auth: AuthInfo) {
      const h: Record<string, string> = {};
      h[auth.tokenHeader] = auth.tokenPrefix + auth.accessToken;
      return h;
    },
    saveAuth(loginData: any): AuthInfo {
      const rs = loginData?.resultSet || {};
      const auth: AuthInfo = {
        tokenHeader: rs.tokenHeader || "Authorization",
        tokenPrefix: rs.tokenPrefix || "Bearer_",
        accessToken: rs.accessToken || "",
      };
      if (!auth.accessToken) throw new Error("未获取到 accessToken");
      localStorage.setItem(LS_AUTH, JSON.stringify(auth));
      this.auth = auth;
      return auth;
    },
    async login(userName: string, password: string) {
      const res = await fetch(`${BASE}/member/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${res.statusText} - ${JSON.stringify(data)}`
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
        throw new Error("本地没有 accessToken，请先登录");

      const res = await fetch(`${BASE}/game/enterGame`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
          `HTTP ${res.status} ${res.statusText} - ${JSON.stringify(data)}`
        );
      }
      const url = data?.resultSet;
      if (url && typeof url === "string") {
        const u = new URL(url);
        const gameToken = u.searchParams.get("token") || "";
        if (gameToken) {
          this.gameToken = gameToken;
          localStorage.setItem(LS_GAME_TOKEN, gameToken);
        }
      }
      return data;
    },
  },
});
