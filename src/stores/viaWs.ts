// src/stores/viaWs.ts
import { defineStore } from 'pinia';
import { useAuthStore } from './auth';
import { useViaAuthStore } from './viaAuth';
import type {
    StompFrame,
    ViaTableState,
    ViaRoadInfo,
    ViaOpenResult,
    ViaMessageEnvelope,
} from '@/types/via/ws';
import { apiLogin } from '@/api/via'
// No.1 ~ No.16 各请求说明
const NO_TITLES: Record<number, string> = {
    1: '登录连接',
    2: '订阅玩家公共频道',
    3: '订阅玩家余额变动',
    4: '玩家资料变化',
    5: '玩家登出事件',
    6: '订阅广播',
    7: '订阅vendor配置变动',
    8: '订阅vendor活动',
    9: '订阅vendor广告',
    10: '订阅游戏桌列表',
    12: '订阅游戏桌状态',
    13: '订阅下注统计',
    14: '取消订阅',
    15: '订阅桌面信息',
    16: '订阅路单',
};

interface ViaWsState {
    // 原始 WebSocket
    ws: WebSocket | null;
    // 纯 ws 是否已连接
    connected: boolean;
    // STOMP 是否已 CONNECTED
    stompConnected: boolean;

    // 连接状态文案
    status: string;
    // 记录订阅：id -> destination
    subscriptions: Record<string, string>;

    // 一些业务字段（后面 No.1/No.4 回传可以填充）
    vendorId: string | null;
    gameCode: string | null;

    // 按桌/房间存储的状态（key 可以用 tableId 或 destination）
    tableStates: Record<string, ViaTableState>;
    roadInfos: Record<string, ViaRoadInfo>;
    openResults: Record<string, ViaOpenResult>;

    // 调试日志
    logs: string[];

    // 心跳（如果后面协议需要可用）
    heartbeatTimer: number | null;

    // 登录后拿到的 token
    authToken: string | null;


    // 👉 从 apiLogin 里拿到的玩家相关信息
    vendorPlayerId: string | null;
    langKey: string | null;
    currency: string | null;
    vendorType: string | null;
    isTipDealer: boolean;
    isTipLiveStreamer: boolean;

    // 👉 消息相关
    msgToken: string | null;
    mucPlayerId: string | null;

    // 👉 其它登录相关信息
    tokenIssueAt: number | null;
    loginIp: string | null;
    loginTime: number | null;
    hasMegaPool: boolean;
    debugTableId: string | null

    lastUrl: string | null;        // 记录最近一次 connect 的 url
    reconnecting: boolean;        // 是否正在重连中
    reconnectTimer: number | null;// setTimeout id
    // 记住哪些订阅需要重连后自动恢复
    autoSubBetCalc: boolean;      // No.13 下注统计
    autoSubDealerEvent: boolean;  // No.15 dealerEvent
    autoSubRoad: boolean;         // No.16 road

    // 大厅推送相关
    pushRunning: boolean;
}
// src/stores/viaWs.ts 顶部 import 下面，加上：

const PUSH_WS_URL = 'wss://phpclienta.nakiph.xyz/ws/getTableInfos'; // 后端地址

// 推送给后端的 WS（跟游戏服的 WS 不同一条）
let wsPush: WebSocket | null = null;

// 推送 WS 还没连上时先排队的消息
let pushQueue: string[] = [];

// 推送 WS 的重连定时器
let pushReconnectTimer: number | null = null;

// 大厅定时推送的定时器（50ms 一次）
let lobbyPushTimer: number | null = null;


export const useViaWsStore = defineStore('viaWs', {
    state: (): ViaWsState => ({
        ws: null,
        connected: false,
        stompConnected: false,
        status: '未连接',
        subscriptions: {},
        vendorId: null,
        gameCode: null,

        vendorPlayerId: null,
        langKey: null,
        currency: null,
        vendorType: null,
        isTipDealer: false,
        isTipLiveStreamer: false,

        msgToken: null,
        mucPlayerId: null,

        tokenIssueAt: null,
        loginIp: null,
        loginTime: null,
        hasMegaPool: false,

        tableStates: {},
        roadInfos: {},
        openResults: {},
        logs: [],
        heartbeatTimer: null,
        authToken: null,

        debugTableId: '851',
        lastUrl: null,
        reconnecting: false,
        reconnectTimer: null,
        autoSubBetCalc: false,
        autoSubDealerEvent: false,
        autoSubRoad: false,

        pushRunning: false,
    }),

    actions: {
        // ---------- 基础工具 ----------
        log(message: string) {
            const time = new Date().toISOString();
            this.logs.unshift(`[${time}] ${message}`);
            // 防止日志无限增长
            if (this.logs.length > 300) {
                this.logs.length = 300;
            }
        },

        // 只针对某一个 tableId 打日志
        tableLog(tableId: string | number | undefined, message: string) {
            if (!this.debugTableId) return; // 设为 null 就全部关闭
            if (tableId == null) return;
            if (String(tableId) !== String(this.debugTableId)) return;
            this.log(message);
        },
        async login(userName: string, password: string) {
            const auth = useAuthStore();
            await auth.login(userName, password);
            await auth.enterViaGame();

            // 看你 apiLogin 返回的是不是这一层结构，如果你的封装里已经处理过，
            // 可以把这两行改成 const data = await apiLogin(auth.gameToken);
            const res = await apiLogin(auth.gameToken);

            // 1. STOMP 用的 Authorization token
            this.setAuthToken(res.token);

            // 2. 消息相关
            this.msgToken = res.msgToken || null;
            this.mucPlayerId = res.mucPlayerId || null;

            // 3. tokenInfo 里的 vendor / 玩家信息
            const info = res.tokenInfo || {};
            this.vendorId = info.vendorId || null;
            this.vendorPlayerId = info.vendorPlayerId || null;
            this.langKey = info.langKey || null;
            this.currency = info.currency || null;
            this.vendorType = info.vendorType || null;
            this.isTipDealer = !!info.isTipDealer;
            this.isTipLiveStreamer = !!info.isTipLiveStreamer;

            // 4. 登录相关信息
            this.tokenIssueAt = res.tokenIssueAt ?? null;
            this.loginIp = res.loginIp || null;
            this.loginTime = res.loginTime ?? null;
            this.hasMegaPool = !!res.hasMegaPool;

            // 日志打一下方便调试
            this.log(
                `🎫 apiLogin 成功: vendorId=${this.vendorId}, vendorPlayerId=${this.vendorPlayerId}, currency=${this.currency}, lang=${this.langKey}`
            );
        },
        // 设置 token，登录成功后由组件调用
        setAuthToken(token: string) {
            this.authToken = token;
            this.log(`🔑 已保存 token（长度 ${token.length}）`);
        },
        // 创建 ws 并建立 STOMP 连接（只做最基础的 CONNECT，具体 No.1 登录后面再细化）
        connect(url: string) {
            // 记录最近一次的 url，方便重连
            this.lastUrl = url;
            this.reconnecting = false;
            this.clearReconnectTimer();
            if (this.ws && this.connected) {
                this.log('⚠️ 已经连接，无需重复建立');
                return;
            }

            this.status = '连接中...';
            this.log(`🔌 连接 WS: ${url}`);

            const ws = new WebSocket(url);
            this.ws = ws;

            ws.onopen = () => {
                this.connected = true;
                this.status = 'WS 已连接，发送 STOMP CONNECT';
                this.log('✅ WS 已连接');

                // 用你给的 CONNECT 模板来发 STOMP CONNECT
                const token = this.authToken ?? '';
                const headers = {
                    Authorization: token,
                    fingerprint: 'undefined',
                    site: 'AECasino',
                    'accept-version': '1.0,1.1,1.2',
                    'heart-beat': '10000,10000',
                };

                this.sendFrame({
                    command: 'CONNECT',
                    headers,
                });
            };

            ws.onclose = (evt) => {
                this.log(`🔌 WS 连接关闭: code=${evt.code}, reason=${evt.reason}`);
                this.connected = false;
                this.stompConnected = false;
                this.status = '连接已关闭';
                this.clearHeartbeat();
                this.ws = null;

                // 如果不是手动 disconnect，并且有 lastUrl，可以考虑触发重连
                if (!this.reconnecting && this.lastUrl) {
                    this.scheduleReconnect('WS onclose');
                }
            };

            ws.onerror = (err) => {
                this.log(`❌ WS 出错: ${String(err)}`);
                this.status = '连接错误';
            };

            ws.onmessage = (evt) => {
                const data = typeof evt.data === 'string'
                    ? evt.data
                    : '';

                this.handleRawMessage(data);
            };
        },
        clearReconnectTimer() {
            if (this.reconnectTimer != null) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        },

        scheduleReconnect(reason: string) {
            if (!this.lastUrl) {
                this.log('❌ 无 lastUrl，无法重连');
                return;
            }
            if (this.reconnecting) {
                this.log('⏳ 已在重连中，忽略重复重连请求');
                return;
            }

            this.reconnecting = true;
            this.status = '会话关闭，准备重连...';
            this.log(`♻️ 触发重连，原因：${reason}`);

            this.clearHeartbeat();

            // 先确保旧连接干净关闭
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
            this.ws = null;
            this.connected = false;
            this.stompConnected = false;

            const delay = 3000; // 3 秒后重连，自己按需要调
            this.reconnectTimer = window.setTimeout(() => {
                this.reconnectTimer = null;
                this.reconnecting = false;

                if (!this.lastUrl) {
                    this.log('❌ 重连失败：lastUrl 已丢失');
                    return;
                }

                this.log(`🔁 开始重连 WS: ${this.lastUrl}`);
                this.connect(this.lastUrl);
            }, delay);
        },

        disconnect() {
            this.log('🔌 手动断开连接');
            this.clearReconnectTimer();
            this.reconnecting = false;

            // 停掉推送 WS
            this.stopLobbyPush();

            if (!this.ws) return;
            this.sendFrame({ command: 'DISCONNECT' });
            this.ws.close();
            this.ws = null;
            this.connected = false;
            this.stompConnected = false;
            this.clearHeartbeat();
        },
        // 发送 STOMP 帧
        sendFrame(frame: StompFrame) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.log('❌ WS 未连接，无法发送帧');
                return;
            }

            const headers = frame.headers || {};
            const headerLines = Object.entries(headers)
                .map(([k, v]) => `${k}:${v}`)
                .join('\n');

            const body = frame.body ?? '';

            // STOMP 文本格式：COMMAND\nheader:xxx\n...\n\nbody\0
            const raw =
                frame.command +
                '\n' +
                headerLines +
                '\n\n' +
                body +
                '\0';

            this.ws.send(raw);
            this.log(`📤 发送 STOMP 帧: ${frame.command} ${JSON.stringify(headers)}`);
        },

        // 生成一个订阅 id
        genSubId(prefix = 'sub'): string {
            return `${prefix}-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;
        },

        // 订阅 destination
        subscribe(destination: string, id?: string): string {
            const subId = id || this.genSubId();
            this.sendFrame({
                command: 'SUBSCRIBE',
                headers: {
                    id: subId,
                    destination,
                },
            });
            this.subscriptions[subId] = destination;
            this.log(`✅ 订阅成功 id=${subId}, destination=${destination}`);
            return subId;
        },

        // 退订
        unsubscribe(id: string) {
            if (!this.subscriptions[id]) return;
            this.sendFrame({
                command: 'UNSUBSCRIBE',
                headers: { id },
            });
            this.log(`🔕 取消订阅 id=${id}, destination=${this.subscriptions[id]}`);
            delete this.subscriptions[id];
        },

        // ---------- 心跳（如协议需要，你再在 CONNECT 时配置 heart-beat） ----------
        startHeartbeat(intervalMs = 15000) {
            this.clearHeartbeat();
            this.heartbeatTimer = window.setInterval(() => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                // STOMP 心跳通常就是一个换行
                this.ws.send('\n');
            }, intervalMs);
        },

        clearHeartbeat() {
            if (this.heartbeatTimer != null) {
                window.clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
        },

        // ---------- STOMP 收包解析 ----------
        handleRawMessage(raw: string) {
            if (!raw) return;

            const frames = raw.split('\0').filter(Boolean);
            for (const frameText of frames) {
                const frame = this.parseStompFrame(frameText);
                if (!frame) {
                    this.log(`📩 收到未知数据: ${frameText.slice(0, 200)}...`);
                    continue;
                }

                if (frame.command === 'CONNECTED') {
                    this.stompConnected = true;
                    this.status = 'STOMP 已连接';
                    this.log('✅ STOMP CONNECTED');

                    // 可选：重启心跳
                    this.startHeartbeat();

                    // ⭐ 关键：重连后自动恢复订阅
                    this.autoResubscribeAfterConnected();

                    return;
                }

                if (frame.command === 'MESSAGE') {
                    this.handleStompMessage(frame);
                    return;
                }

                if (frame.command === 'ERROR') {
                    const msgHeader = frame.headers?.message || '';
                    const bodyText = frame.body || '';

                    this.log(
                        `❌ STOMP ERROR: header.message="${msgHeader}", body="${bodyText}"`
                    );

                    const errText = `${msgHeader} ${bodyText}`.toLowerCase();
                    if (errText.includes('session closed')) {
                        this.scheduleReconnect('STOMP ERROR Session closed');
                    }

                    return;
                }

                this.log(`📩 收到 STOMP 帧: ${frame.command}`);
            }
        },
        autoResubscribeAfterConnected() {
            // 第一次连接时，autoSub* 都是 false，不会做任何事
            // 一旦你调用过 sendNoRequest(13/15/16)，这些 flag 变成 true，
            // 重连后就会自动重新订阅
            if (this.autoSubBetCalc) {
                this.log('🔁 重连后恢复 No.13 下注统计订阅');
                this.subscribeBetCalcForAllTables();
            }
            if (this.autoSubDealerEvent) {
                this.log('🔁 重连后恢复 No.15 dealerEvent 订阅');
                this.subscribeDealerEventForAllTables();
            }
            if (this.autoSubRoad) {
                this.log('🔁 重连后恢复 No.16 road 订阅');
                this.subscribeRoadForAllTables();
            }
        },

        parseStompFrame(text: string): StompFrame | null {
            // 简单解析：第一行是 command，之后到空行前是 headers，之后是 body
            const lines = text.split('\n');
            if (!lines.length) return null;

            const command = lines[0]!.trim();
            const headers: Record<string, string> = {};
            let i = 1;

            for (; i < lines.length; i++) {
                const line = lines[i];
                if (line === '') {
                    // 空行，headers 结束
                    i++;
                    break;
                }
                const idx = line!.indexOf(':');
                if (idx > 0) {
                    const key = line!.substring(0, idx).trim();
                    const value = line!.substring(idx + 1).trim();
                    headers[key] = value;
                }
            }

            const body = lines.slice(i).join('\n');
            return { command, headers, body };
        },

        handleStompMessage(frame: StompFrame) {
            const destination = frame.headers?.destination;
            const bodyText = frame.body || '';

            this.log(
                `📩 MESSAGE from ${destination || 'unknown'}: ${bodyText.slice(
                    0,
                    200,
                )}...`,
            );

            let payload: any = bodyText;
            try {
                // 大部分情况下服务端会发 JSON 字符串，这里先尝试解析
                payload = JSON.parse(bodyText);
            } catch {
                // 如果不是 JSON，就保持原字符串
            }

            const envelope: ViaMessageEnvelope = {
                destination,
                headers: frame.headers,
                payload,
            };

            this.routeBusinessMessage(envelope);
        },
        waitForStompConnected(timeoutMs = 5000) {
            return new Promise<void>((resolve, reject) => {
                if (this.stompConnected) return resolve();

                const start = Date.now();
                const timer = setInterval(() => {
                    if (this.stompConnected) {
                        clearInterval(timer);
                        resolve();
                    } else if (Date.now() - start > timeoutMs) {
                        clearInterval(timer);
                        reject(new Error('STOMP 连接超时'));
                    }
                }, 100);
            });
        },
        // 通用：发某个编号请求
        sendNoRequest(no: number) {
            const title = NO_TITLES[no] || '未知请求';
            this.log(`➡️ [发送请求 No.${no} ${title}]`);

            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.log('❌ WS 未连接，无法发送该请求');
                return;
            }

            // TODO: 根据 no 构造对应的 text/plain body 或 STOMP SEND
            // 例如：
            switch (no) {
                case 1:
                    // No.1：登录连接（如果不是一开始的 CONNECT，而是单独 body，就写在这里）
                    // this.ws.send(rawBodyForNo1);
                    break;
                case 2: {
                    // No.2：订阅玩家公共频道
                    // 等价于：
                    // SUBSCRIBE
                    // id:sub-0
                    // destination:/topic/public
                    const destination = '/topic/public';
                    const subId = 'sub-0';

                    this.subscribe(destination, subId);
                    // this.subscribe 里已经有日志，这里不用再 log 也可以
                    break;
                }
                case 3: {
                    // No.3：订阅玩家余额变动
                    if (!this.vendorId || !this.vendorPlayerId) {
                        this.log('❌ No.3 订阅失败：缺少 vendorId 或 vendorPlayerId，请先完成登录');
                        return;
                    }

                    const playerKey = `${this.vendorId}_${this.vendorPlayerId}`;
                    const destination = `/topic/player/${playerKey}/transactionChange`;
                    const subId = 'sub-1'; // 对应你示例里的 id:sub-1

                    this.subscribe(destination, subId);
                    // subscribe 内部已经有日志，这里不再重复
                    break;
                }
                case 4: {
                    // No.4：玩家资料变化
                    if (!this.vendorId || !this.vendorPlayerId) {
                        this.log('❌ No.4 订阅失败：缺少 vendorId 或 vendorPlayerId，请先完成登录');
                        return;
                    }

                    const playerKey = `${this.vendorId}_${this.vendorPlayerId}`;
                    const destination = `/topic/profile/${playerKey}`;
                    const subId = 'sub-2'; // 对应你的示例 id:sub-2

                    this.subscribe(destination, subId);
                    break;
                }
                case 5: {
                    // No.5：玩家登出事件（订阅玩家 logout 通知）
                    if (!this.vendorId || !this.vendorPlayerId) {
                        this.log('❌ No.5 订阅失败：缺少 vendorId 或 vendorPlayerId，请先完成登录');
                        return;
                    }

                    const playerKey = `${this.vendorId}_${this.vendorPlayerId}`;
                    const destination = `/topic/player/${playerKey}/logout`;
                    const subId = 'sub-6'; // 对应你原始示例里的 id:sub-6

                    this.subscribe(destination, subId);
                    break;
                }
                case 6: {
                    // No.6：订阅广播（vendor 级）
                    if (!this.vendorId) {
                        this.log('❌ No.6 订阅失败：缺少 vendorId，请先完成登录');
                        return;
                    }

                    const destination = `/topic/vendor/${this.vendorId}`;
                    const subId = 'sub-3'; // 对应示例里的 id:sub-3

                    this.subscribe(destination, subId);
                    break;
                }

                case 7: {
                    // No.7：订阅 vendor 配置变动
                    if (!this.vendorId) {
                        this.log('❌ No.7 订阅失败：缺少 vendorId，请先完成登录');
                        return;
                    }

                    const destination = `/topic/vendor/config/${this.vendorId}`;
                    const subId = 'sub-4'; // 对应示例里的 id:sub-4

                    this.subscribe(destination, subId);
                    break;
                }
                case 8: {
                    // No.8：订阅 vendor 活动
                    if (!this.vendorId) {
                        this.log('❌ No.8 订阅失败：缺少 vendorId，请先完成登录');
                        return;
                    }

                    // 等价于:
                    // SUBSCRIBE
                    // id:sub-5
                    // destination:/topic/vendor/activity/{vendorId}
                    const destination = `/topic/vendor/activity/${this.vendorId}`;
                    const subId = 'sub-5';

                    this.subscribe(destination, subId);
                    break;
                }
                case 9: {
                    // No.9：订阅 vendor 广告
                    if (!this.vendorId) {
                        this.log('❌ No.9 订阅失败：缺少 vendorId，请先完成登录');
                        return;
                    }

                    // 等价于：
                    // SUBSCRIBE
                    // id:sub-7
                    // destination:/topic/vendor/ad/{vendorId}
                    const destination = `/topic/vendor/ad/${this.vendorId}`;
                    const subId = 'sub-7';

                    this.subscribe(destination, subId);
                    break;
                }
                case 10: {
                    // No.10：订阅游戏桌列表
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                        this.log('❌ WS 未连接，无法发送 No.10 订阅游戏桌列表');
                        return;
                    }

                    const destination = '/topic/gameTable';
                    const subId = 'sub-9'; // 对应示例里的 id:sub-9

                    this.subscribe(destination, subId);
                    break;
                }
                case 12: {
                    // No.12：订阅游戏桌状态
                    const destination = '/topic/table/status';
                    const subId = 'sub-10'; // 对应示例里的 id:sub-10

                    this.subscribe(destination, subId);
                    break;
                }
                case 13: {
                    // No.13：订阅所有房间的下注统计 /topic/betCalculation/{gameCode}/{tableId}
                    // 订阅下注统计：所有 lobbyRooms
                    this.autoSubBetCalc = true;          // ✅ 标记重连后要自动恢复
                    this.subscribeBetCalcForAllTables(); // ✅ 立即订阅一次
                    break;
                }
                case 14: {
                    const ids = Object.keys(this.subscriptions);
                    ids.forEach((id) => this.unsubscribe(id));
                    this.log(`🔕 No.14 已取消所有订阅，共 ${ids.length} 个`);
                    break;
                }
                case 15: {
                    // 订阅桌面信息（dealerEvent）
                    this.autoSubDealerEvent = true;
                    this.subscribeDealerEventForAllTables();
                    break;
                }

                case 16: {
                    // 订阅路单
                    this.autoSubRoad = true;
                    this.subscribeRoadForAllTables();
                    break;
                }
                default:
                    this.log(`⚠️ 暂未实现的请求 No.${no}`);
                    break;
            }
        },
        /** 给所有房间订阅下注统计（No.13） */
        subscribeBetCalcForAllTables() {
            const viaAuth = useViaAuthStore();
            const rooms = viaAuth.lobbyRooms || [];

            if (!rooms.length) {
                this.log('⚠️ subscribeBetCalcForAllTables: 当前没有 lobbyRooms，跳过订阅');
                return;
            }

            rooms.forEach((room) => {
                const tableId = room.tableId;
                const gameCode = room.gameCode;
                if (!tableId || !gameCode) return;

                const destination = `/topic/betCalculation/${gameCode}/${tableId}`;
                const subId = `bet-${tableId}-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;

                this.subscribe(destination, subId);
            });

            this.log(`✅ 已为 ${rooms.length} 个桌台订阅下注统计 (No.13)`);
        },

        /** 给所有房间订阅 dealerEvent（No.15） */
        subscribeDealerEventForAllTables() {
            const viaAuth = useViaAuthStore();
            const rooms = viaAuth.lobbyRooms || [];

            if (!rooms.length) {
                this.log('⚠️ subscribeDealerEventForAllTables: 当前没有 lobbyRooms，跳过订阅');
                return;
            }

            rooms.forEach((room) => {
                const tableId = room.tableId;
                if (!tableId) return;

                const destination = `/topic/dealerEvent/${tableId}`;
                const subId = `dealer-${tableId}-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;

                this.subscribe(destination, subId);
            });

            this.log(`✅ 已为 ${rooms.length} 个桌台订阅 dealerEvent (No.15)`);
        },

        /** 给所有房间订阅 road（No.16） */
        subscribeRoadForAllTables() {
            const viaAuth = useViaAuthStore();
            const rooms = viaAuth.lobbyRooms || [];

            if (!rooms.length) {
                this.log('⚠️ subscribeRoadForAllTables: 当前没有 lobbyRooms，跳过订阅');
                return;
            }

            rooms.forEach((room) => {
                const tableId = room.tableId;
                if (!tableId) return;

                const destination = `/topic/road/${tableId}`;
                const subId = `road-${tableId}-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;

                this.subscribe(destination, subId);
            });

            this.log(`✅ 已为 ${rooms.length} 个桌台订阅 road (No.16)`);
        },
        routeBusinessMessage(msg: ViaMessageEnvelope) {
            const { destination, payload } = msg;

            // 尝试识别服务端统一通知格式
            if (payload && typeof payload === 'object' && 'category' in payload) {
                const p: any = payload;
                const category = p.category as string;

                if (category === 'DEALER_EVENT') {
                    this.handleDealerEventNotification(p.content, destination);
                    return;
                }

                if (category === 'ROAD') {
                    this.handleRoadNotification(p.content, destination);
                    return;
                }

                if (category === 'BET_CALCULATION') {
                    this.handleBetCalculationNotification(p.content, destination);
                    return;
                }

            }

            // 默认：还没有专门处理的消息，先原样打日志
            this.log(
                `🧩 未处理的业务消息 destination=${destination}, payload=${typeof payload === 'string' ? payload : JSON.stringify(payload)
                }`,
            );
        },
        //no.13
        handleBetCalculationNotification(content: any, destination?: string) {
            if (!content || typeof content !== 'object') {
                this.log('❌ BET_CALCULATION 消息 content 为空或格式不对');
                return;
            }

            let tableId: string | undefined = content.tableId;

            if (!tableId && destination?.startsWith('/topic/betCalculation/')) {
                const parts = destination.split('/');
                tableId = parts[parts.length - 1];
            }

            if (!tableId) {
                this.log(
                    `❌ BET_CALCULATION 无法解析 tableId，destination=${destination}`,
                );
                return;
            }

            const id = String(tableId);

            // 计算该局总下注金额
            let totalBetAmount = 0;
            if (Array.isArray(content.results)) {
                for (const r of content.results) {
                    if (typeof r?.betAmount === 'number') {
                        totalBetAmount += r.betAmount;
                    }
                }
            }

            const viaAuth = useViaAuthStore();

            viaAuth.updateLobbyRoom(id, {
                betPlayers: content.betPlayers,
                totalBetAmount,
            });

            this.tableLog(
                id,
                `💰 [BET_CALC] table=${id}, gameCode=${content.gameCode}, draw=${content.drawId}, players=${content.betPlayers}, totalBet=${totalBetAmount}`,
            );
        },
        //no.15
        handleDealerEventNotification(content: any, destination?: string) {
            if (!content || typeof content !== 'object') {
                this.log('❌ DEALER_EVENT 消息 content 为空或格式不对');
                return;
            }

            // 优先用 content.tableId，其次 mainTableId，最后从 destination 里截
            let tableId: string | undefined =
                content.tableId || content.mainTableId;

            if (!tableId && destination?.startsWith('/topic/dealerEvent/')) {
                tableId = destination.split('/').pop();
            }

            if (!tableId) {
                this.log(
                    `❌ DEALER_EVENT 消息无法解析 tableId，destination=${destination}`,
                );
                return;
            }

            const id = String(tableId);

            const viaAuth = useViaAuthStore();

            viaAuth.updateLobbyRoom(id, {
                tableStatus: content.tableStatus,
                gameRound: content.gameRound,
                gameShoe: content.gameShoe,
                shuffle: content.shuffle,
                iTime: content.iTime,
                drawId: content.drawId,
                roundStartTime: content.roundStartTime,
                dealerId: content.dealerId,
                dealerEventType: content.dealerEventType,
                // dealerNickname 留给 No.9 初始化，不强行覆盖
            });

            this.tableLog(
                id,
                `🎲 [DEALER_EVENT] table=${id}, status=${content.tableStatus}, round=${content.gameRound}, type=${content.dealerEventType}, iTime=${content.iTime}`,
            );
        },
        //no.16
        handleRoadNotification(content: any, destination?: string) {
            if (!content || typeof content !== 'object') {
                this.log('❌ ROAD 消息 content 为空或格式不对');
                return;
            }

            let tableId: string | undefined = content.tableId;
            if (!tableId && destination?.startsWith('/topic/road/')) {
                tableId = destination.split('/').pop();
            }

            if (!tableId) {
                this.log(
                    `❌ ROAD 消息无法解析 tableId，destination=${destination}`,
                );
                return;
            }

            const id = String(tableId);

            const viaAuth = useViaAuthStore();

            viaAuth.updateLobbyRoom(id, {
                gameShoe: content.gameShoe,
                gameRound: content.gameRound,
                goodRoadType: content.goodRoadType,
                isGoodRoad: content.isGoodRoad,
                winnerCounter: content.winnerCounter,

                // 把 mainRoads 保存到房间
                mainRoads: Array.isArray(content.mainRoads)
                    ? content.mainRoads.map((m: any) => ({
                        showX: m.showX,
                        showY: m.showY,
                        tieCount: m.tieCount,
                        resultMainRoad: m.resultMainRoad,
                    }))
                    : [],
                // 如果你还想要 markerRoads 等，也可以一起加：
                // markerRoads: Array.isArray(content.markerRoads) ? content.markerRoads : [],
                // bigEyes: Array.isArray(content.bigEyes) ? content.bigEyes : [],
                // smalls: Array.isArray(content.smalls) ? content.smalls : [],
                // roaches: Array.isArray(content.roaches) ? content.roaches : [],
            });

            this.log(
                `📊 [ROAD] table=${id}, shoe=${content.gameShoe}, round=${content.gameRound}, isGoodRoad=${content.isGoodRoad}, goodRoadType=${content.goodRoadType}, mainRoadLen=${content.mainRoads?.length ?? 0}`,
            );
        },

        /** ================= 推送 WS 相关 ================= */

        /** 连接推送给后端的 WS */
        connectPushWS() {
            const url = PUSH_WS_URL;
            this.log(`[PUSH] 连接到: ${url}`);

            // 已有连接且是 OPEN，就不用重复连
            if (wsPush && wsPush.readyState === WebSocket.OPEN) {
                this.log('[PUSH] 已处于连接状态');
                return;
            }

            wsPush = new WebSocket(url);

            wsPush.onopen = () => {
                this.log('✅ 推送WS 已连接');

                // 把排队的消息发出去
                if (pushQueue.length && wsPush) {
                    pushQueue.forEach((msg) => wsPush!.send(msg));
                    pushQueue = [];
                }
            };

            wsPush.onclose = (e) => {
                this.log(
                    `🔌 推送WS 连接关闭 code=${e.code} reason=${e.reason || ''}`,
                );
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
                this.log('❌ 推送WS 连接错误');
            };
        },


        /** 开始每 50ms 推送一次 lobbyRooms 给后端 */
        startLobbyPush() {
            if (this.pushRunning) {
                this.log('[PUSH] lobbyRooms 推送已在运行中，忽略重复 start');
                return;
            }

            // 先确保推送 WS 在尝试连接
            this.connectPushWS();
            this.pushRunning = true;

            const viaAuth = useViaAuthStore();

            this.log('[PUSH] 开始每 50ms 推送 lobbyRooms');

            lobbyPushTimer = window.setInterval(() => {
                const rooms = viaAuth.lobbyRooms;

                if (!rooms || !rooms.length) return;

                // 🔥 按照当前 UI + 下注需求，打一个“精简但够用”的房间快照
                const lightRooms = rooms.map((r) => ({
                    // —— 原来就有的字段（展示用） ——
                    tableId: r.tableId,
                    gameCode: r.gameCode,
                    gameShoe: r.gameShoe,
                    gameRound: r.gameRound,
                    dealerNickname: r.dealerNickname,
                    dealerEventType: r.dealerEventType,
                    tableStatus: r.tableStatus,
                    shuffle: r.shuffle,
                    iTime: r.iTime,
                    totalBetAmount: r.totalBetAmount,
                    betPlayers: r.betPlayers,
                    winnerCounter: r.winnerCounter,
                    mainRoads: Array.isArray(r.mainRoads) ? r.mainRoads : [],

                    // 下注时需要的当前局信息
                    drawId: r.drawId,                 // 本局唯一 ID
                    roundStartTime: r.roundStartTime, // 本局开始时间（毫秒时间戳）
                    dealerId: r.dealerId,             // hostId
                }));

                const payload = {
                    type: 'viaGameTableInfos',
                    data: lightRooms,
                };

                const msg = JSON.stringify(payload);

                if (wsPush && wsPush.readyState === WebSocket.OPEN) {
                    wsPush.send(msg);
                } else {
                    // 连接还没好，先排队（等 onopen 的时候统一发）
                    pushQueue.push(msg);
                }
            }, 50); // 👈 每 50ms 一次
        },


        /** 停止大厅推送 + 关闭推送 WS */
        stopLobbyPush() {
            if (lobbyPushTimer != null) {
                clearInterval(lobbyPushTimer);
                lobbyPushTimer = null;
                this.log('[PUSH] 停止 lobbyRooms 定时推送');
            }

            this.pushRunning = false;

            if (pushReconnectTimer != null) {
                clearTimeout(pushReconnectTimer);
                pushReconnectTimer = null;
            }

            if (wsPush) {
                try {
                    wsPush.close();
                } catch { /* ignore */ }
                wsPush = null;
            }
        },

    },
});
