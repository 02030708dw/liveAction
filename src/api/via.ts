// src/api/via.ts
import { viaRequest, viaOrderRequest } from '@/utils/via';
import type {
    ViaPlayerLoginResp,
    ViaPlayerLoginData,
    ViaPlayerProfileResp,
    ViaPlayerProfileData,
    ViaGameTypeResp,
    ViaGameTypeData,
    ViaGameHallResp,
    ViaGameHall,
    ViaPlayerRoadResp,
    ViaPlayerRoadData,
    ViaVendorGlobalSettingResp,
    ViaVendorGlobalSettingData,
    ViaVendorGameConfigResp,
    ViaVendorGameConfigData,
    ViaOnlineStatsResp,
    ViaOnlineStatsData,
    ViaTableCurrencyMappingResp,
    ViaTableCurrencyMappingData,
    ViaRoadResp,
    ViaRoadData,
    ViaBetCalcReq,
    ViaBetCalcRequestItem,
    ViaBetCalcResp,
    ViaBetCalcData,
    ViaDealerEventResp,
    ViaDealerEventData,
    ViaCurrentBetResp,
    ViaCurrentBetData,
    ViaRoadNextResp,
    ViaRoadNextData,
    ViaVideoStreamResp,
    ViaVideoStreamData,
    ViaBetReq,
    ViaBetResp,
    ViaBetRespData
} from '@/types/via/api';

/**
 * 步骤1：登录
 * 返回值直接是 data 字段（已经过 code 检查）
 */
export async function apiLogin(
    bodyToken: string,
    authToken?: string,
): Promise<ViaPlayerLoginData> {
    const resp = await viaRequest.post<ViaPlayerLoginResp>(
        '/player/login',
        { token: bodyToken },
        {
            headers: authToken
                ? { Authorization: authToken }
                : undefined,
        },
    );

    const res = resp.data;

    if (res.code !== 0) {
        throw new Error(res.message || 'Login failed');
    }

    return res.data;
}

export async function apiGetProfile(
    authToken: string,
): Promise<ViaPlayerProfileData> {
    const resp = await viaRequest.get<ViaPlayerProfileResp>(
        '/player/profile',
        {
            headers: {
                // 和你抓包一致：小写 authorization
                // 实际上 HTTP 头不区分大小写，写 Authorization 也可以
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取 VIA 个人信息失败');
    }

    return res.data;
}

/** Step3: /api/v2/gameType，Authorization = step1 返回的 token */
export async function apiGetGameTypes(
    authToken: string,
): Promise<ViaGameTypeData> {
    const resp = await viaRequest.get<ViaGameTypeResp>(
        // baseURL: .../api/v1 → ../v2/gameType 就是 .../api/v2/gameType
        '../v2/gameType',
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取游戏类型失败');
    }

    return res.data;
}

/** Step4: /gameHall，Authorization = step1 返回的 token */
export async function apiGetGameHalls(
    authToken: string,
): Promise<ViaGameHall[]> {
    const resp = await viaRequest.get<ViaGameHallResp>(
        '/gameHall', // baseURL 已经是 .../api/v1
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取游戏厅列表失败');
    }

    return res.data; // 直接就是 ViaGameHall[]
}

/** Step5: /player/road，Authorization = step1 返回的 token */
export async function apiInitRoad(
    authToken: string,
): Promise<ViaPlayerRoadData> {
    const resp = await viaRequest.get<ViaPlayerRoadResp>(
        '/player/road',
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '初始化牌路失败');
    }

    return res.data; // 目前是 {}
}

/** Step6: /vendorGlobalSetting，Authorization = step1 返回的 token */
export async function apiGetVendorGlobalSetting(
    authToken: string,
): Promise<ViaVendorGlobalSettingData> {
    const resp = await viaRequest.get<ViaVendorGlobalSettingResp>(
        '/vendorGlobalSetting',
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取全局设置失败');
    }

    return res.data;
}

/** Step7: /vendorGame/config，Authorization = step1 返回的 token */
export async function apiGetVendorGameConfig(
    authToken: string,
): Promise<ViaVendorGameConfigData> {
    const resp = await viaRequest.get<ViaVendorGameConfigResp>(
        // baseURL: .../api/v1 → ../v3/vendorGame/config = .../api/v3/vendorGame/config
        '../v3/vendorGame/config',
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取游戏配置总表失败');
    }

    return res.data;
}

/**
 * Step8: 全站在线人数统计
 * ⚠️ 路径请改成你真实的接口，比如：
 *   '/vendor/onlineCount'
 *   '/vendor/onlineStats'
 * 看你后端最后定的是啥
 */
export async function apiGetOnlineStats(
    authToken: string,
): Promise<ViaOnlineStatsData> {
    const resp = await viaRequest.get<ViaOnlineStatsResp>(
        // TODO: 把这里换成真实路径
        '/vendor/onlineStats',
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    // if (res.code !== 0) {
    //     throw new Error(res.message || '获取在线人数统计失败');
    // }

    return res.data; // number
}

/** Step9: /tableCurrencyMapping/detail，Authorization = step1 返回的 token */
export async function apiGetTableCurrencyMappingDetail(
    authToken: string,
): Promise<ViaTableCurrencyMappingData> {
    const resp = await viaRequest.get<ViaTableCurrencyMappingResp>(
        '/tableCurrencyMapping/detail', // baseURL 是 .../api/v1
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取桌台货币映射详情失败');
    }

    return res.data;
}

/**
 * No.10: 批量获取桌台牌路数据
 *
 * @param authToken       第一阶段 login 返回的 token（放在 Authorization 头里）
 * @param tableIds        桌台 ID 列表（来自 No.9 的 tableId，例如 ["702","703"]）
 * @param xOffsetFromTail 从最新牌局往前偏移多少列，用于截取最近牌路
 */
export async function apiGetRoads(
    authToken: string,
    tableIds: string[],
    xOffsetFromTail = 18,
): Promise<ViaRoadData> {
    // 手动构造 query，保证是 tableIds=702&tableIds=703 这种格式
    const qs = new URLSearchParams();
    tableIds.forEach((id) => {
        qs.append('tableIds', id);
    });
    qs.append('xOffsetFromTail', String(xOffsetFromTail));

    // 这里用完整 URL，所以不会再拼上 baseURL 的 /live-streamer-service/api/v1
    const url = `https://www.j4r3b77.com/game-service/api/v1/road?${qs.toString()}`;

    const resp = await viaRequest.get<ViaRoadResp>(url, {
        headers: {
            authorization: authToken,
        },
    });

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取牌路数据失败');
    }

    return res.data;
}

/**
 * No.11: 批量获取桌台当前下注统计
 *
 * gameCode：游戏编码
 * tableId：桌台编号
 * betPlayers：当前局参与下注的玩家数
 * results：每个下注区的统计结果
 *   - gameMode：下注类型
 *   - betId：特定子区编号
 *   - betAmount：当前下注总额
 *   - betPlayers：当前在该下注区下注的玩家数
 */
export async function apiGetBetCalculation(
    authToken: string,
    items: ViaBetCalcRequestItem[],
): Promise<ViaBetCalcData> {
    // ⚠️ 这里要和 ViaBetCalcReq 的字段名保持一致
    const body: ViaBetCalcReq = {
        gameCodeTableIds: items, // 把 fieldName 改成真实字段名，比如 tables / list / reqs
    };

    const resp = await viaRequest.post<ViaBetCalcResp>(
        '/order/getBetCalculation',
        body,
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取下注统计失败');
    }

    return res.data;
}

/**
 * No.12: 批量获取桌台的荷官事件 / 当前局状态
 *
 * drawId：当前局唯一编号
 * dealerId：当前荷官昵称
 * gameCode：游戏类型代码
 * gameRound：当前靴的局号
 * gameShoe：当前靴号
 * deliverTime：本局发牌时间
 * roundStartTime：开局时间
 * roundEndTime：结束时间，0 表示未结束
 * tableCards：当前发牌状态（255=未发牌，其他值=牌面代号）
 * tableCardStampTimes：各张牌的发牌时间
 * shuffle：是否洗牌中（1=洗牌，0=正常）
 * tableStatus：桌状态（1=进行中，2=维护，3=关闭）
 * isActive：桌是否激活
 * iTime：倒计时或帧时间（单位：秒，通常是下注阶段剩余时间）
 */
export async function apiGetDealerEvents(
    authToken: string,
    tableIds: string[],
): Promise<ViaDealerEventData> {
    const qs = new URLSearchParams();
    tableIds.forEach((id) => {
        qs.append('tableIds', id); // 生成 tableIds=702&tableIds=703...
    });

    const url = `https://www.j4r3b77.com/game-service/api/v1/dealerEvent?${qs.toString()}`;

    const resp = await viaRequest.get<ViaDealerEventResp>(url, {
        headers: {
            authorization: authToken,
        },
    });

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取荷官事件失败');
    }

    return res.data;
}

/**
 * No.13: 玩家个人实时下注状态 /player/currentBet
 *
 * 参数：
 *   authToken：VIA 登录 token（Authorization）
 *   tableIds： 需要查询的桌台编号列表（来自 No.9）
 *
 * 返回：
 *   每个桌台一条记录，包含：
 *     - drawId：当前局唯一编号
 *     - gameCode：游戏类型代码
 *     - tableId：桌台编号
 *     - amounts：该玩家在各下注区的下注金额列表
 */
export async function apiGetCurrentBet(
    authToken: string,
    tableIds: string[],
): Promise<ViaCurrentBetData> {
    // 构造 ?tableIds=702&tableIds=703&...
    const qs = new URLSearchParams();
    tableIds.forEach((id) => {
        qs.append('tableIds', id);
    });

    const url = `/player/currentBet?${qs.toString()}`;

    const resp = await viaRequest.get<ViaCurrentBetResp>(url, {
        headers: {
            authorization: authToken,
        },
    });

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取玩家当前下注状态失败');
    }

    return res.data;
}

/**
 * No.14: 游戏房间当前路纸走势的预测状态
 *
 * GET /game-service/api/v1/road/next
 *
 * 查询参数:
 *   - tableId: 桌台编号，例如 "851"
 *   - gameMode: 预测的目标玩法，比如 "BANKER" / "PLAYER" 等
 *
 * 主要字段说明（响应中的 data）:
 *   - shuffle:       是否洗牌中（1=洗牌中）
 *   - goodRoadType:  好路类型编码
 *   - isGoodRoad:    当前是否属于好路
 *   - gameShoe:      靴号
 *   - gameRound:     局号
 *   - winnerCounter: 胜局统计（BANKER / PLAYER / TIE / PAIR 等次数）
 */
export async function apiGetNextRoad(
    authToken: string,
    tableId: string,
    gameMode: string,
): Promise<ViaRoadNextData> {
    const qs = new URLSearchParams();
    qs.set('tableId', tableId);
    qs.set('gameMode', gameMode);

    const url = `https://www.j4r3b77.com/game-service/api/v1/road/next?${qs.toString()}`;

    const resp = await viaRequest.get<ViaRoadNextResp>(url, {
        headers: {
            authorization: authToken,
        },
    });

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取路纸预测状态失败');
    }

    return res.data;
}

/**
 * No.15 加入桌台对应的 DEALER 聊天室
 * 对应原始请求:
 *   PUT /muc/room/DEALER/{tableId}?DEALER={tableId}
 *
 * 不做类型定义，直接返回后端原始数据（any）
 */
export async function apiJoinDealerRoomRaw(
    authToken: string,
    tableId: string,
) {
    const qs = new URLSearchParams();
    // 和你抓包保持一致：?DEALER=851
    qs.set('DEALER', tableId);

    const url = `/muc/room/DEALER/${tableId}?${qs.toString()}`;

    const resp = await viaRequest.put(url, {}, {
        headers: {
            authorization: authToken,
        },
    });

    // 不做任何类型判断，直接把后端返回体扔出去
    return resp.data;
}

/**
 * No.16: 获取视频流地址 /video
 *
 * Query 参数说明：
 *   type     : 视频类型，示例为 'DEALER'
 *   id       : 房间/桌台 ID，例如 '851'
 *   line     : 线路域名，例如 'https://p01.bnn1ko.co'
 *   pixel    : 清晰度，例如 480 / 720 / 1080
 *   roomType : 房间类型，示例为 'DEALER'
 *
 * 返回：
 *   data.expireTime: 当前视频地址过期时间（毫秒时间戳）
 *   data.url:       { [tableId: string]: string[] }，每个桌台对应一组视频流地址
 */
export async function apiGetVideoStream(params: {
    /** 登录 token（部分环境可能不需要，但建议带上） */
    authToken?: string;
    /** 视频类型，例如 'DEALER' */
    type: string;
    /** 房间/桌台 ID，例如 '851' */
    id: string;
    /** 线路地址，例如 'https://p01.bnn1ko.co' */
    line: string;
    /** 清晰度，例如 480 / 720 / 1080 */
    pixel: number | string;
    /** 房间类型，例如 'DEALER' */
    roomType: string;
}): Promise<ViaVideoStreamData> {
    const qs = new URLSearchParams();
    qs.set('type', params.type);
    qs.set('id', params.id);
    qs.set('line', params.line);
    qs.set('pixel', String(params.pixel));
    qs.set('roomType', params.roomType);

    const url = `/video?${qs.toString()}`;

    const resp = await viaRequest.get<ViaVideoStreamResp>(url, {
        headers: params.authToken
            ? { authorization: params.authToken }
            : undefined,
    });

    const res = resp.data;
    if (res.code !== 0) {
        throw new Error(res.message || '获取视频流失败');
    }

    return res.data;
}

/**
 * No.17: 下注接口 /v2/order/bet
 *
 * @param authToken 登录后拿到的 msgToken / token（你示例里用的是 Authorization 里的那个）
 * @param payload   下注请求体（ViaBetReq）
 *
 * 返回下注后余额信息（balance, version）
 */
export async function apiPlaceBet(
    authToken: string,
    payload: ViaBetReq,
): Promise<ViaBetRespData> {
    const resp = await viaOrderRequest.post<ViaBetResp>(
        '/order/bet',
        payload,
        {
            headers: {
                authorization: authToken,
            },
        },
    );

    const res = resp.data;

    // 按厂商惯例，code === 0 代表成功
    if (res.code !== 0) {
        throw new Error(res.message || '下注失败');
    }

    return res.data;
}