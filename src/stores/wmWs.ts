// src/stores/wmWs.ts
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/auth";
import CryptoJS from "crypto-js";

import type {
    WmDtBetLimitSelectID,
    WmWsMessage,
    WmHallLoginData,
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

        userCount: raw.userCount,

        historyData: raw.historyData?.resultObjArr
            ? { resultObjArr: raw.historyData.resultObjArr }
            : undefined,

        dealerName: raw.dealerName,
        dealerImage: raw.dealerImage,
        dtNowBet: raw.dtNowBet,

        cardsArr: raw.cardsArr || [0, 0, 0, 0, 0, 0]
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

        // 大厅心跳
        hallHeartbeatTimer: null as number | null,

        // 防重复连 15801 / 15101
        clientAndGameConnected: false,

        // 调试输出
        loginOut: "" as string,
        enterGameOut: "" as string,

        // 自动化模式（只用于首连）
        autoMode: false,
        lastUsername: "" as string,
        lastPassword: "" as string,

        /** 仅保留后端需要的字段 */
        game101GroupInfo: new Map<number, any>() as Map<number, WmLeanGroup & { poker?: any }>,

        /** 15101 protocol=30 最新余额数据 */
        balanceData: null as WmGameBalanceData | null,
        betSerialNumber: 1 as number, // 每次下注自增，用于 betSerialNumber

        /** 已经发送过进房间(协议 10) 的 groupID，避免重复发 */
        joinedGroupID: 0 as number,

        // 开发期静音（HMR 期间不刷新页面）
        hmrSilence: false as boolean,

        phpReconnectTimer: null as number | null, // phpclient 重连定时器

        debugEnabled: true as boolean,
        debugLines: [] as string[],
        debugMaxLines: 300 as number,
        focusGroupID: 3 as number,   // 0 表示不过滤；>0 表示只看某桌
    }),

    getters: {
        hasSid: (state) => !!state.sid,
    },

    actions: {
        log(msg: string, groupID: number = 0, payload?: any) {
            if (!this.debugEnabled) return;

            // ✅ 只看某桌：focusGroupID>0 时，不匹配的直接丢弃
            if (this.focusGroupID > 0 && groupID > 0 && groupID !== this.focusGroupID) return;

            const ts = new Date().toLocaleTimeString();
            const gid = groupID > 0 ? ` g=${groupID}` : "";
            const line =
                payload === undefined
                    ? `[${ts}]${gid} ${msg}`
                    : `[${ts}]${gid} ${msg} ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;

            this.debugLines.push(line);

            const max = this.debugMaxLines || 300;
            if (this.debugLines.length > max) {
                this.debugLines.splice(0, this.debugLines.length - max);
            }
        },

        clearLog() {
            this.debugLines = [];
        },

        /** --- 对外：开启自动模式（页面 onMounted 时调用） --- */
        startAutoFlow(username: string, password: string) {
            this.autoMode = true;
            this.lastUsername = username;
            this.lastPassword = password;
            this.autoLoginAndConnect();
        },

        /** --- 对外：停止自动模式 + 清理所有连接 --- */
        stopAutoFlow() {
            this.autoMode = false;
            this.disposeAll();
        },

        /** 自动流程：登录 + enterGame + 全链路 WS（不做重连） */
        async autoLoginAndConnect() {
            if (!this.lastUsername || !this.lastPassword) return;

            try {
                await this.httpLogin(this.lastUsername, this.lastPassword);
                await this.enterGameAndConnect();
            } catch (e) {
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

        /** enterWMGame + 拿 sid + 拉起整个 WM WS 链路 */
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
                this.joinedGroupID = 0;

                // 先连 phpclient，再连大厅
                this.connectPhpClient();
                this.connectHall();
            } catch (e: any) {
                this.enterGameOut = `进入游戏失败：${e?.message ?? String(e)}`;
                throw e;
            }
        },

        /** 连接 phpclient WS：wss://phpclienta.nakiph.xyz/ws/getTableInfos */
        connectPhpClient() {
            // 已经是 open 就不重复连
            if (this.phpClientSocket && this.phpClientSocket.readyState === WebSocket.OPEN) return;

            // 进来就清掉旧的重连定时器，避免叠加
            if (this.phpReconnectTimer !== null) {
                window.clearTimeout(this.phpReconnectTimer);
                this.phpReconnectTimer = null;
            }

            // 如果之前还有 socket，先关掉
            if (this.phpClientSocket) {
                try { this.phpClientSocket.close(); } catch { }
                this.phpClientSocket = null;
            }

            const ws = new WebSocket("wss://phpclienta.nakiph.xyz/ws/getTableInfos");
            this.phpClientSocket = ws;

            ws.onopen = () => {
                console.log("phpclient WS 已连接");

                // 连接成功后，清理重连 timer
                if (this.phpReconnectTimer !== null) {
                    window.clearTimeout(this.phpReconnectTimer);
                    this.phpReconnectTimer = null;
                }

                this.startPhpPushLoop();
            };

            ws.onerror = (e) => {
                console.error("phpclient WS error", e);
            };

            ws.onclose = () => {
                console.log("phpclient WS 已关闭");
                this.stopPhpPushLoop();

                // ✅ 5s 后重连（避免重复创建）
                if (this.phpReconnectTimer !== null) {
                    window.clearTimeout(this.phpReconnectTimer);
                }
                this.phpReconnectTimer = window.setTimeout(() => {
                    this.phpReconnectTimer = null;

                    // 只有当前仍然是断开状态才重连（防止期间你手动 disposeAll 又触发）
                    if (!this.phpClientSocket || this.phpClientSocket.readyState === WebSocket.CLOSED) {
                        this.connectPhpClient();
                    }
                }, 5000) as unknown as number;
            };
        },

        /** 固定 200ms 推送 */
        startPhpPushLoop() {
            if (this.phpPushTimer !== null) {
                window.clearInterval(this.phpPushTimer);
                this.phpPushTimer = null;
            }

            this.phpPushTimer = window.setInterval(() => {
                const ws = this.phpClientSocket;
                if (!ws || ws.readyState !== WebSocket.OPEN) return;
                if (!this.game101GroupInfo || this.game101GroupInfo.size === 0) return;

                const data: any[] = [];
                for (const g of this.game101GroupInfo.values()) {
                    if ((g.tableStatus as any) === 1) {
                        data.push({
                            ...g,
                            liveURL: this.getWmLiveSign(Number((g as any).groupID)),
                        });
                    }
                }
                if (data.length === 0) return;

                try {
                    ws.send(JSON.stringify({ type: "wmGameTableInfos", data }));
                } catch (err) {
                    console.error("推送失败:", err);
                }
            }, 500) as unknown as number;
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

                        const game101 = data.gameArr?.find((g) => g.gameID === 101);
                        const next = new Map<number, any>();

                        if (game101 && Array.isArray(game101.groupArr)) {
                            for (const raw of game101.groupArr) {
                                const lean = toLeanGroup(raw);
                                next.set(lean.groupID, {
                                    ...lean,
                                    betTimeReceivedAt: Date.now(),
                                    userCount: lean.userCount,
                                    // 初始化 poker（可选）
                                    cardsArr: [0, 0, 0, 0, 0, 0],
                                });
                            }
                        }

                        this.game101GroupInfo = next;

                        // 首包也推一次
                        if (this.phpClientSocket && this.phpClientSocket.readyState === WebSocket.OPEN) {
                            const arr: any[] = [];
                            for (const g of this.game101GroupInfo.values()) {
                                if ((g.tableStatus as any) === 1) arr.push(g);
                            }
                            if (arr.length) {
                                try { this.phpClientSocket.send(JSON.stringify({ type: "wmGameTableInfos", data: arr })); } catch { }
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
                this.handleWsClosed("client");
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

                    const target = this.game101GroupInfo.get(d.groupID);
                    if (!target) return;

                    target.gameStage = d.gameStage;

                    // gameStage=2：新一局开始，清牌
                    if (d.gameStage === 2) {
                        target.cardsArr = [0, 0, 0, 0, 0, 0];
                    }
                    break;
                }

                case 21: {
                    const d = msg.data as any;
                    if (d.gameID !== 101) return;

                    const oldItem = this.game101GroupInfo.get(d.groupID);
                    if (!oldItem) return;

                    const lean = toLeanGroup(d);

                    // 关键：不要新建对象/不要 splice，直接就地更新（更省响应式开销）
                    oldItem.tableStatus = lean.tableStatus ?? oldItem.tableStatus;
                    oldItem.tableDtExtend = lean.tableDtExtend ?? oldItem.tableDtExtend;

                    oldItem.gameNo = lean.gameNo;
                    oldItem.gameNoRound = lean.gameNoRound;

                    oldItem.dealerID = lean.dealerID ?? oldItem.dealerID;

                    oldItem.betTimeCount = undefined;
                    oldItem.betTimeContent = undefined;
                    oldItem.timeMillisecond = undefined;
                    oldItem.betTimeReceivedAt = Date.now();

                    oldItem.userCount = lean.userCount ?? oldItem.userCount;

                    oldItem.dealerName = lean.dealerName ?? oldItem.dealerName;
                    oldItem.dealerImage = lean.dealerImage ?? oldItem.dealerImage;
                    oldItem.dtNowBet = lean.dtNowBet ?? oldItem.dtNowBet;

                    // poker 保留，不动
                    break;
                }

                case 24: {
                    const d = msg.data as { gameID: number; groupID: number; cardArea: number; cardID: number };
                    if (d.gameID !== 101) return;

                    const target = this.game101GroupInfo.get(d.groupID);
                    if (!target) return;

                    if (!target.cardsArr || target.cardsArr.length !== 6) {
                        target.cardsArr = [0, 0, 0, 0, 0, 0];
                    }

                    const pos = (d.cardArea | 0) - 1; // 0..5
                    if (pos < 0 || pos > 5) return;

                    // const old = target.cardsArr[pos]! | 0;
                    const next = d.cardID | 0;
                    target.cardsArr[pos] = next;

                    // 只在变更时输出（避免刷屏）
                    // if (old !== next) {
                    //     this.log(
                    //         `[15101][24] area=${d.cardArea} pos=${pos} cardID=${next} cards=${target.cardsArr.join(",")}`,
                    //         d.groupID
                    //     );
                    // }
                    break;
                }



                case 25: {
                    const d = msg.data as { gameID: number; groupID: number };
                    if (d.gameID !== 101) return;
                    const target = this.game101GroupInfo.get(d.groupID);
                    if (!target) return;
                    if (target.gameStage !== 3) target.gameStage = 3;
                    // this.log(`[15101][25] -> gameStage=3`, d.groupID);
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
                    const target = this.game101GroupInfo.get(d.groupID);
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
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        dtNowBet: WmDtNowBet;
                    };

                    if (d.gameID !== 101) return;
                    const target = this.game101GroupInfo.get(d.groupID);
                    if (!target) return;
                    target.dtNowBet = d.dtNowBet;
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
                    const target = this.game101GroupInfo.get(d.groupID);
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

        /** WM 主链路 WS 关闭时：刷新整个页面 */
        handleWsClosed(which: "hall" | "game" | "client") {
            if (this.hmrSilence) return; // HMR 触发的关闭不刷新
            console.log(`[WM] WS closed: ${which}，刷新页面`);
            // window.location.reload();
        },

        /** 手动关闭所有 WS & 定时器 */
        disposeAll() {
            this.hallSocket?.close();
            this.clientSocket?.close();
            this.gameSocket?.close();
            this.phpClientSocket?.close();

            if (this.phpReconnectTimer !== null) {
                window.clearTimeout(this.phpReconnectTimer);
                this.phpReconnectTimer = null;
            }

            if (this.hallHeartbeatTimer !== null) {
                window.clearInterval(this.hallHeartbeatTimer);
                this.hallHeartbeatTimer = null;
            }

            this.stopPhpPushLoop();

            this.clientAndGameConnected = false;
            this.joinedGroupID = 0;
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
        getWmLiveSign(groupID: number) {
            const d = `webrtc://kx-stream.nzewy.cn/live${groupID}/720p`;
            const k = (Math.floor(Date.now() / 1E3) + 86400).toString(16);

            const domainKey = d.match(/([^/.]+)[^/]*$/)?.[1] ?? "";
            const txSecret = CryptoJS.MD5(String('38664f4a2cbe118bf86bc234cf0a85b7') + domainKey + k).toString();

            return `${d}?txSecret=${txSecret}&txTime=${k}`;
        }
    },
});

// HMR 静音处理（热更新时只关 WS，不触发刷新）
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
