// src/types/via/ws.ts

/**
 * STOMP 帧结构
 */
export interface StompHeaders {
    [key: string]: string;
}

export interface StompFrame {
    command: string;          // CONNECT / SUBSCRIBE / MESSAGE ...
    headers?: StompHeaders;
    body?: string;
}

/**
 * 桌面 / 局状态（根据你给的字段整理）
 */
export interface ViaTableState {
    // 当前局唯一编号（靴号+局号组合）
    drawId: string;
    // 当前荷官昵称
    dealerId: string;
    // 游戏类型代码
    gameCode: string;
    // 当前靴的局号
    gameRound: number;
    // 当前靴号（洗牌后的一轮）
    gameShoe: number;
    // 本局发牌时间（时间戳）
    deliverTime: number;
    // 开局时间
    roundStartTime: number;
    // 结束时间，0 表示未结束
    roundEndTime: number;
    // 当前发牌状态（255=未发牌，其他值=牌面代号）
    tableCards: number[];
    // 各张牌的发牌时间
    tableCardStampTimes: number[];
    // 是否洗牌中（1=洗牌，0=正常）
    shuffle: 0 | 1;
    // 桌状态（1=进行中，2=维护，3=关闭）
    tableStatus: 1 | 2 | 3;
    // 桌是否激活
    isActive: boolean;
    // 倒计时或帧时间（秒，通常是下注阶段剩余时间）
    iTime: number;
}

/**
 * 珠盘路中单局结果
 * "B" = Banker, "P" = Player, "T" = Tie
 */
export type MarkerResultSymbol = 'B' | 'P' | 'T';

export interface MarkerRoadItem {
    // 局号
    gameRound: number;
    // 结果标记（一般是一个长度为 1 的数组）
    roundResultMarkerRoad: MarkerResultSymbol[];
    // 胜方点数
    winnerHandValue: number;
    // 额外奖区，例如：BANKER_TP, NO_COMM_BANKER ...
    winGameModes: string[];
}

/**
 * 大路单格信息
 */
export interface MainRoadItem {
    showX: number;
    showY: number;
    resultMainRoad: MarkerResultSymbol[];
}

/**
 * 路纸整体信息
 */
export interface ViaRoadInfo {
    gameCode: string;
    // 当前靴号（洗牌后的局组）
    gameShoe: number;
    // 当前局数
    gameRound: number;
    /**
     * 胜利次数统计（总次数）
     * 例： { BANKER: 30, PLAYER: 25, TIE: 5 }
     */
    winnerCounts: Record<string, number>;
    /**
     * 各结果出现次数（更细粒度的统计，命名和 winnerCounts 一般类似）
     */
    winnerCounter: Record<string, number>;
    // 大路（主走势）
    mainRoads: MainRoadItem[];
    // 珠盘路（每一局）
    markerRoads: MarkerRoadItem[];
    // 大眼仔
    bigEyes: any[];
    // 小路
    smalls: any[];
    // 蟑螂路
    roaches: any[];
    // 时间戳（毫秒）
    stampTime: number;
}

/**
 * 单局开牌结果
 * winner: 1=Banker, 2=Player, 3=Tie
 */
export interface ViaOpenResult {
    bankerHandValue: number;
    playerHandValue: number;
    winner: 1 | 2 | 3;
}

/**
 * 这里可以根据后续协议扩展：
 * - 不同 destination 对应的数据类型
 * - 不同 cmd 的推送类型等
 */
export interface ViaMessageEnvelope<T = any> {
    destination?: string;
    headers?: StompHeaders;
    payload: T;
}
