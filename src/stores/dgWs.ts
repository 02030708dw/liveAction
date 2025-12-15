//域名：wss://hwdata-new.taxyss.com/ 
// 1.发送参数的token需要加密，加密方式是加密你整个参数{加密函数(JSON.stringify(i)),i是你的整个参数结构}，发送也需要转成二进制再send，具体请看请求示例文件 
// 2.回传参数不需要解密，但是需要重新组装一下数据因为是字节码传输，具体组装和组装数据模型请看示例文件 一： 握手成功之后进入游戏大厅先要发送10086，45，43，5011，87，24 这几个请求用于初始化大厅和登录 
// 二： 链接成功后，需要间隔 1~2秒发送一次心跳（99） 
// 三.下注（6），下注信息需要加密，需要用到10086的key，和整体的key，详情请看示例文件,需要根据1015拿到最新的seat,1002拿到最新的gameno 接口回传参数说明 
// 6：下注成功信息：dList里面第一个是余额信息 
// 24：富豪榜currencyName币种，username：登录账号，online：是否在线，userLevel：玩家等级 
// 43：大厅桌台总览，初始化大厅的数据，roads=路纸，dealer=当前牌局荷官信息（荷官封面地址host==https://new-dd-cloudfront.ywjxi.com/vd/vd/image/Image/dealer/）每个房间的totalAmount总下注金额，onlineCount在线人数等，只等注意的是object（里卖弄有一个type，如果下注的时候桌号有这个type需要用到，没有就为0）gameNo这是游戏局编号后面很多地方都需要，gameId游戏类型，tableID桌号； 
// 85：聊天信息: 
// 201：桌上玩家信息：userName：昵称，currency：币种，balance：余额，betInfo：当前下注明细，streak：连胜次数，betNum / winNum：下注/胜局统计； 
// 207：最新的各桌在线人数和投注额统计。客户端可以选择性地用这些数据更新大厅界面的热门程度、筹码总量显示等 
// 208：当前桌台总投注额统计：banker, player, tie：各投注区总金额，pPair, bPair, super6 等：其他玩法投注金额，bankerNum, playerNum 等：统计局数 
// 1002：单桌实时状态,shoeId=靴号，playId：局号，state：状态（1=下注中，2=发牌中，5=结算中等），countDown：剩余秒数（下注倒计时），poker：当前牌面（尚未开牌时为 0），gameNo：完整牌局编号，poker参数：banker（庄家牌），player（闲家牌） 
// 1003：开牌结果（会发送几次开牌过程），当前局的开牌结果；gameNo：当前局号，tableId：桌号，object： player=闲家（Player）的三张牌编码，banker=庄家（Banker）的三张牌编码
// 1004：路纸：list是数据，如【#X#Y#Z】其中x表示胜负方（1=庄(Banker)，5=闲(Player)，9=和(Tie)），y表示特殊类型（0=无特殊，1=出现对子），z点数或顺序编号（通常为庄或闲的点数，也可视作局序号） 
// 5014：游戏统计、胜率分析：id对应不同房间/玩法,nums：局数，wins：赢局数,type=0：实时数据，type=1：汇总数据(用于分析近20局的下注玩家偏好) 
// 5015:游戏事件用于判断用户行为，比如进入牌局，离开房间等等，type=8进入牌局，seat玩家座位号(用于下注的roadType参数值),gameNo和对应的tableId，如果发生了改变需要记录用于下注 
// 10086：回传大厅信息，主要登录信息和一些公告，和游戏的id等数据，有用的主要是token和key（回传示例里面的 'list' 里的第一个参数，用于后面游戏下注的加密），username;

import { defineStore } from 'pinia';
import CryptoJS from 'crypto-js';
import type { PushState, UiTable } from '@/utils/dgProto';
import {
    decodeDgMsgVm86,
    PublicBean,
    buildUiTableData,
    extractUserNameFromMapped
} from '@/utils/dgDebugDecode';
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

    /** 43.object 解析后，按 tableId 存 type / count */
    dgObjectByTableId: Record<number, { type: number; count: number }>;
    /** 1002 / 5015 / 1015 的最新 gameNo / seat，按 tableId 存 */
    dgRuntimeByTableId: Record<number, { gameNo?: string; seat?: number }>;
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

/** 解析 cmd=43 里的 object 字符串 -> 按 tableId 映射 */
function parseDgObjectByTableId(
    objStr?: string | null,
): Record<number, { type: number; count: number }> {
    if (!objStr) return {};
    try {
        const raw = JSON.parse(objStr) as Record<
            string,
            { type?: number; count?: number }
        >;
        const map: Record<number, { type: number; count: number }> = {};
        for (const [idStr, v] of Object.entries(raw)) {
            if (!v || typeof v.type !== 'number') continue;
            const id = Number(idStr);
            if (!Number.isFinite(id)) continue;
            map[id] = { type: v.type, count: v.count ?? 0 };
        }
        return map;
    } catch (e) {
        console.warn('[DG] parseDgObjectByTableId 失败', e, objStr);
        return {};
    }
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
        dgObjectByTableId: {},
        dgRuntimeByTableId: {},
    }),

    getters: {
        /** 最新 gameNo（来自 1002 / 5015 / 1015），按 tableId */
        dgGameNoForBet: (state) => (tableId: number): string => {
            return state.dgRuntimeByTableId[tableId]?.gameNo ?? '';
        },
        /** 最新 seat（主要来自 5015 / 1015），按 tableId，用作 roadType */
        dgSeatForBet: (state) => (tableId: number): number => {
            return state.dgRuntimeByTableId[tableId]?.seat ?? 0;
        },
        /** 43.object 里对应桌子的 type，备用 */
        dgObjectTypeForTable: (state) => (tableId: number): number => {
            return state.dgObjectByTableId[tableId]?.type ?? 0;
        },
    },

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
            let payload = null;
            if (cmd != 6) {
                payload = {
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
            } else {
                payload = { cmd, token: encToken, ...extra };
                console.log(payload);
            }

            return PublicBean.encode(payload).finish() as Uint8Array;
        },

        sendPacket(cmd: number, extra: Partial<any> = {}) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                alert('WS 未连接');
                return;
            }
            const buf = this.buildPacket(cmd, extra);
            this.ws.send(buf);
            if (cmd === 6) {
                console.log('buf', extra);
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
                    arrBuf.then((ab) =>
                        this._handleDecoded(new Uint8Array(ab), data),
                    );
                } else {
                    this._handleDecoded(new Uint8Array(arrBuf), arrBuf);
                }
            } catch {
                // 解码错误直接忽略
            }
        },

        _handleDecoded(u8: Uint8Array, _rawData: any) {
            const mapped = decodeDgMsgVm86(u8);
            const cmd = mapped.cmd | 0;
            const tableId =
                (mapped as any).tableId || (mapped as any).tableID || 0;

            switch (cmd) {
                case 10086:
                    this.pushState.list = Array.isArray(mapped.list)
                        ? mapped.list
                        : [];
                    // 1) 用 Android 同款方式从 10086 里挖 userName
                    const extracted = extractUserNameFromMapped(mapped);
                    if (extracted) {
                        this.userName = extracted;
                    } else {
                        // 兜底：用自己平台的账号（比如 member10php）
                        const authStore = useAuthStore();
                        this.userName = authStore.userName || '';
                    }

                    // 2) 提取下注专用 key：和 Android normalizedEntries 一致
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

                case 43: {
                    this.pushState.table = Array.isArray(mapped.table)
                        ? mapped.table
                        : [];
                    // 解析 object -> dgObjectByTableId
                    this.dgObjectByTableId = parseDgObjectByTableId(
                        mapped.object,
                    );
                    this.schedulePush();
                    break;
                }

                case 1002: {
                    if (Array.isArray(mapped.table)) {
                        for (const t of mapped.table) {
                            const tid = Number(t.tableId || t.tableID);
                            if (!tid) continue;
                            this.pushState.tableStateById[tid] = t;

                            // 记录每桌最新 gameNo
                            if (t.gameNo) {
                                const rt =
                                    (this.dgRuntimeByTableId[tid] ??=
                                        {});
                                rt.gameNo = t.gameNo;
                            }

                            if (
                                t.state === 1 &&
                                typeof t.countDown === 'number'
                            ) {
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

                case 5015: {
                    console.log(5015, mapped);
                    if (tableId) {
                        this.pushState.eventsByTableId[tableId] = mapped;

                        const rt =
                            (this.dgRuntimeByTableId[tableId] ??= {});
                        if (typeof mapped.seat === 'number') {
                            rt.seat = mapped.seat;
                        }
                        if (mapped.gameNo) {
                            rt.gameNo = mapped.gameNo;
                        }

                        this.schedulePush();
                    }
                    break;
                }

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
                        this.pushState.openCardByTableId[tableId][
                            mapped.gameNo
                        ] = mapped;
                        this.schedulePush();
                    }
                    break;

                case 1015: {
                    console.log('1015 id:', tableId, mapped);
                    if (tableId) {
                        const rt =
                            (this.dgRuntimeByTableId[tableId] ??= {});
                        if (typeof mapped.seat === 'number') {
                            rt.seat = mapped.seat;
                        }
                        if (mapped.gameNo) {
                            rt.gameNo = mapped.gameNo;
                        }
                    }
                    break;
                }

                default:
                    break;
            }
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
            this.pushState.roadsByTableId[tid] = mapped.list;
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
            }, 500);
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
            wsPush = new WebSocket(url);

            wsPush.onopen = () => {
                if (pushQueue.length && wsPush) {
                    pushQueue.forEach((msg) => wsPush!.send(msg));
                    pushQueue = [];
                }
            };

            wsPush.onclose = () => {
                wsPush = null;

                // 已经安排了重连，就别重复安排
                if (pushReconnectTimer) return;

                pushReconnectTimer = window.setTimeout(() => {
                    pushReconnectTimer = null;

                    // 防止没真正断开/已有连接又重连
                    if (wsPush && (wsPush.readyState === WebSocket.CONNECTING || wsPush.readyState === WebSocket.OPEN)) {
                        return;
                    }

                    this.connectPushWS();
                }, 5000);
            };

            wsPush.onerror = () => {
                // 忽略
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
            this.rebuildUiTables();

            const payload = {
                type: 'dgGameTableInfos',
                data: this.uiTables, // 直接推轻量的 UiTable 视图
            };

            const text = JSON.stringify(payload);

            if (this.ensurePushWS()) {
                wsPush!.send(text);
            } else {
                pushQueue.push(text);
            }
        },

        enterRoom(tableId: number, gameNo: string) {
            // Android 顺序：29 -> 9 -> 44 -> 19 -> 4
            this.sendPacket(29, { tableId, type: 1 });
            this.sendPacket(9, { tableId, gameNo });
            this.sendPacket(44, { tableId, mid: '0' });
            this.sendPacket(19, { tableId, type: 1 });
            this.sendPacket(4, { tableId, type: 1, seat: -1 });
        },
        // 把 Dart 的 _normalizeTripleDesKey 一比一搬过来
        normalizeTripleDesKey(rawKey: string): CryptoJS.lib.WordArray {
            // 1. 先拿到 UTF-8 字节
            const encoder = new TextEncoder();
            const source = encoder.encode(rawKey); // Uint8Array

            let keyBytes: Uint8Array;

            if (source.length === 0) {
                // 长度为 0：24 个 0
                keyBytes = new Uint8Array(24); // 默认就是 0
            } else if (source.length === 24) {
                // 长度为 24：原样
                keyBytes = source;
            } else if (source.length > 24) {
                // 长度 > 24：截前 24
                keyBytes = source.slice(0, 24);
            } else {
                // 长度 < 24：循环填充到 24
                keyBytes = new Uint8Array(24);
                for (let i = 0; i < 24; i++) {
                    keyBytes[i] = source[i % source.length]!;
                }
            }

            // 2. 把 Uint8Array 转成 CryptoJS 的 WordArray
            const words: number[] = [];
            for (let i = 0; i < keyBytes.length; i += 4) {
                words.push(
                    (keyBytes[i]! << 24) |
                    (keyBytes[i + 1]! << 16) |
                    (keyBytes[i + 2]! << 8) |
                    (keyBytes[i + 3]!)
                );
            }

            return CryptoJS.lib.WordArray.create(words, keyBytes.length);
        },

        dgEncryptToken(plainText: string, keyStr: string): string {
            // 这里用 Utf8 直接当作 key 的字节（等价于 Dart 里 utf8 bytes 再做 3DES）
            const key = this.normalizeTripleDesKey(keyStr);

            const enc = CryptoJS.TripleDES.encrypt(plainText, key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7,
            });

            // CryptoJS 默认 toString() 就是 base64，等价于 Dart 里的 base64Encode
            return enc.toString();
        },

        // 转成 Android 的 key 规范：首字母小写
        normalizeBetKey(source: string): string {
            if (!source) return source;
            if (source.length === 1) return source.toLowerCase();
            return source[0]!.toLowerCase() + source.slice(1);
        },

        // 只下注一个区域的 betData
        buildSingleBetData(params: {
            key: string; // 比如 "P", "Banker", "Tie"
            amount: number; // 金额
            table: string; // info.table
            roadType: string; // info.roadType
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
            console.log(betData, '--betData');

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
            const md5 = CryptoJS.MD5(hashInput).toString(); // 等价 md5Hex

            // 对标 jsonEncode(betData).dgEncryptToken(key: betKey)
            const encBetData = this.dgEncryptToken(
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

        /**
         * 高层：单点下注
         * - gameNo / roadType 可以不传，会自动从 1002 / 5015 / 1015 的缓存里按 tableId 取
         */
        placeSingleBet(params: {
            tableId: number;
            betKey: string; // 如 "P" / "Banker"
            amount: number;
            gameNo?: string;
            roadType?: number; // 不传则用 seat
            tableIndex?: number; // info.table，可先写死 '3'
        }) {
            const tableId = params.tableId;

            // 自动补 gameNo
            const gameNo = this.dgGameNoForBet(tableId) ?? params.gameNo
            if (!gameNo) {
                throw new Error(
                    `找不到 tableId=${tableId} 的 gameNo，请确认已收到 1002/5015/1015`,
                );
            }

            // 自动补 roadType：现在按你说的用 seat，当成 roadType
            const roadTypeNum = this.dgSeatForBet(tableId)
            // if (!roadTypeNum) {
            //     return alert(`找不到 tableId=${tableId} 的 roadType，请确认已收到 5015/1015`);
            // }
            // const roadTypeNum = this.dgObjectTypeForTable(tableId);
            const tableStr = String(params.tableIndex ?? 3); // Android 现在写死 "3"
            const roadTypeStr = String(roadTypeNum);
            const betData = this.buildSingleBetData({
                key: params.betKey,
                amount: params.amount,
                table: tableStr,
                roadType: roadTypeStr,
            });

            // 先 enterRoom 再下注，和 Android 一致
            this.enterRoom(tableId, gameNo);
            setTimeout(() => {
                this.sendDgBet({
                    tableId,
                    gameNo,
                    betData,
                });
            }, 100);
        },
    },
});
