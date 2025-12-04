import { defineStore } from 'pinia';
import CryptoJS from 'crypto-js';
import {
    Reader,
    parseMsg,
    mapPublicBean,
    PublicBean,
    buildUiTableData,
} from '@/utils/dgProto';
import type { PushState, UiTable } from '@/utils/dgProto';
import { useAuthStore } from './dgAuth';

interface State {
    token: string;
    wskey: string;
    mid: string;
    tableId: number;
    type: number;
    ws: WebSocket | null;
    connected: boolean;
    status: string;
    logs: string[];
    pushState: PushState;
    uiTables: UiTable[];
    pushTimer: number | null;
    heartbeatTimer: number | null;
    countdownTimer: number | null;
    /** 10086.list[0]，下注加密用 */
    random: string;
    /** 下注相关 */
    userName: string;
    betEncryptKey: string;
}

/** ================= 推送给后端的 WS 配置 ================= */
const PUSH_WS_URL = 'wss://phpclienta.nakiph.xyz/ws/getTableInfos';
// 如果你要用 d 环境，改成：
// const PUSH_WS_URL = 'wss://phpclientd.nakiph.xyz/ws/getTableInfos';

let wsPush: WebSocket | null = null;
let pushQueue: string[] = [];
let pushReconnectTimer: number | null = null;
/** ===================================================== */

const DEALER_IMG_HOST =
    'https://new-dd-cloudfront.ywjxi.com/vd/vd/image/Image/dealer/';

const EVENT_STATUS_TEXT: Record<string, string> = {
    GP_NEW_GAME_START: '新局开始 / 下注中',
    GP_BETTING: '下注中',
    GP_DEALING: '发牌中',
    GP_SETTLEMENT: '结算中',
    GP_RESULT: '结果展示',
};

export function resolveStatus(tableInfo: any, dealerEvent: any) {
    if (tableInfo.maintenance) {
        return {
            text: '维护中',
            className: 'status-pill status-pill--maintenance',
        };
    }
    if (dealerEvent.shuffle || tableInfo.shuffle) {
        return {
            text: '洗牌中',
            className: 'status-pill status-pill--shuffle',
        };
    }
    const t =
        EVENT_STATUS_TEXT[dealerEvent.eventType] ||
        dealerEvent.eventType ||
        '未知状态';
    return { text: t, className: 'status-pill' };
}

export const useDgWsStore = defineStore('dgWs', {
    state: (): State => ({
        token: '',
        wskey:
            'pV5mY8dR2qGxH1sK9tBzN6uC3fWjE0aL7rTnJ4cQvSgPZyFMiXoUbDlAhOeRwd36',
        mid: '99',
        tableId: 1,
        type: 0,
        ws: null,
        connected: false,
        status: '',
        logs: [],
        pushState: {
            list: [],
            table: [],
            tableStateById: {},
            roadsByTableId: {},
            playersByTableId: {},
            betAreaByTableId: {},
            statsByTableId: {},
            chatByTableId: {},
            eventsByTableId: {},
            betResultByTableId: {},
            richList: [],
            openCardByTableId: {},
            countdownByTableId: {},
        },
        uiTables: [],
        pushTimer: null,
        heartbeatTimer: null,
        countdownTimer: null,
        random: '',
        userName: '',
        betEncryptKey: '',
    }),
    actions: {
        initFromAuth() {
            const authStore = useAuthStore();
            this.token =
                authStore.gameToken || authStore.auth?.accessToken || '';
            this.wskey =
                authStore.wskey ||
                'pV5mY8dR2qGxH1sK9tBzN6uC3fWjE0aL7rTnJ4cQvSgPZyFMiXoUbDlAhOeRwd36';
        },

        setWsConfig(payload: {
            token?: string;
            wskey?: string;
            mid?: string;
            tableId?: number;
            type?: number;
        }) {
            if (payload.token !== undefined) this.token = payload.token;
            if (payload.wskey !== undefined) this.wskey = payload.wskey;
            if (payload.mid !== undefined) this.mid = payload.mid;
            if (payload.tableId !== undefined) this.tableId = payload.tableId;
            if (payload.type !== undefined) this.type = payload.type;
        },

        log(msg: string) {
            this.logs.push(msg);
            if (this.logs.length > 200) this.logs.shift();
            // 也顺便打到控制台
            console.log(msg);
        },

        getEncryptToken(str: string): string {
            const key = CryptoJS.enc.Utf8.parse(this.wskey.trim());
            const enc = CryptoJS.TripleDES.encrypt(str, key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7,
            });
            return enc.toString();
        },

        buildPacket(cmd: number, extra: Partial<any> = {}): Uint8Array {
            const token = this.token.trim();
            const mid = this.mid.trim();
            const tableId = this.tableId;
            const type = this.type;

            const envelope = {
                cmd,
                token,
                time: Date.now(),
            };
            const encToken = this.getEncryptToken(JSON.stringify(envelope));

            const payload = {
                cmd,
                token: encToken,
                codeId: 0,
                lobbyId: 0,
                gameNo: '',
                seat: 0,
                tableId,
                mid,
                dList: [],
                type,
                userName: '',
                list: [],
                mids: [],
                object: cmd === 10086 ? 'PC' : '',
                ...extra,
            };
            return PublicBean.encode(payload).finish() as Uint8Array;
        },

        sendPacket(cmd: number, extra: Partial<any> = {}) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                alert('WS 未连接');
                return;
            }
            const buf = this.buildPacket(cmd, extra);
            this.ws.send(buf);
            // this.log(`📤 已发送 cmd=${cmd}`);
            if (cmd === 6) {
                console.log('buf', buf);

            }
        },

        sendInitSeq() {
            const seq = [
                { cmd: 10086, tableId: this.tableId, type: 0, object: 'PC' },
                { cmd: 45, type: 1 },
                { cmd: 43, tableId: this.tableId, type: 0 },
                { cmd: 5011, type: 0 },
                { cmd: 87, type: 1 },
                { cmd: 24, type: 2 },
            ];
            (async () => {
                this.log('🚀 初始化序列开始...');
                for (const pkt of seq) {
                    const buf = this.buildPacket(pkt.cmd, pkt);
                    this.ws?.send(buf);
                    // this.log(`📤 已发送 cmd=${pkt.cmd}`);
                    await new Promise((r) => setTimeout(r, 300));
                }
                this.log('✅ 初始化完成');
            })();
        },

        startHeartbeat() {
            if (this.heartbeatTimer) return;
            this.heartbeatTimer = window.setInterval(() => {
                this.sendPacket(99);
            }, 2000);
        },

        stopHeartbeat() {
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
        },

        startCountdownTimer() {
            if (this.countdownTimer) return;
            this.countdownTimer = window.setInterval(() => {
                this.rebuildUiTables();
            }, 1000);
        },

        stopCountdownTimer() {
            if (this.countdownTimer) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
        },

        /** 连接游戏 WS */
        connect() {
            if (!this.token || !this.wskey) {
                this.log('token 或 wskey 为空');
                return;
            }
            const sign = this.getEncryptToken(this.token.trim());
            const url = `wss://hwdata-new.taxyss.com/?sign=${sign}`;
            this.log(`连接到: ${url}`);
            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';
            this.ws = ws;

            ws.onopen = () => {
                this.log('✅ 已连接');
                this.status = '已连接';
                this.connected = true;
                this.startHeartbeat();
                this.startCountdownTimer();
                // 游戏 WS 连上时顺便连上推送 WS
                this.connectPushWS();
                setTimeout(() => this.sendInitSeq(), 1000);
            };
            ws.onclose = (e) => {
                this.log(`🔌 连接关闭 code=${e.code} reason=${e.reason}`);
                this.status = '连接关闭';
                this.connected = false;
                this.stopHeartbeat();
                this.stopCountdownTimer();
            };
            ws.onerror = () => {
                this.log('❌ 连接错误');
                this.status = '连接错误';
            };
            ws.onmessage = (e) => this.handleMessage(e.data);
        },

        close() {
            this.ws?.close();
        },

        /** 游戏 WS 收到消息 */
        handleMessage(data: ArrayBuffer | Blob) {
            try {
                const arrBuf =
                    data instanceof ArrayBuffer
                        ? data
                        : (data as Blob).slice(0).arrayBuffer();
                if (arrBuf instanceof Promise) {
                    arrBuf.then((ab) => this._handleDecoded(new Uint8Array(ab)));
                } else {
                    this._handleDecoded(new Uint8Array(arrBuf));
                }
            } catch (err: any) {
                // this.log('📩 解码失败: ' + err?.message);
            }
        },

        _handleDecoded(u8: Uint8Array) {
            const raw = parseMsg(new Reader(u8));
            const mapped = mapPublicBean(raw);
            const cmd = mapped.cmd | 0;
            const tableId =
                (mapped as any).tableId || (mapped as any).tableID || 0;

            switch (cmd) {
                case 10086:
                    this.pushState.list = Array.isArray(mapped.list)
                        ? mapped.list
                        : [];

                    // 1) 提取 userName：优先用 mapped.userName，拿不到再从 loginResp 兜底
                    if (mapped.userName) {
                        this.userName = mapped.userName;
                    } else {
                        const authStore = useAuthStore();
                        this.userName = authStore.userName || '';
                    }

                    // 2) 提取下注专用 key：参照 Android 的 normalizedEntries 逻辑
                    const entries = (this.pushState.list || [])
                        .map((x: any) => (x == null ? '' : String(x)))
                        .filter((s: string) => s.length > 0);

                    if (entries.length > 1) {
                        this.betEncryptKey = entries[1]!;
                    } else if (entries.length === 1) {
                        this.betEncryptKey = entries[0]!;
                    }

                    this.log(
                        `🎲 cmd=10086 userName=${this.userName} betEncryptKey=${this.betEncryptKey} list=${JSON.stringify(
                            this.pushState.list,
                        )}`,
                    );

                    this.schedulePush();
                    break;

                case 43:
                    this.pushState.table = Array.isArray(mapped.table)
                        ? mapped.table
                        : [];
                    this.schedulePush();
                    break;

                case 1002: {
                    if (Array.isArray(mapped.table)) {
                        for (const t of mapped.table) {
                            const tid = Number(t.tableId || t.tableID);
                            if (!tid) continue;
                            this.pushState.tableStateById[tid] = t;

                            if (t.state === 1 && typeof t.countDown === 'number') {
                                this.pushState.countdownByTableId[tid] = {
                                    base: t.countDown,
                                    lastUpdate: Date.now(),
                                    active: true,
                                };
                            } else {
                                this.pushState.countdownByTableId[tid] = {
                                    base: 0,
                                    lastUpdate: Date.now(),
                                    active: false,
                                };
                            }
                        }
                        this.schedulePush();
                    }
                    break;
                }

                case 1004:
                    this.handleLobbyPush1004(mapped);
                    break;

                case 201:
                    this.handleTableArrayLike(mapped, 'playersByTableId');
                    break;

                case 207:
                    this.handleLobbyPush207(mapped);
                    break;

                case 208:
                    this.handleTableArrayLike(mapped, 'betAreaByTableId');
                    break;

                case 5014:
                    this.handleTableArrayLike(mapped, 'statsByTableId');
                    break;

                case 85:
                    if (tableId) {
                        this.pushState.chatByTableId[tableId] = mapped;
                        this.schedulePush();
                    }
                    break;

                case 5015:
                    if (tableId) {
                        this.pushState.eventsByTableId[tableId] = mapped;
                        this.schedulePush();
                    }
                    break;

                case 6:
                    if (tableId) {
                        this.pushState.betResultByTableId[tableId] = mapped;
                        this.schedulePush();
                    }
                    break;

                case 24:
                    this.pushState.richList = Array.isArray(mapped.list)
                        ? mapped.list
                        : [];
                    this.schedulePush();
                    break;

                case 1003:
                    if (tableId && mapped.gameNo) {

                        if (!this.pushState.openCardByTableId[tableId]) {
                            this.pushState.openCardByTableId[tableId] = {};
                        }
                        this.pushState.openCardByTableId[tableId][mapped.gameNo] =
                            mapped;
                        this.schedulePush();
                    }
                    break;
                case 1005:
                    console.log(tableId, mapped);
                    break;
                default:
                    break;
            }

            // this.log('📩 收到: ' + JSON.stringify(mapped));
        },

        handleTableArrayLike(mapped: any, field: keyof PushState) {
            const arr = Array.isArray(mapped.table) ? mapped.table : [];
            for (const t of arr) {
                const tid = Number(t.tableId || t.tableID);
                if (!tid) continue;
                // @ts-ignore
                this.pushState[field][tid] = t;
            }
            this.schedulePush();
        },
        handleLobbyPush1004(mapped: any) {
            const tid = mapped.tableId || mapped.tableID;
            if (!tid) return;
            if (Array.isArray(this.pushState.table)) {
                const summary = (this.pushState.table as any[]).find(
                    (x) => Number(x.tableId || x.tableID) === tid,
                );
                if (summary) {
                    summary.roads = mapped.list;
                }
            }
            this.pushState.roadsByTableId[tid] = mapped.list
        },
        handleLobbyPush207(mapped: any) {
            const arr = Array.isArray(mapped.lobbyPush) ? mapped.lobbyPush : [];
            if (!arr.length || !Array.isArray(this.pushState.table)) return;
            for (const lp of arr) {
                const tid = Number(lp.tableId || lp.tableID);
                if (!tid) continue;
                const t = (this.pushState.table as any[]).find(
                    (x) => Number(x.tableId || x.tableID) === tid,
                );
                if (!t) continue;
                t.onlineCount = lp.onlineCount ?? t.onlineCount ?? 0;
                t.totalAmount = lp.totalAmount ?? t.totalAmount ?? 0;
                t.vipName = lp.vipName ?? t.vipName ?? '';
                t.seatFull = lp.seatFull ?? t.seatFull ?? false;
            }
            this.schedulePush();
        },

        /** 🔁 节流：合并 UI 重建 + 推送到后端 */
        schedulePush() {
            if (this.pushTimer) return;
            this.pushTimer = window.setTimeout(() => {
                this.pushTimer = null;
                this.rebuildUiTables(); // 更新前端桌台 UI
                this.pushCombined(); // 推送给后端 WS
            }, 60);
        },

        /** 用 pushState 重建所有桌台的 UI 数据 */
        rebuildUiTables() {
            const tables = Array.isArray(this.pushState.table)
                ? this.pushState.table
                : [];
            const ui: UiTable[] = [];
            for (const t of tables) {
                const tid = Number(t.tableId || t.tableID);
                if (!tid) continue;
                const row = buildUiTableData(tid, this.pushState);
                if (row) ui.push(row);
            }
            this.uiTables = ui;
        },

        dealerImageUrl(image: string) {
            return DEALER_IMG_HOST + (image || 'default.png');
        },

        clearLogs() {
            this.logs = [];
        },

        /** ================= 推送 WS 相关 ================= */

        /** 连接推送给后端的 WS */
        connectPushWS() {
            const url = PUSH_WS_URL;
            // this.log(`[PUSH] 连接到: ${url}`);

            wsPush = new WebSocket(url);

            wsPush.onopen = () => {
                // this.log('✅ 推送WS 已连接');
                // 把排队的消息发出去
                if (pushQueue.length && wsPush) {
                    pushQueue.forEach((msg) => wsPush!.send(msg));
                    pushQueue = [];
                }
            };

            wsPush.onclose = () => {
                // this.log(
                //     `🔌 推送WS 连接关闭 code=${e.code} reason=${e.reason || ''}`,
                // );
                wsPush = null;

                // 简单重连逻辑
                if (pushReconnectTimer != null) {
                    clearTimeout(pushReconnectTimer);
                }
                pushReconnectTimer = window.setTimeout(() => {
                    pushReconnectTimer = null;
                    this.connectPushWS();
                }, 2000);
            };

            wsPush.onerror = () => {
                // this.log('❌ 推送WS 连接错误');
            };
        },

        /** 确保推送 WS 是可用的，不可用时尝试重连 */
        ensurePushWS(): boolean {
            if (!wsPush || wsPush.readyState === WebSocket.CLOSED) {
                this.connectPushWS();
                return false;
            }
            return wsPush.readyState === WebSocket.OPEN;
        },

        /** 把聚合后的桌台信息推送给后端 `/ws/getTableInfos` */
        pushCombined() {
            // 先用现有逻辑重建 UI（防御一下，确保 uiTables 是最新的）
            this.rebuildUiTables();

            const payload = {
                type: 'dgGameTableInfos',
                data: this.uiTables, // ⭐ 直接推轻量的 UiTable 视图
            };

            const text = JSON.stringify(payload);

            if (this.ensurePushWS()) {
                wsPush!.send(text);
            } else {
                pushQueue.push(text);
            }

            // this.log('📤 推送WS 已发送合并 dgGameTableInfos（使用 UiTable 轻量结构）');
        },

        enterRoom(tableId: number, gameNo: string) {
            // Android 顺序：29 -> 9 -> 44 -> 19 -> 4
            this.sendPacket(29, { tableId, type: 1 });
            this.sendPacket(9, { tableId, gameNo });
            this.sendPacket(44, { tableId, mid: '0' });
            this.sendPacket(19, { tableId, type: 1 });
            this.sendPacket(4, { tableId, type: 1, seat: -1 });
        },
        encryptWithKey(str: string, keyStr: string): string {
            const key = CryptoJS.enc.Utf8.parse(keyStr.trim());
            const enc = CryptoJS.TripleDES.encrypt(str, key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7,
            });
            return enc.toString();
        },
        // 转成 Android 的 key 规范：首字母小写
        normalizeBetKey(source: string): string {
            if (!source) return source;
            if (source.length === 1) return source.toLowerCase();
            return source[0]!.toLowerCase() + source.slice(1);
        },

        // 只下注一个区域的 betData（方便你先跑通）
        buildSingleBetData(params: {
            key: string;       // 比如 "P", "Banker", "Tie"
            amount: number;    // 金额
            table: string;     // info.table, Android 是 "3"
            roadType: string;  // info.roadType，Android 用 table.seat
        }): any {
            const betData: any = {};
            const normKey = this.normalizeBetKey(params.key.trim());
            if (!normKey || !params.amount || params.amount <= 0) {
                throw new Error('无效的下注 key 或 amount');
            }
            betData[normKey] = params.amount;
            betData.info = JSON.stringify({
                table: params.table,
                roadType: params.roadType,
            });
            return betData;
        },
        /** 低层：和 Android DgWsService.send6Bet 的协议完全一样 */
        sendDgBet(params: {
            tableId: number;
            gameNo: string;
            betData: any;
        }) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.log('❌ WS 未连接，无法投注');
                alert('WS 未连接，无法投注');
                return;
            }

            const { tableId, gameNo, betData } = params;

            const userName = this.userName;
            if (!userName) {
                throw new Error('userName 为空，请确认已收到 cmd=10086');
            }

            const betKey = this.betEncryptKey;
            if (!betKey) {
                throw new Error('betEncryptKey 为空，请确认已收到 cmd=10086');
            }

            // suffixKey = betKey[8:16]，和 Android 保持一致
            const keyLen = betKey.length;
            const suffixKey =
                keyLen > 8 ? betKey.slice(8, Math.min(16, keyLen)) : betKey;

            const hashInput = String(tableId) + gameNo + userName + suffixKey;
            const md5 = CryptoJS.MD5(hashInput).toString();

            const encBetData = this.encryptWithKey(
                JSON.stringify(betData),
                betKey,
            );

            const list = ['1', md5, encBetData];

            this.log(
                `🧮 sendDgBet: tableId=${tableId}, gameNo=${gameNo}, userName=${userName}, suffixKey=${suffixKey}, md5=${md5}`,
            );

            this.sendPacket(6, {
                tableId,
                gameNo,
                type: 1,
                list,
            });

            this.log(
                `📤 发送下注 cmd=6, payload.list=${JSON.stringify(list)}`,
            );
        },
        placeSingleBet(params: {
            tableId: number;
            gameNo: string;
            betKey: string;       // 如 "P" / "Banker"
            amount: number;
            roadType: number;     // 你当前桌台的 roadType
            tableIndex?: number;  // 可以先写死 '3'，后面再对上 Android
        }) {
            const tableStr = String(params.tableIndex ?? 3); // Android 现在写死 "3"
            const roadTypeStr = String(params.roadType);

            const betData = this.buildSingleBetData({
                key: params.betKey,
                amount: params.amount,
                table: tableStr,
                roadType: roadTypeStr,
            });

            // 先 enterRoom 再下注，和 Android 一致
            this.enterRoom(params.tableId, params.gameNo);
            setTimeout(() => {
                this.sendDgBet({
                    tableId: params.tableId,
                    gameNo: params.gameNo,
                    betData,
                });
            }, 2000)
        },

    },
});
