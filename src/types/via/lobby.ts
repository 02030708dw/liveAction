// No.10 / 14 用到的胜局统计
export interface ViaWinnerCounter {
    BANKER?: number;
    PLAYER?: number;
    TIE?: number;
    BANKER_PAIR?: number;
    PLAYER_PAIR?: number;
    [k: string]: any;
}
// 主路单点（从 ROAD.mainRoads 里摘的必要字段）
export interface ViaMainRoadPoint {
    showX: number;
    showY: number;
    tieCount?: number;
    resultMainRoad?: string[]; // ["B"] / ["P","T"] 之类
}

// 每张桌子综合信息
export interface ViaLobbyRoom {
    // ---- 基础信息（No.9 tableCurrencyMapping） ----
    tableId: string;
    gameCode: string;
    hallIds: number[];

    // 多语言桌名
    tableNameMultiLang: {
        cn?: string;
        en?: string;
        [k: string]: any;
    };
    displayName: string;

    // 荷官 / 桌信息
    dealerId?: string;
    dealerNickname?: string;
    dealerAvatar?: string;

    // ---- 当前靴 / 局信息 ----
    gameShoe?: number;
    gameRound?: number;
    shuffle?: number;
    tableStatus?: number;
    iTime?: number;

    // 当前局唯一 ID + 开始时间（下注用）
    drawId?: string;
    roundStartTime?: number;

    // 简单牌路统计
    goodRoadType?: number;
    isGoodRoad?: boolean;
    winnerCounter?: ViaWinnerCounter;

    // ⭐ 主路（精简版）
    mainRoads?: ViaMainRoadPoint[];

    // ---- 当前局下注统计 ----
    totalBetAmount: number;
    betPlayers: number;

    // 当前局阶段（DEALER_EVENT.dealerEventType）
    dealerEventType?: string;

    // ✅ 新增时间
    deliverTime?: number;
    roundEndTime?: number;
    roundStartTimeOriginal?: number;
    serverTime?: number;

    //牌信息
    tableCards?: number[];
    tableCardStampTimes?: number[];
}

/** 运行时允许被 WS 更新的字段（主键不允许改） */
export type LobbyRoomMutableFields = Omit<
    ViaLobbyRoom,
    'tableId' | 'gameCode' | 'hallIds'
>;
