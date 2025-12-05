// src/stores/wmWs.ts
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/auth";
import type {
    WmDtBetLimitSelectID,
    WmWsMessage,
    WmHallLoginData,
    WmPhpClientPayload,
    WmHallInit35Data,
    WmGameBalanceData,
    WmLeanGroup,
    WmDtNowBet
} from "@/types/wm/ws";



// 将 WM 原始 group 投影成精简结构
function toLeanGroup(raw: any): WmLeanGroup {
    return {
        groupID: raw.groupID,

        tableStatus: raw.tableStatus,
        gameStage: raw.gameStage,

        tableDtExtend: raw.tableDtExtend
            ? {
                singleLimit: raw.tableDtExtend.singleLimit,
                tableMinBet: raw.tableDtExtend.tableMinBet,
            }
            : undefined,

        gameNo: raw.gameNo,
        gameNoRound: raw.gameNoRound,

        dealerID: raw.dealerID,

        betTimeCount: raw.betTimeCount,
        betTimeContent: raw.betTimeContent,
        timeMillisecond: raw.timeMillisecond,
        betTimeReceivedAt: raw.betTimeReceivedAt,

        userCount: raw.onlinePeople ?? raw.userCount,

        historyData: raw.historyData?.resultObjArr
            ? { resultObjArr: raw.historyData.resultObjArr }
            : undefined,

        dealerName: raw.dealerName,
        dealerImage: raw.dealerImage,
        dtNowBet: raw.dtNowBet,
    };
}

/** ================================================ */

export const useWmWsStore = defineStore("wmWs", {
    state: () => ({
        // 基础
        sid: "" as string,
        dtBetLimitSelectID: null as WmDtBetLimitSelectID | null,

        // WS 连接
        hallSocket: null as WebSocket | null, // 15109
        clientSocket: null as WebSocket | null, // 15801
        gameSocket: null as WebSocket | null, // 15101
        phpClientSocket: null as WebSocket | null, // phpclient
        phpPushTimer: null as number | null, // 固定 200ms 推送

        // 定时器
        hallHeartbeatTimer: null as number | null,
        reconnectTimer: null as number | null,

        // phpclient 独立重连（指数退避）
        phpClientReconnectTimer: null as number | null,
        phpClientRetryMs: 1000 as number,
        phpClientMaxRetryMs: 10000 as number,

        // 防重复连 15801 / 15101
        clientAndGameConnected: false,

        // 调试输出
        loginOut: "" as string,
        enterGameOut: "" as string,

        // 自动化模式
        autoMode: false,
        lastUsername: "" as string,
        lastPassword: "" as string,

        /** 仅保留后端需要的字段 */
        game101GroupInfo: [] as WmLeanGroup[],

        /** 15101 protocol=30 最新余额数据 */
        balanceData: null as WmGameBalanceData | null,
        betSerialNumber: 1 as number, // 每次下注自增，用于 betSerialNumber

        /** 已经发送过进房间(协议 10) 的 groupID，避免重复发 */
        joinedGroupID: 0 as number,

        // 开发期静音（HMR 期间不重连）
        hmrSilence: false as boolean,
    }),

    getters: {
        hasSid: (state) => !!state.sid,
    },

    actions: {
        /** --- 对外：开启自动模式（页面 onMounted 时调用） --- */
        startAutoFlow(username: string, password: string) {
            this.autoMode = true;
            this.lastUsername = username;
            this.lastPassword = password;
            this.clearReconnectTimer();
            this.autoLoginAndConnect();
        },

        /** --- 对外：停止自动模式 + 清理所有连接 --- */
        stopAutoFlow() {
            this.autoMode = false;
            this.clearReconnectTimer();
            this.disposeAll();
        },

        /** 自动流程：登录 + enterGame + 全链路 WS */
        async autoLoginAndConnect() {
            if (!this.lastUsername || !this.lastPassword) return;

            try {
                await this.httpLogin(this.lastUsername, this.lastPassword);
                await this.enterGameAndConnect();
            } catch (e) {
                this.scheduleReconnect();
                console.error("[WM] autoLoginAndConnect 失败：", e);
            }
        },

        /** HTTP 登录 */
        async httpLogin(username: string, password: string) {
            const authStore = useAuthStore();
            try {
                const res = await authStore.login(username, password);
                this.loginOut =
                    typeof res === "object" ? JSON.stringify(res, null, 2) : String(res ?? "登录成功");
                return res;
            } catch (e: any) {
                this.loginOut = `登录失败：${e?.message ?? String(e)}`;
                throw e;
            }
        },

        /** enterWMGame + 拿 sid + 拉起整个 WS 链路 */
        async enterGameAndConnect() {
            const authStore = useAuthStore();
            try {
                const res = (await authStore.enterWMGame()) as {
                    resCode: string;
                    resDesc: string;
                    resultSet: string;
                };

                this.enterGameOut = JSON.stringify(res, null, 2);

                const urlObj = new URL(res.resultSet);
                const sidValue = urlObj.searchParams.get("sid");
                if (!sidValue) {
                    console.error("未从 resultSet 中解析到 sid");
                    throw new Error("未从 resultSet 中解析到 sid");
                }

                this.sid = sidValue;
                console.log("获取到 sid:", this.sid);

                // 重置状态
                this.clientAndGameConnected = false;
                this.dtBetLimitSelectID = null;

                // 拉起 WS 链路：先连 phpclient，再连大厅
                this.connectPhpClient();
                this.connectHall();
            } catch (e: any) {
                this.enterGameOut = `进入游戏失败：${e?.message ?? String(e)}`;
                throw e;
            }
        },

        /** 连接 phpclient WS：wss://phpclienta.nakiph.xyz/ws/getTableInfos */
        connectPhpClient() {
            if (this.phpClientSocket && this.phpClientSocket.readyState === WebSocket.OPEN) return;

            if (this.phpClientSocket) {
                try {
                    this.phpClientSocket.close();
                } catch { }
            }

            const ws = new WebSocket("wss://phpclienta.nakiph.xyz/ws/getTableInfos");
            this.phpClientSocket = ws;

            ws.onopen = () => {
                console.log("phpclient WS 已连接");
                this.clearPhpClientReconnect();
                this.startPhpPushLoop();
            };

            ws.onerror = (e) => {
                console.error("phpclient WS error", e);
            };

            ws.onclose = () => {
                console.log("phpclient WS 已关闭");
                this.stopPhpPushLoop();
                if (this.autoMode && !this.hmrSilence) {
                    this.schedulePhpClientReconnect();
                }
            };
        },

        /** phpclient 指数退避重连 */
        schedulePhpClientReconnect() {
            if (!this.autoMode) return;
            if (this.phpClientReconnectTimer !== null) return;

            const delay = this.phpClientRetryMs;
            console.log(`[phpclient] ${delay}ms 后尝试重连...`);
            this.phpClientReconnectTimer = window.setTimeout(() => {
                this.phpClientReconnectTimer = null;
                this.phpClientRetryMs = Math.min(this.phpClientRetryMs * 2, this.phpClientMaxRetryMs);
                this.connectPhpClient();
            }, delay) as unknown as number;
        },

        clearPhpClientReconnect() {
            if (this.phpClientReconnectTimer !== null) {
                window.clearTimeout(this.phpClientReconnectTimer);
                this.phpClientReconnectTimer = null;
            }
            this.phpClientRetryMs = 1000;
        },

        /** 固定 200ms 推送 */
        startPhpPushLoop() {
            if (this.phpPushTimer !== null) {
                window.clearInterval(this.phpPushTimer);
                this.phpPushTimer = null;
            }

            this.phpPushTimer = window.setInterval(() => {
                if (!this.phpClientSocket || this.phpClientSocket.readyState !== WebSocket.OPEN) return;
                if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) return;

                // ✅ 只推 tableStatus === 1 的桌子
                const filtered = this.game101GroupInfo.filter(
                    g => (g.tableStatus) === 1
                );
                if (filtered.length === 0) return;

                const payload = { type: "wmGameTableInfos", data: filtered };
                try { this.phpClientSocket.send(JSON.stringify(payload)); } catch (err) {
                    console.error("推送过滤后的 game101GroupInfo 失败:", err);
                }
            }, 200) as unknown as number;
        },

        /** 停止推送 */
        stopPhpPushLoop() {
            if (this.phpPushTimer !== null) {
                window.clearInterval(this.phpPushTimer);
                this.phpPushTimer = null;
            }
        },

        /** 连接大厅 WS：wss://wmgs.szlehuo.com/15109 */
        connectHall() {
            if (!this.sid) {
                console.warn("没有 sid，不能连接大厅 15109");
                return;
            }

            if (this.hallSocket) this.hallSocket.close();
            if (this.hallHeartbeatTimer !== null) {
                window.clearInterval(this.hallHeartbeatTimer);
                this.hallHeartbeatTimer = null;
            }

            const ws = new WebSocket("wss://wmgs.szlehuo.com/15109");
            this.hallSocket = ws;

            ws.onopen = () => {
                console.log("大厅 15109 WS 已连接");

                // 登录
                ws.send(
                    JSON.stringify({
                        protocol: 1,
                        data: {
                            sid: this.sid,
                            dtBetLimitSelectID: {},
                            bGroupList: false,
                            videoName: "TC",
                            videoDelay: 3000,
                            userAgent: navigator.userAgent,
                        },
                    }),
                );
                console.log("大厅 15109 已发送登录 protocol=1");

                // 初始化
                ws.send(JSON.stringify({ protocol: 35, data: { type: -1 } }));
                console.log("大厅 15109 已发送初始化 protocol=35");

                // 心跳 115（101）
                const sendHeartbeat = () => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ protocol: 115, data: { gameID: 101 } }));
                    }
                };
                sendHeartbeat();
                this.hallHeartbeatTimer = window.setInterval(sendHeartbeat, 10_000) as unknown as number;
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data) as WmWsMessage;

                    if (msg.protocol === 0) {
                        const data = msg.data as WmHallLoginData;
                        if (data?.dtBetLimitSelectID) {
                            this.dtBetLimitSelectID = data.dtBetLimitSelectID;
                            if (!this.clientAndGameConnected) {
                                this.connectClient();
                                this.connectGame();
                                this.clientAndGameConnected = true;
                            }
                        }
                    } else if (msg.protocol === 35) {
                        const data = msg.data as WmHallInit35Data;

                        // 只取 101，并投影成精简结构
                        const game101 = data.gameArr?.find((g) => g.gameID === 101);
                        if (game101 && Array.isArray(game101.groupArr)) {
                            this.game101GroupInfo = game101.groupArr.map((g: any) => {
                                const lean = toLeanGroup(g);
                                return {
                                    ...lean,
                                    betTimeReceivedAt: Date.now(),
                                    userCount: g.onlinePeople ?? lean.userCount,
                                };
                            });
                        } else {
                            this.game101GroupInfo = [];
                        }

                        // 首包也推一次（精简后的数组）
                        if (this.phpClientSocket && this.phpClientSocket.readyState === WebSocket.OPEN) {
                            // ✅ 只发 tableStatus === 1 的
                            const filtered = this.game101GroupInfo.filter(
                                g => (g.tableStatus) === 1
                            );
                            if (filtered.length) {
                                const payload: WmPhpClientPayload = { type: "wmGameTableInfos", data: filtered };
                                try { this.phpClientSocket.send(JSON.stringify(payload)); } catch { }
                            }
                        }
                    } else {
                        // 其他协议按需
                    }
                } catch (e) {
                    console.error("解析大厅 15109 WS 消息失败", e, event.data);
                }
            };

            ws.onerror = (e) => {
                console.error("大厅 15109 WS error", e);
            };

            ws.onclose = () => {
                console.log("大厅 15109 WS 已关闭");
                if (this.hallHeartbeatTimer !== null) {
                    window.clearInterval(this.hallHeartbeatTimer);
                    this.hallHeartbeatTimer = null;
                }
                this.handleWsClosed("hall");
            };
        },

        /** 连接客户端验证 WS：wss://wmgs.szlehuo.com/15801 */
        connectClient() {
            if (!this.sid || !this.dtBetLimitSelectID) {
                console.warn("缺 sid 或 dtBetLimitSelectID，无法连 15801");
                return;
            }

            if (this.clientSocket) this.clientSocket.close();

            const ws = new WebSocket("wss://wmgs.szlehuo.com/15801");
            this.clientSocket = ws;

            ws.onopen = () => {
                console.log("客户端验证 15801 WS 已连接");

                const body = {
                    protocol: 1,
                    data: {
                        sid: this.sid,
                        dtBetLimitSelectID: this.dtBetLimitSelectID,
                        bGroupList: true,
                        videoName: "TC",
                        videoDelay: 3000,
                        userAgent: navigator.userAgent,
                    },
                };

                ws.send(JSON.stringify(body));
                console.log("15801 已发送登录 protocol=1");
            };

            ws.onerror = (e) => {
                console.error("15801 WS error", e);
            };

            ws.onclose = () => {
                console.log("15801 WS 已关闭");
            };
        },

        /** 连接游戏厅 WS：wss://wmgs.szlehuo.com/15101 */
        connectGame() {
            if (!this.sid || !this.dtBetLimitSelectID) {
                console.warn("缺 sid 或 dtBetLimitSelectID，无法连 15101");
                return;
            }

            if (this.gameSocket) this.gameSocket.close();

            const ws = new WebSocket("wss://wmgs.szlehuo.com/15101");
            this.gameSocket = ws;

            ws.onopen = () => {
                console.log("游戏厅 15101 WS 已连接");

                const body = {
                    protocol: 1,
                    data: {
                        sid: this.sid,
                        dtBetLimitSelectID: { 101: this.dtBetLimitSelectID![101] }, // 只传 101
                        bGroupList: false,
                        videoName: "TC",
                        videoDelay: 3000,
                        userAgent: navigator.userAgent,
                    },
                };

                ws.send(JSON.stringify(body));
                console.log("15101 已发送登录 protocol=1");
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data); // { protocol, data }
                    this.handleGameMessage(msg);
                } catch (err) {
                    console.error("解析 15101 WS 消息失败：", err, event.data);
                }
            };

            ws.onerror = (e) => {
                console.error("15101 WS error", e);
            };

            ws.onclose = () => {
                console.log("15101 WS 已关闭");
                this.handleWsClosed("game");
            };
        },

        /** 统一处理 15101 游戏 WS 推送 */
        handleGameMessage(msg: { protocol: number; data: any }) {
            switch (msg.protocol) {
                case 20: {
                    const d = msg.data as { gameID: number; groupID: number; gameStage: number };
                    if (d.gameID !== 101) return;
                    const target = this.game101GroupInfo.find((g) => g.groupID === d.groupID);
                    if (!target) return;
                    target.gameStage = d.gameStage;
                    break;
                }

                case 21: {
                    const d = msg.data as any;
                    if (d.gameID !== 101) return;
                    if (!this.game101GroupInfo?.length) return;

                    const idx = this.game101GroupInfo.findIndex((g) => g.groupID === d.groupID);
                    if (idx === -1) return;

                    const oldItem = this.game101GroupInfo[idx]!;
                    const lean = toLeanGroup(d);

                    const newItem: WmLeanGroup = {
                        ...oldItem,

                        groupID: oldItem.groupID,
                        tableStatus: lean.tableStatus ?? oldItem.tableStatus, // ✅ 保留/更新 tableStatus
                        gameStage: 1,

                        tableDtExtend: lean.tableDtExtend ?? oldItem.tableDtExtend,

                        gameNo: lean.gameNo,
                        gameNoRound: lean.gameNoRound,

                        dealerID: lean.dealerID ?? oldItem.dealerID,

                        // 清倒计时，由 38 再覆盖
                        betTimeCount: undefined,
                        betTimeContent: undefined,
                        timeMillisecond: undefined,
                        betTimeReceivedAt: Date.now(),

                        // 在线人数（若 21 有就覆盖）
                        userCount: lean.userCount ?? oldItem.userCount,

                        // 路单保留
                        historyData: oldItem.historyData,
                    };

                    this.game101GroupInfo.splice(idx, 1, newItem);
                    break;
                }

                case 23: {
                    console.log("protocol=23 下注返回:", msg.data);
                    break;
                }

                case 24: {
                    // 发牌对后端必要字段无影响，可忽略或保留你自己的前端用法
                    // 保持空实现，避免噪音
                    break;
                }

                case 25: {
                    // 结算阶段：只需保证阶段同步（其它字段非后端必需）
                    const d = msg.data as { gameID: number; groupID: number };
                    if (d.gameID !== 101) return;
                    const target = this.game101GroupInfo.find((g) => g.groupID === d.groupID);
                    if (!target) return;
                    if (target.gameStage !== 3) target.gameStage = 3;
                    target.tableStatus = target.tableStatus;
                    break;
                }

                case 26: {
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        groupType?: number;
                        historyData: any;
                    };
                    if (d.gameID !== 101) return;
                    const target = this.game101GroupInfo.find((g) => g.groupID === d.groupID);
                    if (!target) return;
                    const resultObjArr = d.historyData?.resultObjArr ?? [];
                    target.historyData = { resultObjArr };
                    break;
                }

                case 30: {
                    this.balanceData = msg.data as WmGameBalanceData;
                    break;
                }

                case 33: {
                    // 实时下注广播
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        dtNowBet: WmDtNowBet;
                    };

                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=33 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const target = this.game101GroupInfo.find(g => g.groupID === d.groupID);
                    if (!target) {
                        // console.warn("protocol=33 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    // 直接整包替换实时下注数据
                    target.dtNowBet = d.dtNowBet;

                    // console.log("protocol=33 实时下注广播，更新 dtNowBet:", d.groupID, d.dtNowBet);
                    break;
                }


                case 38: {
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        betTimeCount: number;
                        betTimeContent: Record<string, any>;
                        timeMillisecond: number;
                    };
                    if (d.gameID !== 101) return;
                    const target = this.game101GroupInfo.find((g) => g.groupID === d.groupID);
                    if (!target) return;
                    target.betTimeCount = d.betTimeCount;
                    target.betTimeContent = d.betTimeContent;
                    target.timeMillisecond = d.timeMillisecond;
                    target.betTimeReceivedAt = Date.now();
                    break;
                }

                case 39:
                case 70:
                    break;

                default:
                    console.log("15101 未知 protocol：", msg.protocol, msg.data);
            }
        },

        /** 任意 WS 关闭时统一处理（自动模式下发起重连） */
        handleWsClosed(which: "hall" | "game") {
            if (this.hmrSilence) return;
            console.log(`[WM] WS closed: ${which}`);
            if (!this.autoMode) return;
            this.scheduleReconnect();
        },

        /** 安排一次重连（固定 3 秒） */
        scheduleReconnect() {
            if (!this.autoMode) return;

            this.clearReconnectTimer();
            console.log("[WM] 3 秒后尝试自动重连...");

            this.reconnectTimer = window.setTimeout(() => {
                this.reconnectTimer = null;

                // ✅ 先把所有旧连接 & 定时器关掉，避免回调干扰
                this.disposeAll();

                // ✅ 走一遍自动登录 + 建链
                this.autoLoginAndConnect();
            }, 3000) as unknown as number;
        },


        clearReconnectTimer() {
            if (this.reconnectTimer !== null) {
                window.clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        },

        /** 手动关闭所有 WS & 定时器 */
        disposeAll() {
            this.hallSocket?.close();
            this.clientSocket?.close();
            this.gameSocket?.close();
            this.phpClientSocket?.close();

            if (this.hallHeartbeatTimer !== null) {
                window.clearInterval(this.hallHeartbeatTimer);
                this.hallHeartbeatTimer = null;
            }

            this.stopPhpPushLoop();
            this.clearPhpClientReconnect();

            this.clientAndGameConnected = false;
            this.joinedGroupID = 0;

            // 如果你希望每次重连都重新拿 sid，可以顺便清一下：
            // this.sid = '';
            // this.dtBetLimitSelectID = null;
        },


        /** 向 15101 发送进房间请求（protocol = 10） */
        enterGroup(groupID: number) {
            if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN) {
                console.warn("[WM] 15101 未连接，无法进房间");
                return;
            }
            if (!this.dtBetLimitSelectID) {
                console.warn("[WM] 没有 dtBetLimitSelectID，无法进房间");
                return;
            }
            if (this.joinedGroupID == groupID) return;

            const body = {
                protocol: 10,
                data: {
                    dtBetLimitSelectID: this.dtBetLimitSelectID,
                    groupID,
                },
            };

            console.log("[WM] 发送进房间请求:", body);

            try {
                this.gameSocket.send(JSON.stringify(body));
                this.joinedGroupID = groupID;
            } catch (e) {
                console.error("[WM] 发送进房间失败:", e);
            }
        },

        /** 下注（发到 15101） */
        placeBet(params: {
            groupID: number;
            gameNo: number;
            gameNoRound: number;
            betArr: { betArea: number; addBetMoney: number }[];
            commission?: number;
        }) {
            if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN) {
                console.warn("[WM] 15101 未连接，无法下注");
                return;
            }

            const { groupID, gameNo, gameNoRound, betArr, commission = 0 } = params;
            if (!betArr || betArr.length === 0) {
                console.warn("[WM] betArr 为空，忽略下注");
                return;
            }

            this.enterGroup(groupID);

            const sn = this.betSerialNumber++;
            const body = {
                protocol: 22,
                data: {
                    betSerialNumber: sn,
                    gameNo,
                    gameNoRound,
                    betArr,
                    commission,
                },
            };

            console.log("[WM] 发送下注:", body);
            try {
                this.gameSocket.send(JSON.stringify(body));
            } catch (e) {
                console.error("[WM] 发送下注失败:", e);
            }
        },
    },
});

// HMR 静音处理
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        const s = useWmWsStore();
        s.hmrSilence = true;
        try {
            s.hallSocket?.close();
            s.clientSocket?.close();
            s.gameSocket?.close();
            s.phpClientSocket?.close();
        } finally {
            // 等新模块接管后再清标记
        }
    });
    import.meta.hot.accept(() => {
        const s = useWmWsStore();
        s.hmrSilence = false;
    });
}
