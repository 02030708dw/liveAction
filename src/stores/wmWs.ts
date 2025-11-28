// src/stores/wmWs.ts
import { defineStore } from "pinia";
import { useAuthStore } from "@/stores/auth";
import type {
    WmDtBetLimitSelectID,
    WmWsMessage,
    WmHallLoginData,
    WmPhpClientPayload,
    WmHallInit35Data,
    WmGroupInfo,
    WmGameBalanceData,
    WmDtCard,
    WmDtNowBet
} from "@/types/wm/ws";


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
        phpPushTimer: null as number | null,       // ⭐ 每 200ms 推送 game101GroupInfo

        // 定时器
        hallHeartbeatTimer: null as number | null,
        reconnectTimer: null as number | null,

        // 防重复连 15801 / 15101
        clientAndGameConnected: false,

        // 调试输出
        loginOut: "" as string,
        enterGameOut: "" as string,

        // 自动化模式
        autoMode: false,
        lastUsername: "" as string,
        lastPassword: "" as string,

        /** 大厅 protocol=35 中，gameID=101 的 groupArr（房间初始化信息） */
        game101GroupInfo: [] as WmGroupInfo[],
        /** 15101 protocol=30 最新余额数据 */
        balanceData: null as WmGameBalanceData | null,
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
            if (!this.lastUsername || !this.lastPassword) {
                console.warn("没有 lastUsername/lastPassword，无法自动登录");
                return;
            }

            try {
                console.log("[WM] autoLoginAndConnect 开始");
                await this.httpLogin(this.lastUsername, this.lastPassword);
                await this.enterGameAndConnect();
                console.log("[WM] autoLoginAndConnect 成功");
            } catch (e) {
                console.error("[WM] autoLoginAndConnect 失败，将重试", e);
                this.scheduleReconnect();
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
        /** 连接 phpclient WS：wss://phpclienta.nakiph.xyz/ws/getTableInfos */
        connectPhpClient() {
            if (this.phpClientSocket && this.phpClientSocket.readyState === WebSocket.OPEN) {
                return;
            }

            if (this.phpClientSocket) {
                this.phpClientSocket.close();
            }

            const ws = new WebSocket("wss://phpclienta.nakiph.xyz/ws/getTableInfos");
            this.phpClientSocket = ws;

            ws.onopen = () => {
                console.log("phpclient WS 已连接");
                // ⭐ 连接成功后开始循环推送 game101GroupInfo
                this.startPhpPushLoop();
            };

            ws.onerror = (e) => {
                console.error("phpclient WS error", e);
            };

            ws.onclose = () => {
                console.log("phpclient WS 已关闭");
                // ⭐ 断开时停止推送
                this.stopPhpPushLoop();
                this.handleWsClosed("phpclient");
            };
        },

        /** 启动每 200ms 向 phpclient 推送最新 game101GroupInfo 的循环 */
        startPhpPushLoop() {
            if (this.phpPushTimer !== null) {
                window.clearInterval(this.phpPushTimer);
                this.phpPushTimer = null;
            }

            this.phpPushTimer = window.setInterval(() => {
                if (!this.phpClientSocket || this.phpClientSocket.readyState !== WebSocket.OPEN) {
                    return;
                }

                if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                    return;
                }

                const payload = {
                    type: "wmGame101GroupInfo",   // ⭐ 你那边按这个 type 收就行
                    data: this.game101GroupInfo,
                };

                try {
                    this.phpClientSocket.send(JSON.stringify(payload));
                } catch (err) {
                    console.error("推送 game101GroupInfo 到 phpclient 失败:", err);
                }
            }, 200) as unknown as number;
        },

        /** 停止向 phpclient 推送 */
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

                // 1）发送登录（protocol=1）
                const loginBody = {
                    protocol: 1,
                    data: {
                        sid: this.sid,
                        dtBetLimitSelectID: {}, // 第一次登录传空对象
                        bGroupList: false,
                        videoName: "TC",
                        videoDelay: 3000,
                        userAgent: navigator.userAgent,
                    },
                };
                ws.send(JSON.stringify(loginBody));
                console.log("大厅 15109 已发送登录 protocol=1");

                // 2）大厅初始化 protocol=35
                const initBody = {
                    protocol: 35,
                    data: { type: -1 },
                };
                ws.send(JSON.stringify(initBody));
                console.log("大厅 15109 已发送初始化 protocol=35");

                // 3）心跳 115
                const sendHeartbeat = () => {
                    if (ws.readyState === WebSocket.OPEN) {
                        const hb = {
                            protocol: 115,
                            data: { gameID: 102 },
                        };
                        ws.send(JSON.stringify(hb));
                        console.log("大厅 15109 心跳 protocol=115");
                    }
                };
                sendHeartbeat();
                this.hallHeartbeatTimer = window.setInterval(sendHeartbeat, 10_000) as unknown as number;
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data) as WmWsMessage;

                    if (msg.protocol === 0) {
                        // 登录成功 / 初始数据包，里面有 dtBetLimitSelectID
                        const data = msg.data as WmHallLoginData;
                        if (data?.dtBetLimitSelectID) {
                            this.dtBetLimitSelectID = data.dtBetLimitSelectID;

                            // 拿到限红后，如果还没连过 15801 / 15101，则立即拉起
                            if (!this.clientAndGameConnected) {
                                this.connectClient();
                                this.connectGame();
                                this.clientAndGameConnected = true;
                            }
                        }
                    } else if (msg.protocol === 35) {
                        const data = msg.data as WmHallInit35Data;

                        // 1）保存 gameID = 101 的所有 groupArr
                        const game101 = data.gameArr?.find((g) => g.gameID === 101);
                        if (game101 && Array.isArray(game101.groupArr)) {
                            this.game101GroupInfo = game101.groupArr;
                            console.log("已保存 gameID=101 的 groupArr 数组:", this.game101GroupInfo);
                        } else {
                            console.warn("protocol=35 中未找到 gameID=101 的 gameArr 或 groupArr 不是数组");
                        }

                        // 2）继续推给 phpclient（如果你还需要）
                        const payload: WmPhpClientPayload = {
                            type: "wmGameTableInfos",
                            data,
                        };

                        if (this.phpClientSocket && this.phpClientSocket.readyState === WebSocket.OPEN) {
                            this.phpClientSocket.send(JSON.stringify(payload));
                            console.log("已将 protocol=35 data 推给 phpclient");
                        } else {
                            console.warn("phpclient WS 未连接，无法推 wmGameTableInfos（protocol=35 data）");
                        }
                    } else {
                        // 其他协议按需再处理
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
                        bGroupList: true, // 文档里 15801 是 true
                        videoName: "TC",
                        videoDelay: 3000,
                        userAgent: navigator.userAgent,
                    },
                };

                ws.send(JSON.stringify(body));
                console.log("15801 已发送登录 protocol=1");
            };

            ws.onmessage = () => {
                // console.log("15801 收到:", event.data);
            };

            ws.onerror = (e) => {
                console.error("15801 WS error", e);
            };

            ws.onclose = () => {
                console.log("15801 WS 已关闭");
                // ❌ 不要调用 handleWsClosed("client")
                // 15801 是一次性验证，断开属于正常流程
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
                        dtBetLimitSelectID: { 101: this.dtBetLimitSelectID![101] },//this.dtBetLimitSelectID,
                        bGroupList: false, // 文档里 15101 是 false
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
                    // 每个牌桌游戏状态切换
                    const d = msg.data as { gameID: number; groupID: number; gameStage: number };

                    // 只处理 gameID = 101 的
                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=20 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const target = this.game101GroupInfo.find((g) => g.groupID === d.groupID);
                    if (!target) {
                        // console.warn("protocol=20 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    // 修改该桌子的 gameStage（Pinia 里直接改属性是响应式的）
                    target.gameStage = d.gameStage;
                    console.log("protocol=20 更新桌面 gameStage 成功:", d.groupID, "=>", d.gameStage);
                    break;
                }
                case 21: {
                    // 新牌局开局信息
                    const d = msg.data as any;

                    // 只关心 gameID = 101（如果你想要 105 之类的，也可以去掉这个判断）
                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=21 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const idx = this.game101GroupInfo.findIndex((g: any) => g.groupID === d.groupID);
                    if (idx === -1) {
                        // console.warn("protocol=21 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    const oldItem = this.game101GroupInfo[idx]!;

                    // ✅ 用展开运算符整体合并
                    // - 先展开旧的
                    // - 再展开 d（gameNo、dealerName、限红等会覆盖旧值）
                    // - tableDtExtend 单独做一次浅合并，避免把老字段全抹掉
                    const newItem = {
                        ...oldItem,
                        ...d,
                        tableDtExtend: d.tableDtExtend
                            ? {
                                ...oldItem.tableDtExtend,
                                ...d.tableDtExtend,
                            }
                            : oldItem.tableDtExtend,
                    };

                    this.game101GroupInfo.splice(idx, 1, newItem);

                    console.log("protocol=21 更新新牌局信息成功:", d.groupID, d);
                    break;
                }


                case 23://下注成功返回
                    break
                case 24: {
                    // 发牌推送
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        cardArea: number;
                        cardID: number;
                        inputType: number;
                    };

                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=24 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const target = this.game101GroupInfo.find(g => g.groupID === d.groupID);
                    if (!target) {
                        // console.warn("protocol=24 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    const areaKey = String(d.cardArea);

                    // 旧 dtCard 没有就先给个空对象
                    if (!target.dtCard) {
                        target.dtCard = {};
                    }

                    target.dtCard[areaKey] = {
                        cardID: d.cardID,
                        inputType: d.inputType,
                    };

                    console.log("protocol=24 发牌推送，更新 dtCard:", d.groupID, target.dtCard);
                    break;
                }


                case 25: {
                    // 结算结果
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        result: number;
                        dtCard?: WmDtCard;
                        winBetAreaArr?: number[];
                    };

                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=25 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const target = this.game101GroupInfo.find(g => g.groupID === d.groupID);
                    if (!target) {
                        // console.warn("protocol=25 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    // 覆盖 result
                    target.result = d.result;

                    // 有 dtCard 就把整包结算牌覆盖进去
                    if (d.dtCard) {
                        target.dtCard = d.dtCard;
                    }

                    // 有 winBetAreaArr 就更新
                    if (d.winBetAreaArr) {
                        target.winBetAreaArr = d.winBetAreaArr;
                    }

                    console.log("protocol=25 结算结果，更新桌面:", d.groupID, {
                        result: target.result,
                        dtCard: target.dtCard,
                        winBetAreaArr: target.winBetAreaArr,
                    });
                    break;
                }
                case 26: {
                    // 历史路单
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        groupType: number;
                        historyArr: number[];
                        historyData: any;
                    };

                    // 如果你这套 store 只管 gameID = 101，这里可以继续过滤
                    // 示例里是 103，就当结构说明，如果你想兼容多个 gameID，可以把这个判断去掉
                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=26 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const target = this.game101GroupInfo.find(g => g.groupID === d.groupID);
                    if (!target) {
                        // console.warn("protocol=26 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    // 更新 groupType（有些场景会变，比如普通桌/特殊桌）
                    target.groupType = d.groupType;

                    // 整包覆盖历史路单
                    target.historyArr = d.historyArr;
                    (target as any).historyData = d.historyData;

                    console.log("protocol=26 历史路单刷新:", d.groupID, {
                        historyLen: d.historyArr?.length,
                        totalCount: d.historyData?.totalCount,
                    });
                    break;
                }


                case 30: {
                    // 刷新余额
                    const d = msg.data as WmGameBalanceData;
                    this.balanceData = d;
                    break;
                }

                case 33: {
                    // 实时下注广播
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        dtNowBet: WmDtNowBet;
                    };

                    // 如果你这套 store 只管 gameID=101，还是可以过滤一下
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

                    console.log("protocol=33 实时下注广播，更新 dtNowBet:", d.groupID, d.dtNowBet);
                    break;
                }

                case 35://大厅信息
                    break;
                case 38: {
                    // 下注倒计时刷新
                    const d = msg.data as {
                        gameID: number;
                        groupID: number;
                        betTimeCount: number;
                        betTimeContent: Record<string, any>;
                        timeMillisecond: number;
                    };

                    // 只处理 gameID = 101（你如果要其它游戏，可以去掉这行）
                    if (d.gameID !== 101) return;

                    if (!this.game101GroupInfo || this.game101GroupInfo.length === 0) {
                        // console.warn("protocol=38 收到时 game101GroupInfo 还没有初始化", d);
                        return;
                    }

                    const target = this.game101GroupInfo.find(g => g.groupID === d.groupID);
                    if (!target) {
                        // console.warn("protocol=38 未找到对应 groupID 的桌子:", d.groupID, d);
                        return;
                    }

                    // 就地更新倒计时相关字段
                    target.betTimeCount = d.betTimeCount;
                    target.betTimeContent = d.betTimeContent;
                    target.timeMillisecond = d.timeMillisecond;

                    console.log("protocol=38 倒计时刷新:", d.groupID, {
                        betTimeCount: target.betTimeCount,
                        timeMillisecond: target.timeMillisecond,
                    });
                    break;
                }

                case 39://玩家登录成功状态
                    break;
                case 70: //公示
                    break;
                default:
                    console.log("15101 未知 protocol：", msg.protocol, msg.data);
            }
        },

        /** 任意 WS 关闭时统一处理（自动模式下发起重连） */
        handleWsClosed(which: "hall" | "game" | "phpclient") {
            console.log(`[WM] WS closed: ${which}`);
            if (!this.autoMode) return;

            // 这里简单一点：只要有一个 WS 断开，就整条链路重新登录 + 重新连
            this.scheduleReconnect();
        },

        /** 安排一次重连（简单版：固定 3 秒） */
        scheduleReconnect() {
            if (!this.autoMode) return;

            this.clearReconnectTimer();
            console.log("[WM] 3 秒后尝试自动重连...");
            this.reconnectTimer = window.setTimeout(() => {
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
            this.clientAndGameConnected = false;
        },
    },
});
