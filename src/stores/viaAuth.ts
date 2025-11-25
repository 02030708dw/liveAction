// src/stores/viaAuth.ts
import { defineStore } from 'pinia';
import type { ViaLobbyRoom, LobbyRoomMutableFields } from '@/types/via/lobby';
import {
    STEP_ORDER,
    STEP_LABEL,
    type StepKey,
    type StepState,
    type ViaFlowState,
} from '@/types/via/flow';
import {
    apiLogin,
    apiGetProfile,
    apiGetGameTypes,
    apiGetGameHalls,
    apiInitRoad,
    apiGetVendorGlobalSetting,
    apiGetVendorGameConfig,
    apiGetOnlineStats,
    apiGetTableCurrencyMappingDetail,
    apiGetRoads,
    apiGetBetCalculation,
    apiGetDealerEvents,
    apiGetCurrentBet,
    apiGetNextRoad,
    apiJoinDealerRoomRaw,
    apiGetVideoStream,
    apiPlaceBet,
} from '@/api/via';
import type {
    ViaPlayerLoginData,
    ViaPlayerProfileData,
    ViaGameTypeData,
    ViaGameHall,
    ViaPlayerRoadData,
    ViaVendorGlobalSettingData,
    ViaVendorGameConfigData,
    ViaOnlineStatsData,
    ViaTableCurrencyMappingData,
    ViaRoadData,
    ViaBetCalcData,
    ViaDealerEventData,
    ViaCurrentBetData,
    ViaRoadNextData,
    ViaVideoStreamData,
    ViaBetReq,
    ViaBetRespData,
} from '@/types/via/api';

import { useAuthStore } from './auth';

function createInitialSteps(): Record<StepKey, StepState> {
    const result = {} as Record<StepKey, StepState>;
    STEP_ORDER.forEach((key) => {
        result[key] = {
            name: STEP_LABEL[key],
            loading: false,
            success: null,
            error: null,
            response: null,
        };
    });
    return result;
}

export const useViaAuthStore = defineStore('viaAuth', {
    state: (): ViaFlowState & {
        platformToken: string;
        loginData: ViaPlayerLoginData | null;
        profileData: ViaPlayerProfileData | null;
        gameTypeData: ViaGameTypeData | null;
        gameHallData: ViaGameHall[] | null;
        playerRoadData: ViaPlayerRoadData | null;
        vendorGlobalSettingData: ViaVendorGlobalSettingData | null;
        vendorGameConfigData: ViaVendorGameConfigData | null;
        onlineStats: ViaOnlineStatsData | null;
        tableCurrencyMappingData: ViaTableCurrencyMappingData | null;
        roadsData: ViaRoadData | null;
        betCalcData: ViaBetCalcData | null;
        dealerEvents: ViaDealerEventData | null;
        currentBets: ViaCurrentBetData | null;
        nextRoad: ViaRoadNextData | null;
        videoStream: ViaVideoStreamData | null;
        betLoading: boolean;
        betError: string | null;
        lastBetReq: ViaBetReq | null;
        lastBetResult: ViaBetRespData | null;
        //大厅房间整合数据
        lobbyRooms: ViaLobbyRoom[];
    } => ({
        running: false,
        currentStepIndex: -1,
        steps: createInitialSteps(),
        logs: [],
        platformToken: '',
        headerAuthToken: '',
        loginData: null,
        profileData: null,
        gameTypeData: null,
        gameHallData: null,
        playerRoadData: null,
        vendorGlobalSettingData: null,
        vendorGameConfigData: null,
        onlineStats: null,
        tableCurrencyMappingData: null,
        roadsData: null,
        betCalcData: null,
        dealerEvents: null,
        currentBets: null,
        nextRoad: null,
        videoStream: null,
        // No.17 下注相关状态
        betLoading: false,
        betError: null,
        lastBetReq: null,
        lastBetResult: null,

        lobbyRooms: [],
    }),

    actions: {
        log(msg: string) {
            const time = new Date().toLocaleTimeString();
            this.logs.unshift(`[${time}] ${msg}`);
        },

        reset() {
            this.running = false;
            this.currentStepIndex = -1;
            this.steps = createInitialSteps();
            this.logs = [];
            this.platformToken = '';
            this.headerAuthToken = '';
            this.loginData = null;
            this.profileData = null;
            this.gameTypeData = null;
            this.gameHallData = null;
            this.playerRoadData = null;
            this.vendorGlobalSettingData = null;
            this.vendorGameConfigData = null;
            this.onlineStats = null;
            this.tableCurrencyMappingData = null;
            this.roadsData = null;
            this.dealerEvents = null;
            this.currentBets = null;
            this.videoStream = null;

            this.lobbyRooms = [];
        },

        /**
         * ☝️ 关键：在 VIA 自己的 store 里，决定“怎么从平台拿 token”
         * 不改 auth，只调用 auth.enterGame + 读 auth.gameToken
         */
        async prepareTokenFromPlatform() {
            const authStore = useAuthStore();

            // 如果 authStore 里已经有 gameToken（之前别的地方调过 enterGame 了），直接用
            if (authStore.gameToken) {
                this.platformToken = authStore.gameToken;
                return;
            }

            await authStore.enterViaGame();

            // enterGame 内部会自己解析 resultSet 里的 URL，并写入 authStore.gameToken
            if (!authStore.gameToken) {
                throw new Error('enterGame 调用成功，但没有拿到 gameToken');
            }

            this.platformToken = authStore.gameToken;
        },

        async runStep(key: StepKey): Promise<boolean> {
            const step = this.steps[key];
            if (!step) return false;

            step.loading = true;
            step.error = null;
            step.success = null;
            this.log(`开始：${step.name}`);

            try {
                let res: any;

                // 🔹No.1登录
                if (key === 'step01Login') {
                    if (!this.platformToken) {
                        await this.prepareTokenFromPlatform();
                    }
                    const data = await apiLogin(this.platformToken);
                    this.loginData = data;
                    res = data;
                }
                // 🔹No.2获取个人信息
                else if (key === 'step02GetProfile') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    const profile = await apiGetProfile(this.loginData.token);
                    this.profileData = profile;
                    res = profile;
                }
                // 🔹 No.3 获取游戏类型：同样用 step1 的 token 做 header.authorization
                else if (key === 'step03GetGameTypes') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    const gameTypes = await apiGetGameTypes(this.loginData.token);
                    this.gameTypeData = gameTypes;
                    res = gameTypes;
                }
                // 🔹 No.4 游戏厅层级定义 /gameHall
                else if (key === 'step04GetHallLevels') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    const halls = await apiGetGameHalls(this.loginData.token);
                    this.gameHallData = halls;
                    res = halls;
                }
                // 🔹 No.5 初始化牌路 /player/road
                else if (key === 'step05InitRoad') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    const road = await apiInitRoad(this.loginData.token);
                    this.playerRoadData = road;
                    res = road;
                }
                // 🔹 No.6 全局设置 /vendorGlobalSetting
                else if (key === 'step06GetGlobalSetting') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    const globalSetting = await apiGetVendorGlobalSetting(this.loginData.token);
                    this.vendorGlobalSettingData = globalSetting;
                    res = globalSetting;
                }
                // 🔹 No.7 游戏配置总表 /vendorGame/config
                else if (key === 'step07GetGameConfigSummary') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    const configData = await apiGetVendorGameConfig(this.loginData.token);
                    this.vendorGameConfigData = configData;
                    res = configData;
                }
                // 🔹 No.8 全站在线人数统计
                else if (key === 'step08GetOnlineStats') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }

                    const n = await apiGetOnlineStats(this.loginData.token);
                    this.onlineStats = n;
                    res = n;
                }
                // 🔹 No.9 初始化大厅桌台映射 /tableCurrencyMapping/detail
                else if (key === 'step09InitLobby') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }

                    const data = await apiGetTableCurrencyMappingDetail(this.loginData.token);
                    this.tableCurrencyMappingData = data;
                    res = data;
                    this.buildLobbyRooms();
                }
                // 🔹 No.10 批量获取桌台牌路
                else if (key === 'step10GetRoad') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    if (!this.tableCurrencyMappingData?.all?.length) {
                        throw new Error('缺少桌台列表，请先完成 No.9 桌台映射');
                    }

                    // 从 No.9 的 all 中取出所有 tableId
                    const tableIds = this.tableCurrencyMappingData.all.map(t => t.tableId);

                    // 这里的 18 就是你示例里用的 xOffsetFromTail
                    const roads = await apiGetRoads(this.loginData.token, tableIds, 18);

                    this.roadsData = roads;
                    res = roads;
                    this.buildLobbyRooms();
                }
                // 🔹 No.11 当前下注统计 /order/getBetCalculation
                else if (key === 'step11PlaceBet') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    if (!this.tableCurrencyMappingData?.tables) {
                        throw new Error('缺少桌台信息，请先完成 No.9 桌台映射');
                    }

                    // 从 No.9 的 tables 里自动构造请求项
                    const items = Object.values(this.tableCurrencyMappingData.tables).map(
                        (t) => ({
                            tableId: t.tableId,
                            gameCode: t.gameCode,
                        }),
                    );

                    const data = await apiGetBetCalculation(this.loginData.token, items);

                    this.betCalcData = data;
                    res = data;
                    this.buildLobbyRooms();
                }

                // 🔹 No.12 dealerEvent：桌状态 / 当前局信息
                else if (key === 'step12GetGameState') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    if (!this.tableCurrencyMappingData?.all?.length) {
                        throw new Error('缺少桌台列表，请先完成 No.9 桌台映射');
                    }

                    // 复用 No.9 的 tableId 列表
                    const tableIds = this.tableCurrencyMappingData.all.map((t) => t.tableId);
                    const data = await apiGetDealerEvents(this.loginData.token, tableIds);

                    this.dealerEvents = data;
                    res = data;
                    this.buildLobbyRooms();
                }

                // 🔹 No.13 玩家个人实时下注状态
                else if (key === 'step13GetPlayerRealtimeState') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }
                    if (!this.tableCurrencyMappingData?.all?.length) {
                        throw new Error('缺少桌台列表，请先完成 No.9 桌台映射');
                    }

                    // 复用 No.9 里的 tableId 列表
                    const tableIds = this.tableCurrencyMappingData.all.map((t) => t.tableId);

                    const data = await apiGetCurrentBet(this.loginData.token, tableIds);

                    this.currentBets = data;
                    res = data;
                }
                // 🔹 No.14游戏房间当前路纸走势的预测状态
                else if (key === 'step14GetTrendState') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }

                    const data = await apiGetNextRoad(this.loginData.token, '851', 'BANKER');
                    this.nextRoad = data;
                    this.log?.(`No.14 路纸预测成功：tableId=${851}, gameMode=${'BANKER'}`);
                    res = data;
                }
                // 🔹 No.15 进入或离开聊天室
                else if (key === 'step15EnterOrLeaveChatRoom') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }

                    // 先写死 851，之后你可以让页面传 tableId 进来
                    const tableId = '851';

                    const data = await apiJoinDealerRoomRaw(this.loginData.token, tableId);

                    // 这里完全不做类型判断，直接塞进 step.response，方便你在 UI 上看原始数据
                    res = data;
                }
                // 🔹 No.16 获取视频流
                else if (key === 'step16GetVideoStream') {
                    if (!this.loginData?.token) {
                        throw new Error('还没有登录成功，缺少 VIA token');
                    }

                    // 先写死 tableId = '851'，line/pixel 用你的示例
                    const data = await apiGetVideoStream({
                        authToken: this.loginData.token,
                        type: 'DEALER',
                        id: '851',
                        line: 'https://p01.bnn1ko.co',
                        pixel: 480,
                        roomType: 'DEALER',
                    });

                    this.videoStream = data;
                    res = data;
                }
                else {
                    res = { message: 'TODO: 尚未实现该步骤的接口调用' };
                }

                // 其他 step...（略）

                step.response = res;
                step.success = true;
                step.loading = false;
                this.log(`✅ 成功：${step.name}`);
                return true;
            } catch (err: any) {
                const msg = err?.message || '未知错误';
                step.success = false;
                step.loading = false;
                step.error = msg;
                this.log(`❌ 失败：${step.name}，错误：${msg}`);
                return false;
            }
        },

        async runAll() {
            if (this.running) return;
            this.running = true;
            this.currentStepIndex = -1;
            this.logs = [];

            for (let i = 0; i < STEP_ORDER.length; i++) {
                const key = STEP_ORDER[i]!;
                this.currentStepIndex = i;
                const ok = await this.runStep(key);
                if (!ok) {
                    this.running = false;
                    this.log(`流程中止，在步骤：${this.steps[key].name}`);
                    return;
                }
            }

            this.running = false;
            this.log('🎉 VIA 全部 17 步执行完成');
        },
        // 🔹No.14游戏房间当前路纸走势的预测状态
        async fetchNextRoad(tableId: string, gameMode: string) {
            if (!this.loginData?.token) {
                throw new Error('还没有登录成功，缺少 VIA token');
            }

            const data = await apiGetNextRoad(this.loginData.token, tableId, gameMode);
            this.nextRoad = data;
            this.log?.(`No.14 路纸预测成功：tableId=${tableId}, gameMode=${gameMode}`);
            return data;
        },

        async placeBet(opts: {
            /** 桌号，例如 "851" */
            tableId: string;
            /** 游戏代码，例如 "BACCARAT60S" */
            gameCode: string;
            /** 下注区，例如 "PLAYER" / "BANKER" / "TIE" */
            gameMode: string;
            /** 下注金额 */
            amount: number;
        }) {
            if (!this.loginData?.token) {
                throw new Error('尚未登录 VIA 游戏，请先完成 No.1 登录步骤');
            }

            const { tableId, gameCode, gameMode, amount } = opts;

            if (!amount || amount <= 0) {
                throw new Error('下注金额必须大于 0');
            }

            // 从登录信息里拿币种 / 玩家账号
            const currency: string = this.loginData?.tokenInfo?.currency || 'PHP';
            const vendorPlayerId: string = this.loginData?.tokenInfo?.vendorPlayerId || '';

            if (!vendorPlayerId) {
                throw new Error('登录信息中缺少 vendorPlayerId，无法下注');
            }

            // ✅ 只从 lobbyRooms 里拿当前局信息
            const room = this.lobbyRooms.find(
                (r) => String(r.tableId) === String(tableId),
            );

            if (!room) {
                throw new Error(`未找到桌号 ${tableId} 的房间信息，请先刷新大厅`);
            }

            const drawId = room.drawId;
            const roundStartTime = room.roundStartTime;
            const hostId = room.dealerId;
            const hostNickname = room.dealerNickname || '';

            if (!drawId || !roundStartTime || !hostId) {
                throw new Error(
                    `桌号 ${tableId} 当前局信息缺失（drawId/roundStartTime/dealerId），请刷新大厅或稍后重试`,
                );
            }

            const liveType = 'DEALER';
            const device = 'PC';
            const place = 'ROOM';

            const betDetails = [
                {
                    gameMode,
                    betId: null,
                    amount,
                    betValues: null,
                },
            ];

            const totalBetAmount = amount;

            const payload: ViaBetReq = {
                liveType,
                hostId,
                hostNickname,
                vendorPlayerId,
                drawId,
                tableId,
                gameCode,
                currency,
                roundStartTime,
                totalBetAmount,
                betDetails,
                device,
                place,
            };

            this.betLoading = true;
            this.betError = null;
            this.lastBetReq = payload;

            this.log(
                `准备下注：桌 ${tableId}，gameMode=${gameMode}，amount=${amount}`,
            );

            try {
                const result = await apiPlaceBet(this.loginData.token, payload);

                this.lastBetResult = result;
                this.betLoading = false;

                this.log(
                    `下注成功，最新余额：${result.balance}，版本：${result.version}`,
                );

                return result;
            } catch (err: any) {
                const msg = err?.message || '下注失败';
                this.betLoading = false;
                this.betError = msg;
                this.log(`下注失败：${msg}`);
                throw err;
            }
        },

        buildLobbyRooms() {
            const mapping = this.tableCurrencyMappingData as any;
            if (!mapping || !mapping.tables) {
                this.lobbyRooms = [];
                return;
            }

            const tables: Record<string, any> = mapping.tables;
            const all: { tableId: string; order: number }[] = mapping.all || [];

            // No.10 牌路
            const roadArr: any[] =
                (this.roadsData as any)?.data ??
                (Array.isArray(this.roadsData) ? (this.roadsData as any) : []);

            const roadMap = new Map<string, any>();
            roadArr.forEach((r) => {
                if (!r) return;
                roadMap.set(String(r.tableId), r);
            });

            // No.11 下注统计
            const betArr: any[] =
                (this.betCalcData as any)?.data ??
                (Array.isArray(this.betCalcData) ? (this.betCalcData as any) : []);

            const betMap = new Map<string, any>();
            betArr.forEach((b) => {
                if (!b) return;
                betMap.set(String(b.tableId), b);
            });

            // No.12 dealerEvent
            const dealerEventArr: any[] =
                (this.dealerEvents as any)?.data ??
                (Array.isArray(this.dealerEvents) ? (this.dealerEvents as any) : []);

            const dealerMap = new Map<string, any>();
            dealerEventArr.forEach((e) => {
                if (!e) return;
                dealerMap.set(String(e.tableId), e);
            });

            const rooms: ViaLobbyRoom[] = [];

            // 使用 No.9 的 all 来控制顺序（和后台排序一致）
            const ordered = (all.length
                ? all
                : Object.values(tables).map((t: any, idx: number) => ({
                    tableId: String(t.tableId),
                    order: idx,
                }))) as { tableId: string; order: number }[];

            ordered
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .forEach(({ tableId }) => {
                    const t = tables[tableId];
                    if (!t) return;

                    const id = String(tableId);
                    const road = roadMap.get(id);
                    const bet = betMap.get(id);
                    const ev = dealerMap.get(id);

                    // 胜局统计：只保留 B / P / T / pair
                    let winnerCounter: any = undefined;
                    if (road?.winnerCounter) {
                        winnerCounter = {
                            BANKER: road.winnerCounter.BANKER ?? 0,
                            PLAYER: road.winnerCounter.PLAYER ?? 0,
                            TIE: road.winnerCounter.TIE ?? 0,
                            BANKER_PAIR: road.winnerCounter.BANKER_PAIR ?? 0,
                            PLAYER_PAIR: road.winnerCounter.PLAYER_PAIR ?? 0,
                        };
                    }

                    // ⭐ 主路（从 road.mainRoads 里抽出精简字段）
                    const mainRoads = Array.isArray(road?.mainRoads)
                        ? road.mainRoads.map((m: any) => ({
                            showX: m.showX,
                            showY: m.showY,
                            tieCount: m.tieCount,
                            resultMainRoad: m.resultMainRoad,
                        }))
                        : [];

                    // 下注统计：把 betAmount 累加
                    let totalBetAmount = 0;
                    let betPlayers = 0;

                    if (bet) {
                        const results = bet.results || [];
                        totalBetAmount = results.reduce(
                            (sum: number, r: any) => sum + (Number(r.betAmount) || 0),
                            0,
                        );
                        betPlayers = bet.betPlayers ?? 0;
                    }

                    const tableNameMultiLang = t.tableName || {};
                    const displayName =
                        tableNameMultiLang.en ||
                        tableNameMultiLang.cn ||
                        `Table ${id}`;

                    const room: ViaLobbyRoom = {
                        tableId: id,
                        gameCode: t.gameCode,
                        hallIds: t.hallIds || [],
                        tableNameMultiLang,
                        displayName,

                        dealerId: ev?.dealerId,
                        dealerNickname: t.dealerNickname || ev?.dealerNickname,
                        dealerAvatar: t.dealerAvatar,

                        gameShoe: ev?.gameShoe ?? road?.gameShoe,
                        gameRound: ev?.gameRound ?? road?.gameRound,
                        shuffle: ev?.shuffle ?? road?.shuffle,
                        tableStatus: ev?.tableStatus,
                        iTime: ev?.iTime,
                        drawId: ev?.drawId,
                        roundStartTime: ev?.roundStartTime,               // ✅ 下注用
                        roundStartTimeOriginal: ev?.roundStartTimeOriginal, // ✅ 推送用

                        deliverTime: ev?.deliverTime,
                        roundEndTime: ev?.roundEndTime,

                        goodRoadType: road?.goodRoadType,
                        isGoodRoad: road?.isGoodRoad,
                        winnerCounter,

                        // ✅ 主路塞进来
                        mainRoads,

                        totalBetAmount,
                        betPlayers,

                        // 可选：如果你想一进来就有 dealerEventType
                        dealerEventType: ev?.dealerEventType,
                    };

                    rooms.push(room);
                });

            this.lobbyRooms = rooms;
            this.log?.(`大厅房间数据已构建，共 ${rooms.length} 个桌台`);
        },

        updateLobbyRoom(tableId: string, patch: Partial<LobbyRoomMutableFields>) {
            const id = String(tableId);
            const room = this.lobbyRooms.find(
                (r) => String(r.tableId) === id,
            );

            if (!room) {
                this.log?.(`updateLobbyRoom: 未找到 tableId=${id} 对应房间`);
                return;
            }

            Object.assign(room, patch);
        }

    },
});
