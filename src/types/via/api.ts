// src/types/via/api.ts

/** 所有接口统一的返回格式 */
export interface ApiResponse<T> {
    code: number;
    data: T;
    message: string;
    serverTime: number;
}

/** 登录返回里的 tokenInfo */
export interface ViaTokenInfo {
    vendorId: string;
    vendorPlayerId: string;
    langKey: string;
    currency: string;
    isTipDealer: boolean;
    isTipLiveStreamer: boolean;
    vendorType: string;
}

/** 登录返回里的 data 字段 */
export interface ViaPlayerLoginData {
    hasMegaPool: boolean;
    token: string;
    tokenIssueAt: number;
    msgToken: string;
    mucPlayerId: string;
    tokenInfo: {
        vendorId: string;
        vendorPlayerId: string;
        langKey: string;
        currency: string;
        isTipDealer: boolean;
        isTipLiveStreamer: boolean;
        vendorType: string;
    };
    loginIp: string;
    loginTime: number;
}

/** 登录接口完整返回 */
export type ViaPlayerLoginResp = ApiResponse<ViaPlayerLoginData>;

/** ✅ No.2 获取个人信息 /player/profile 返回的 data */
export interface ViaPlayerProfileData {
    nickname: string;
    balance: number;          // 202.5000 → number
    balanceVersion: number;
    avatar: string;           // "AVATAR1"
    hasBet: boolean;
    muteStatus: string;       // "UNMUTE" 等，后面可以收集枚举再细化
}

export type ViaPlayerProfileResp = ApiResponse<ViaPlayerProfileData>;

/** No.3 获取游戏类型 /gameType 返回的 data */

export interface ViaLobbyGameTypeCategory {
    lobbyGameType: string;   // "NEW_RELEASE" | "HOT_POPULAR" ...
    gameCodes: string[];     // ["AIXD60S", "AITF60S", ...]
}

export interface ViaGameTypeCategory {
    gameType: string;        // "BACCARAT" | "DICE" ...
    gameCodes: string[];
}

export interface ViaGameTypeData {
    lobbyGameTypeCategories: ViaLobbyGameTypeCategory[];
    gameTypeCategories: ViaGameTypeCategory[];
}

export type ViaGameTypeResp = ApiResponse<ViaGameTypeData>;

/** No.4 游戏厅层级定义 /gameHall 返回的 data（一整个数组） */
export interface ViaGameHall {
    id: number;
    name: string;      // "璀璨廳" ...
    hallOrder: number; // 排序
}

export type ViaGameHallResp = ApiResponse<ViaGameHall[]>;

/** No.5 初始化牌路 /player/road 返回的 data
 *  目前看是 {}，先用 Record<string, any> 兜底，之后有结构再细化
 */
export type ViaPlayerRoadData = Record<string, any>;

export type ViaPlayerRoadResp = ApiResponse<ViaPlayerRoadData>;

/** No.6 全局设置 /vendorGlobalSetting 返回的 data */

export interface ViaLiveModeConfig {
    status: string;        // "ACTIVE" / "INACTIVE"
    isTip: boolean;
    department?: string[]; // STREAMER 才有，比如 ["OFFICIAL"]
}

export interface ViaVendorGlobalSettingData {
    liveMode: {
        DEALER?: ViaLiveModeConfig;
        STREAMER?: ViaLiveModeConfig;
    };
    vendorType: string;          // "NORMAL"
    isAllowAutoBet: boolean;     // true / false
    rebateActivityStatus: string; // "INACTIVE" 等
}

export type ViaVendorGlobalSettingResp = ApiResponse<ViaVendorGlobalSettingData>;


/** No.7 游戏配置总表  */

/** 通用：单个玩法的投注信息（配合 gameMode 使用） */
export interface ViaGameModeBetInfo {
    betId?: string;         // 有的有 betId，有的没有
    betIssueLimit: number;
    betMaximum: number;
    betMinimum: number;
    gameMode: string;
    odds: number[];
    probabilities?: number[]; // 部分游戏才有（比如 HLBCRT30S）
    [property: string]: any;
}

/** 通用：投注限额配置 */
export interface ViaBetLimitSetting {
    betChips: string[];
    betDefaultChips: string[];
    betGroup: string;
    betRange: string[];
    gameModeBetInfos: ViaGameModeBetInfo[];
    [property: string]: any;
}

/** 通用：单个游戏的配置（AICG60S / BACCARAT30S / TX60S 等） */
export interface ViaGameConfig {
    gameCode: string;          // "BACCARAT60S" ...
    gameModes: string[];       // 支持的模式
    betLimitSettings: ViaBetLimitSetting[];
    customOddsTables: string[];
    specialOddsTables: string[];
    tables: string[];
    playerBetGroup: string;
    isValidateMessage: boolean;

    // 部分游戏才有的字段（可选）
    baccaratTableMode?: string[];   // 百家乐专用
    disabledGameMode?: string[];    // CZMB/WWMB 等会用到
    playRestrictionSetting?: Record<string, any>; // 各种 XXXBilateral 开关之类

    // 有其它奇怪字段就交给索引签名兜底，以后真要用再细化
    [property: string]: any;
}

/** No.7 游戏配置总表 /vendorGame/config 返回的 data */
export interface ViaVendorGameConfigData {
    // AICG60S / BACCARAT30S / TX60S ... 都在这里
    configs: Record<string, ViaGameConfig>;
    [property: string]: any;
}

export type ViaVendorGameConfigResp = ApiResponse<ViaVendorGameConfigData>;

/** No.8 全站在线人数统计 返回的 data = number */
export type ViaOnlineStatsData = number;

export type ViaOnlineStatsResp = ApiResponse<ViaOnlineStatsData>;

/** No.9 初始化大厅 */
export interface ViaTableSummary {
    order: number;
    tableId: string;
    [property: string]: any;
}

/** 按 gameType 分组的桌子列表：
 *  BACCARAT / DICE / DRAGON_TIGER / ... → TableSummary[]
 */
export type ViaGameType =
    | 'BACCARAT'
    | 'DICE'
    | 'DRAGON_TIGER'
    | 'FPC'
    | 'LOTTO_POKER'
    | 'MARBLE_RACE'
    | 'POKDENG'
    | 'XOC_DIA';

type ViaGameTypeMappings = Partial<Record<ViaGameType, ViaTableSummary[]>>;

/** 多语言桌台名称 */
export interface ViaTableNameLocales {
    cn: string;
    en: string;
    es: string;
    id: string;
    ja: string;
    ko: string;
    pt: string;
    th: string;
    vn: string;
    [property: string]: any;
}

/** 单个桌台的完整详情（tables 字典里的 value） */
export interface ViaTableDetail {
    tableId: string;
    mainTableId: string;
    gameCode: string;
    hallIds: number[];
    tableStatus: number;
    tableType: string;
    tableTag: string;
    tableName: ViaTableNameLocales;
    rebateRate: number;
    order: number;
    onlineUser: number;
    tableFavoriteCount: number;
    isTableFavorite: boolean;

    // 部分桌子才会有的荷官信息，做成可选字段
    dealerAvatar?: string;
    dealerCategory?: string;
    dealerCountry?: string;
    dealerId?: string;
    dealerNickname?: string;

    // 兜底：如果后面接口加字段，不会炸
    [property: string]: any;
}

/** tables: 以 tableId 作为 key 的详情字典 */
export type ViaTableDetailMap = Record<string, ViaTableDetail>;

/** No.9 tableCurrencyMapping/detail 返回的 data */
export interface ViaTableCurrencyMappingData {
    all: ViaTableSummary[];
    gameTypeMappings: ViaGameTypeMappings;
    tables: ViaTableDetailMap;
    [property: string]: any;
}

export type ViaTableCurrencyMappingResp = ApiResponse<ViaTableCurrencyMappingData>;

/** No.10 牌路统计：单局结果统计 */
export interface ViaRoadWinnerCounter {
    /** 庄赢次数 */
    BANKER: number;
    /** 闲赢次数 */
    PLAYER: number;
    /** 和局次数 */
    TIE: number;
    /** 庄对次数 */
    BANKER_PAIR: number;
    /** 闲对次数 */
    PLAYER_PAIR: number;
    [property: string]: any;
}

/** No.10 牌路统计：珠盘路（每一局一格） */
export interface ViaRoadMarkerRoad {
    /** 局号（当前靴里的第几局） */
    gameRound: number;
    /** 珠盘路结果：
     *  "B" = Banker（庄）
     *  "P" = Player（闲）
     *  "T" = Tie（和）
     */
    roundResultMarkerRoad: string[];
    /** 在路纸上的 X 坐标 */
    showX: number;
    /** 在路纸上的 Y 坐标 */
    showY: number;
    /** 时间戳（毫秒） */
    stampTime: number;
    /** 额外奖区结果，例如：Dragon Bonus / Super Six / Big / Small 等 */
    winGameModes: string[];
    /** 胜方点数（例如庄 9 点、闲 8 点） */
    winnerHandValue: number;
    [property: string]: any;
}

/** No.10 牌路统计：大路（主走势） */
export interface ViaRoadMainRoad {
    /** 是否被标记为好路的一部分 */
    isGoodRoad: boolean;
    /** 大路结果（一般只有一个元素，同样是 B/P/T） */
    resultMainRoad: string[];
    /** 在大路图上的 X 坐标 */
    showX: number;
    /** 在大路图上的 Y 坐标 */
    showY: number;
    /** 时间戳（毫秒） */
    stampTime: number;
    /** 当前列里的和局数量（用于显示中间的小绿点） */
    tieCount: number;
    /** 额外奖区结果 */
    winGameModes: string[];
    [property: string]: any;
}

/** No.10 牌路统计：大眼仔、小路、蟑螂路 共用结构 */
export interface ViaRoadDownRoad {
    /** 衍生路结果（格式同大眼仔/小路/蟑螂路定义，例如 "R"/"B" 等） */
    resultDownRoad: string;
    /** X 坐标 */
    showX: number;
    /** Y 坐标 */
    showY: number;
    /** 时间戳（毫秒） */
    stampTime: number;
    /** 额外奖区结果 */
    winGameModes: string[];
    [property: string]: any;
}

/** No.10 牌路统计：好路提示 */
export interface ViaRoadGoodRoad {
    /** 好路类型标识（例如「连庄」「跳庄」等，自定义规则） */
    goodRoad?: string;
    /** 对应的玩法 / 模式（如某种开奖模式） */
    gameMode?: string;
    /** 好路出现次数 */
    count?: number;
    /** 客制优先级（数字越小可能越优先显示） */
    priority?: number;
    [property: string]: any;
}

/** No.10 牌路统计：单桌的完整牌路数据 */
export interface ViaRoadTableData {
    /** 桌台 ID（来自 No.9 的 tableId，例如 "702"） */
    tableId: string;
    /** 游戏类型（例如 "BACCARAT"） */
    gameCode: string;
    /** 当前靴号（洗牌后的局组） */
    gameShoe: number;
    /** 当前局数 */
    gameRound: number;
    /** 洗牌标记（1 代表刚洗牌之类，具体以后端说明为准） */
    shuffle: number;

    /** 胜利次数统计（数组形式，具体索引含义由后端定义） */
    winnerCounts: number[];
    /** 各结果出现次数（庄/闲/和/庄对/闲对） */
    winnerCounter: ViaRoadWinnerCounter;

    /** 珠盘路（每一局一格） */
    markerRoads: ViaRoadMarkerRoad[];
    /** 大路（主趋势） */
    mainRoads: ViaRoadMainRoad[];
    /** 大眼仔 */
    bigEyes: ViaRoadDownRoad[];
    /** 小路 */
    smalls: ViaRoadDownRoad[];
    /** 蟑螂路 */
    roaches: ViaRoadDownRoad[];

    /** 好路提示集合 */
    goodRoads: ViaRoadGoodRoad[];
    /** 好路类型，具体值由后端定义 */
    goodRoadType: number;
    /** 当前是否被视为好路桌台 */
    isGoodRoad: boolean;
    /** 好路条数（部分桌台才有） */
    goodRoadCount?: number;

    [property: string]: any;
}

/** No.10 牌路统计返回的 data（每个桌台一条） */
export type ViaRoadData = ViaRoadTableData[];

/** No.10 /game-service/api/v1/road 响应结构 */
export type ViaRoadResp = ApiResponse<ViaRoadData>;


// ---------------- No.11 当前下注统计 ----------------

/** No.11 请求项：来自某一张桌台 */
export interface ViaBetCalcRequestItem {
    /** 桌台编号（例如 "702"），来自 No.9 的 tableId */
    tableId: string;
    /** 游戏编码（例如 "BACCARAT60S"），来自 No.9 tables[tableId].gameCode */
    gameCode: string;
}

export interface ViaBetCalcReq {
    // 把 fieldName 改成真实名字，例如 tables / reqs / list ...
    gameCodeTableIds: ViaBetCalcRequestItem[];
}

/** No.11 单个下注区统计结果 */
export interface ViaBetCalcResult {
    /** 下注类型 / 玩法，例如 BANKER / PLAYER / SUPER_SIX 等 */
    gameMode: string;
    /** 具体子区编号，由厂商自定义（例如 "BANKER_TP"） */
    betId: string;
    /** 当前下注总额 */
    betAmount: number;
    /** 当前在该下注区下注的玩家数 */
    betPlayers: number;
    [property: string]: any;
}

/** No.11 单张桌台的下注统计 */
export interface ViaBetCalcTableData {
    /** 游戏编码 */
    gameCode: string;
    /** 桌台编号 */
    tableId: string;
    /** 当前局参与下注的玩家总数 */
    betPlayers: number;
    /** 每个下注区的统计结果 */
    results: ViaBetCalcResult[];
    [property: string]: any;
}

/** No.11 接口返回的 data：每张桌台一条 */
export type ViaBetCalcData = ViaBetCalcTableData[];

/** No.11 /order/getBetCalculation 响应结构 */
export type ViaBetCalcResp = ApiResponse<ViaBetCalcData>;


// ---------------- No.12 荷官事件 / 桌状态 dealerEvent ----------------

/** No.12 单个玩法中奖模式明细 */
export interface ViaDealerWinModeDetail {
    /** 该玩法对应的牌点 / 组合值列表，具体由后端定义 */
    betValues: number[];
    /** 本玩法在统计中的频率 */
    frequency: number;
    /** 玩法代码，例如某个 Dragon Bonus / Super Six 等 */
    winGameMode: string;
    [property: string]: any;
}

/** No.12 单张桌子的荷官事件 / 当前局状态 */
export interface ViaDealerEventItem {
    /** 当前局唯一编号（通常 = 靴号 + 局号 的组合 ID） */
    drawId: string;
    /** 当前荷官 ID 或昵称 */
    dealerId: string;
    /** 游戏类型代码，例如 BACCARAT60S / LTSUPERSIX 等 */
    gameCode: string;
    /** 当前靴内的局号 */
    gameRound: number;
    /** 当前靴号（洗牌后的一轮） */
    gameShoe: number;

    /** 本局发牌时间（毫秒时间戳） */
    deliverTime: number;
    /** 开局时间（毫秒时间戳） */
    roundStartTime: number;
    /** 结束时间（0 表示未结束） */
    roundEndTime: number;

    /**
     * 当前发牌状态
     *  - 通常 255 = 未发牌
     *  - 其他值为牌面代号，具体由厂商协议定义
     */
    tableCards: number[];
    /** 各张牌的发牌时间（毫秒时间戳，与 tableCards 一一对应） */
    tableCardStampTimes: number[];

    /**
     * 是否洗牌中
     *  - 1 = 洗牌中
     *  - 0 = 正常游戏
     */
    shuffle: number;

    /**
     * 桌状态
     *  - 1 = 进行中
     *  - 2 = 维护
     *  - 3 = 关闭
     */
    tableStatus: number;

    /** 桌是否激活（可被前端展示） */
    isActive: boolean;

    /**
     * 倒计时 / 帧时间（单位：秒）
     * 通常表示当前阶段剩余下注时间
     */
    iTime: number;

    /** 玩家手牌点数（百家乐等游戏使用） */
    playerHandValue: number;

    /** 当前局获胜模式集合（如 BANKER / PLAYER / TIE / SUPER_SIX 等） */
    winGameModes: string[];

    /** 各玩法的中奖明细 */
    winModeDetails: ViaDealerWinModeDetail[];

    /** 获胜方标识（具体数值由后端定义，例如 1=庄 2=闲 3=和） */
    winner: number;

    /** 服务端额外时间（例如补时等用途），具体含义由后端定义 */
    additionalTime: number;

    /** 荷官事件类型（例如 ROUND_START / ROUND_END / SHUFFLE 等） */
    dealerEventType: string;

    /** 桌台编号（和其它接口里的 tableId 一致） */
    tableId: string;

    [property: string]: any;
}

/** No.12 data = 每个桌台一条 dealerEvent */
export type ViaDealerEventData = ViaDealerEventItem[];

/** No.12 /dealerEvent 响应结构 */
export type ViaDealerEventResp = ApiResponse<ViaDealerEventData>;

// ---------------- No.13 玩家个人实时下注状态 ----------------

/**
 * No.13 单张桌子的个人下注状态
 */
export interface ViaCurrentBetItem {
    /**
     * 当前局唯一编号（通常由靴号 + 局号组合）
     */
    drawId: string;

    /**
     * 游戏类型代码，例如：
     *   BACCARAT60S / LTSUPERSIX / LTTPBCRT 等
     */
    gameCode: string;

    /**
     * 桌台编号（与其它接口中的 tableId 一致）
     */
    tableId: string;

    /**
     * 当前玩家在该桌各下注区的下注金额列表
     * 具体下标与后台定义的下注区顺序对应
     */
    amounts: string[];

    [property: string]: any;
}

/**
 * No.13 data = 每个桌台一条记录
 */
export type ViaCurrentBetData = ViaCurrentBetItem[];

/**
 * No.13 /player/currentBet 响应结构
 */
export type ViaCurrentBetResp = ApiResponse<ViaCurrentBetData>;


// ---------------- No.14 游戏房间当前路纸走势的预测状态 /road/next ----------------

/**
 * No.14 大眼路点位
 */
export interface ViaRoadNextBigEye {
    /** 下行路结果标识（例如 B/P/T 等），具体含义由厂商定义 */
    resultDownRoad?: string;
    /** 在路图中的 X 坐标（列） */
    showX?: number;
    /** 在路图中的 Y 坐标（行） */
    showY?: number;
    /** 该点生成的时间戳（毫秒） */
    stampTime?: number;
    /** 本局命中的玩法列表（如 BANKER、PLAYER、SUPER_SIX 等） */
    winGameModes?: string[];
    [property: string]: any;
}

/**
 * No.14 主路（大路）点位
 */
export interface ViaRoadNextMainRoad {
    /** 是否属于“好路” */
    isGoodRoad?: boolean;
    /** 主路结果数组（例如 ["B"] / ["P"] 等） */
    resultMainRoad?: string[];
    /** 在路图中的 X 坐标（列） */
    showX?: number;
    /** 在路图中的 Y 坐标（行） */
    showY?: number;
    /** 该点生成的时间戳（毫秒） */
    stampTime?: number;
    /** 和局次数（tie 数量） */
    tieCount?: number;
    /** 本局命中的玩法列表 */
    winGameModes?: string[];
    [property: string]: any;
}

/**
 * No.14 珠盘路点位
 */
export interface ViaRoadNextMarkerRoad {
    /** 局号 */
    gameRound?: number;
    /** 珠盘路结果（例如 ["B"] / ["P"] / ["T"]） */
    roundResultMarkerRoad?: string[];
    /** 在路图中的 X 坐标（列） */
    showX?: number;
    /** 在路图中的 Y 坐标（行） */
    showY?: number;
    /** 时间戳（毫秒） */
    stampTime?: number;
    /** 本局命中的玩法列表 */
    winGameModes?: string[];
    [property: string]: any;
}

/**
 * No.14 小路 / 蟑螂路 点位
 */
export interface ViaRoadNextDownRoad {
    /** 下行路结果标识 */
    resultDownRoad?: string;
    /** 在路图中的 X 坐标（列） */
    showX?: number;
    /** 在路图中的 Y 坐标（行） */
    showY?: number;
    /** 时间戳（毫秒） */
    stampTime?: number;
    /** 本局命中的玩法列表 */
    winGameModes?: string[];
    [property: string]: any;
}

/**
 * No.14 胜局统计
 *
 * winnerCounter 示例:
 * {
 *   PLAYER_PAIR: 4,
 *   TIE: 4,
 *   BANKER_PAIR: 5,
 *   BANKER: 28,
 *   PLAYER: 16
 * }
 */
export interface ViaRoadNextWinnerCounter {
    /** 庄赢次数 */
    BANKER: number;
    /** 闲赢次数 */
    PLAYER: number;
    /** 和局次数 */
    TIE: number;
    /** 庄对次数 */
    BANKER_PAIR: number;
    /** 闲对次数 */
    PLAYER_PAIR: number;
    /** 预留，兼容其他统计字段 */
    [property: string]: number;
}

/**
 * No.14 单个桌台、单个 gameMode 的预测结果
 */
export interface ViaRoadNextData {
    /** 桌台编号 */
    tableId: string;

    /** 游戏代码，例如 BACCARAT60S / LTBACCARAT 等 */
    gameCode: string;

    /** 当前靴号（洗牌后的局组） */
    gameShoe: number;

    /** 当前靴内的局号 */
    gameRound: number;

    /**
     * 是否洗牌中
     *  - 1 = 洗牌中
     *  - 0 = 正常
     */
    shuffle: number;

    /**
     * 好路类型编码（数值标识，不同数值对应不同“好路”算法）
     * 具体含义由厂商后台定义
     */
    goodRoadType: number;

    /** 当前是否被判定为“好路” */
    isGoodRoad: boolean;

    /** 珠盘路（每一局的原始结果） */
    markerRoads: ViaRoadNextMarkerRoad[];

    /** 大路（主走势） */
    mainRoads: ViaRoadNextMainRoad[];

    /** 大眼仔 */
    bigEyes: ViaRoadNextBigEye[];

    /** 小路 */
    smalls: ViaRoadNextDownRoad[];

    /** 蟑螂路 */
    roaches: ViaRoadNextDownRoad[];

    /** 当前桌面的胜负统计汇总 */
    winnerCounter: ViaRoadNextWinnerCounter;

    [property: string]: any;
}

/** No.14 /road/next 响应结构 */
export type ViaRoadNextResp = ApiResponse<ViaRoadNextData>;


// ---------------- No.15 加入/退出游戏桌聊天室（MUC Room） ----------------

/**
 * 聊天室类型
 * - DEALER  : 桌台聊天室（跟荷官、玩家在同一桌）
 * - STREAMER: 直播主播聊天室（如果厂商有此模式）
 */
export type ViaMucRoomType = 'DEALER' | 'STREAMER';

/**
 * No.15 聊天室加入/退出接口的 data
 * 后端一般会返回一些房间信息，比如 roomJid / joined 等；
 * 这里先做成弱类型，避免和实际字段不匹配。
 */
export interface ViaMucRoomData {
    /** 房间唯一标识（如果后端有返回） */
    roomId?: string;
    /** XMPP MUC JID（例如 xxx@conference.xxx） */
    roomJid?: string;
    /** 是否已加入 */
    joined?: boolean;
    /** 其它字段一律兼容 */
    [property: string]: any;
}

/** No.15 /muc/room/... 响应结构 */
export type ViaMucRoomResp = ApiResponse<ViaMucRoomData | null>;


// ---------------- No.16 获取视频流 /video ----------------

/**
 * No.16 视频流 URL 列表
 *
 * data.url 示例：
 * {
 *   "851": [
 *     "https://xxxxx.m3u8",
 *     "https://xxxxx-backup.m3u8"
 *   ]
 * }
 *
 * key 为桌台 ID（字符串），value 为该桌台可用的视频地址数组
 */
export interface ViaVideoUrlMap {
    /**
     * 键为桌台编号 (tableId)，
     * 值为该桌台的视频流地址列表
     */
    [tableId: string]: string[];
}

/**
 * No.16 /video 接口返回的 data 部分
 */
export interface ViaVideoStreamData {
    /**
     * 链接过期时间（毫秒时间戳）
     * 前端可用来做本地缓存或判断是否需要重新拉取
     */
    expireTime: number;

    /**
     * 各个桌台的视频流地址列表
     * 通常只会包含当前请求 id 对应的 tableId，例如 "851"
     */
    url: ViaVideoUrlMap;

    [property: string]: any;
}

/**
 * No.16 /video 响应结构
 */
export type ViaVideoStreamResp = ApiResponse<ViaVideoStreamData>;


// ---------------- No.17 下注 /order/bet ----------------

/**
 * 单个下注明细
 *
 * 对应后端的 BetDetail：
 * - gameMode: 下注区（例如 PLAYER / BANKER / TIE 等）
 * - amount  : 在该下注区下注的金额
 * - betId   : 对应子玩法/子区 ID（目前示例里为 null，可以先不管）
 * - betValues: 一些特殊玩法需要的附加值（示例里为 null）
 */
export interface ViaBetDetail {
    /** 下注金额 */
    amount?: number;
    /** 子区 ID，有些玩法会用到，示例中为 null */
    betId?: string | null;
    /** 特殊玩法附加值（例如点数组合等），目前为 null */
    betValues?: number[] | null;
    /** 下注类型，例如 PLAYER / BANKER / TIE / BIG / SMALL 等 */
    gameMode?: string;
    [property: string]: any;
}

/**
 * No.17 下注请求体
 *
 * 绝大部分字段都可以从 No.12 dealerEvent + 登录信息 里拿：
 * - drawId         : No.12 dealerEvent.drawId
 * - gameCode       : No.12 dealerEvent.gameCode
 * - roundStartTime : No.12 dealerEvent.roundStartTime
 * - tableId        : No.12 dealerEvent.tableId
 * - hostId         : No.12 dealerEvent.dealerId
 * - hostNickname   : No.12 dealerEvent.dealerId 对应昵称（有时也会返回）
 * - currency       : 登录 tokenInfo.currency
 * - vendorPlayerId : 登录 tokenInfo.vendorPlayerId
 */
export interface ViaBetReq {
    /** 下注明细列表 */
    betDetails: ViaBetDetail[];

    /** 玩家币种，例如 PHP */
    currency: string;

    /** 设备类型，例如 PC / H5 / APP */
    device: string;

    /** 本局唯一 ID（drawId） */
    drawId: string;

    /** 游戏代码，例如 BACCARAT60S */
    gameCode: string;

    /** 当前荷官 ID（dealerId） */
    hostId: string;

    /** 荷官昵称 */
    hostNickname: string;

    /** 直播类型，例如 DEALER / STREAMER */
    liveType: string;

    /** 下注场景，例如 ROOM / LOBBY */
    place: string;

    /** 游戏开始时间（毫秒时间戳） */
    roundStartTime: number;

    /** 桌号，例如 "851" */
    tableId: string;

    /** 总下注金额（所有 betDetails.amount 求和） */
    totalBetAmount: number;

    /** 玩家账号（vendorPlayerId） */
    vendorPlayerId: string;

    [property: string]: any;
}

/** 下注成功后的余额信息 */
export interface ViaBetRespData {
    /** 当前余额 */
    balance: number;
    /** 余额版本号（乐观锁用，后端内部用） */
    version: number;
    [property: string]: any;
}

/** No.17 /order/bet 的整体响应 */
export type ViaBetResp = ApiResponse<ViaBetRespData>;
