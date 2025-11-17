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
}

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
        wskey: 'pV5mY8dR2qGxH1sK9tBzN6uC3fWjE0aL7rTnJ4cQvSgPZyFMiXoUbDlAhOeRwd36',
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
    }),
    actions: {
        initFromAuth() {
            const authStore = useAuthStore();
            this.token = authStore.gameToken || authStore.auth?.accessToken || '';
            this.wskey = authStore.wskey || 'pV5mY8dR2qGxH1sK9tBzN6uC3fWjE0aL7rTnJ4cQvSgPZyFMiXoUbDlAhOeRwd36';
        },
        setWsConfig(payload: { token?: string; wskey?: string; mid?: string; tableId?: number; type?: number }) {
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
            this.log(`📤 已发送 cmd=${cmd}`);
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
                    this.log(`📤 已发送 cmd=${pkt.cmd}`);
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
                this.log('📩 解码失败: ' + err?.message);
            }
        },
        _handleDecoded(u8: Uint8Array) {
            const raw = parseMsg(new Reader(u8));
            const mapped = mapPublicBean(raw);
            const cmd = mapped.cmd | 0;
            const tableId = (mapped as any).tableId || (mapped as any).tableID || 0;

            // 根据 cmd 更新 pushState（基本照搬你原来的 switch）
            switch (cmd) {
                case 10086:
                    this.pushState.list = Array.isArray(mapped.list) ? mapped.list : [];
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
                    this.handleTableArrayLike(mapped, 'roadsByTableId');
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
                        this.pushState.openCardByTableId[tableId][mapped.gameNo] = mapped;
                        this.schedulePush();
                    }
                    break;
                default:
                    break;
            }
            this.log('📩 收到: ' + JSON.stringify(mapped));
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
        schedulePush() {
            if (this.pushTimer) return;
            this.pushTimer = window.setTimeout(() => {
                this.pushTimer = null;
                this.rebuildUiTables();
            }, 60);
        },
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
    },
});
