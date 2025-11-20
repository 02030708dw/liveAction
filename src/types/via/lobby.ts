// src/types/via/lobby.ts

// No.10 / 14 用到的胜局统计
export interface ViaWinnerCounter {
    BANKER?: number;
    PLAYER?: number;
    TIE?: number;
    BANKER_PAIR?: number;
    PLAYER_PAIR?: number;
    [k: string]: any;
}


// 每张桌子综合信息（No.9 + No.10 + No.11 + No.12）
export interface ViaLobbyRoom {
    // ---- 基础信息（No.9 tableCurrencyMapping） ----
    tableId: string;
    gameCode: string;
    hallIds: number[];
    tableType?: string;
    tableTag?: string;
    rebateRate?: number;
    onlineUser?: number;
    isTableFavorite?: boolean;
    tableFavoriteCount?: number;

    // 多语言桌名
    tableNameMultiLang: {
        cn?: string;
        en?: string;
        [k: string]: any;
    };
    // UI 上常用的展示名（优先 en > cn）
    displayName: string;

    // 荷官 / 桌信息（No.9 + No.12）
    dealerId?: string;
    dealerNickname?: string;
    dealerAvatar?: string;
    dealerCountry?: string;
    dealerCategory?: string;

    // ---- 牌路、统计（No.10 /road） ----
    gameShoe?: number;
    gameRound?: number;
    shuffle?: number;
    goodRoadType?: number;
    isGoodRoad?: boolean;
    winnerCounter: ViaWinnerCounter;

    mainRoads: any[];   // 大路
    markerRoads: any[]; // 珠盘路
    bigEyes: any[];
    smalls: any[];
    roaches: any[];

    // ---- 当前局状态（No.12 dealerEvent） ----
    drawId?: string;
    dealerEventType?: string;
    deliverTime?: number;
    roundStartTime?: number;
    roundEndTime?: number;
    tableStatus?: number;
    isActive?: boolean;
    iTime?: number;
    tableCards: number[];
    tableCardStampTimes: number[];
    winGameModes: string[];
    winner?: number;

    // ---- 当前局下注统计（No.11 getBetCalculation） ----
    totalBetAmount: number;
    betPlayers: number;
    betResults: {
        betAmount: number;
        betId: string;
        betPlayers: number;
        gameMode: string;
        [k: string]: any;
    }[];
    // 🔥 运行时实时字段（WS 推过来的）
    wsDealerEvent?: any;      // /topic/dealerEvent/{tableId}
    wsRoad?: any;             // /topic/road/{tableId}
    wsBetStats?: any;         // /topic/betCalculation/{gameCode}/{tableId}
    winnerCounts?: number[];
    // 当前局信息（来自下注统计）
    currentDrawId?: string;
    currentGameCode?: string;
}
// ✅ 只允许更新“非主键字段”
export type LobbyRoomMutableFields = Omit<
    ViaLobbyRoom,
    'tableId' | 'gameCode' | 'hallIds'
>;

