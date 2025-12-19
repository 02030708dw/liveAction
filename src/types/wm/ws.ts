// src/types/wm.ts

/** 15801 / 15101 登录时用的限红配置结构（根据你现在的用法，key: string, value: number） */
export type WmDtBetLimitSelectID = Record<string, number>;

/** 泛型 WS 消息结构 */
export interface WmWsMessage<T = any> {
    protocol: number;
    data: T;
}

/** 大厅 protocol=0 登录回包的 data（只写我们当前要用的字段） */
export interface WmHallLoginData {
    dtBetLimitSelectID?: WmDtBetLimitSelectID;
    [key: string]: any;
}

/** 大厅 protocol=35 推送的数据结构（你这里直接转发给 phpclient，用 any 即可） */
export interface WmHallInitData {
    [key: string]: any;
}

/** 推给 phpclient 的 payload 结构 */
export interface WmPhpClientPayload<T = any> {
    type: "wmGameTableInfos";
    data: T;
}

// src/types/wm.ts

/** 15109 - protocol=35 的 tableDtExtend */
export interface WmTableDtExtend {
    netGroupName: string;
    phoneGroupName: string;
    tableName: string;
    netType: string;
    phoneType: string;
}

/** 15109 - protocol=35 中 historyData.resultObjArr 的单项 */
export interface WmHistoryResultObj {
    gameNo: number;
    gameNoRound: number;
    result: number;
    resultContent: string;
}

/** 15109 - protocol=35 中 historyData 结构 */
export interface WmHistoryData {
    resultObjArr: WmHistoryResultObj[];
    dataArr1: number[];
    dataArr2: number[][];
    dataArr3: number[][];
    dataArr4: number[][];
    dataArr5: number[][];
    dataArr6: number[];
    bankerCount: number;
    playerCount: number;
    tieCount: number;
    bankerPairCount: number;
    playerPairCount: number;
    bigCount: number;
    smallCount: number;
    bankerGodCount: number;
    playerGodCount: number;
    super6Count: number;
    totalCount: number;

    bankerAsk3: number;
    bankerAsk4: number;
    bankerAsk5: number;
    playerAsk3: number;
    playerAsk4: number;
    playerAsk5: number;

    dataArr2Status: number;
    dataArr3Status: number;
    dataArr4Status: number;
    dataArr5Status: number;

    zeroCount?: number;
    blackCount?: number;
    redCount?: number;
}

/** 15109 - protocol=35 groupArr.areaArr 的结构 */
export interface WmGroupArea {
    areaID: number;
    areaType: number;
    memberArr: any[]; // 暂时没用到，先用 any
    seatArr: any[];   // 暂时没用到，先用 any
}

/** 15109 - protocol=35 的 groupArr 结构（你给的那一大坨） */
export interface WmGroupInfo {
    groupID: number;
    groupType: number;
    singleLimit: number;
    tableMinBet: number;
    tableMaxBet: number;
    tableTieMinBet: number;
    tableTieMaxBet: number;
    tablePairMinBet: number;
    tablePairMaxBet: number;
    tableStatus: number;
    tableSort: number;
    tableSort2: number;
    reservedTable: number;
    reservedTableParentIDArr: number[];
    reservedTableMemberIDArr: number[];
    tableDtExtend: WmTableDtExtend;

    gameNo: number;
    gameNoRound: number;
    dealerID: number;
    dealerName: string;
    dealerImage: string;
    dealerImage2: string;
    dealer2ID: number;
    dealer2Name: string;
    dealer2Image: string;
    dealer2Image2: string;

    betMilliSecond: number;
    betTimeCount: number;
    betTimeContent: Record<string, any>;

    timeMillisecond: number;
    keyStatus: number;
    gameMode: number;
    gameStage: number;
    userCount: number;

    result: number;
    playerScore: number;
    bankerScore: number;
    sceneAreaID: number;

    historyArr: number[];
    historyData: WmHistoryData;

    areaArr: WmGroupArea[];

    // 当前这桌的牌 & 结算中奖区域
    dtCard?: WmDtCard;
    winBetAreaArr?: number[];

    /** 实时下注广播（protocol 33） */
    dtNowBet?: WmDtNowBet;
    betTimeReceivedAt: number;// ⭐ 本地收到这次 dtNowBet 的时间戳，用于计算延迟
}

/** 15109 - protocol=35 中 gameArr 的单项 */
export interface WmHallGameItem {
    gameID: number;
    onlinePeople: number;
    groupArr: WmGroupInfo[];
}

/** 15109 - protocol=35 整体 data 结构 */
export interface WmHallInit35Data {
    gameArr: WmHallGameItem[];
}

/** 15101 protocol=30 刷新余额 */
export interface WmGameBalanceData {
    memberID: number;
    currencyCode: string;  // "PHP"
    currencyName: string;  // "披索"
    currencyRate: number;  // 8.2526
    balance: number;       // 602.5000
    lockChips: number;     // 0.0000
    chips: number;         // 0.0000
}

// 牌信息
export interface WmCardInfo {
    cardID: number;
    inputType: number;
}

// dtCard 结构：{ "1": { cardID, inputType }, "2": { ... } }
export type WmDtCard = Record<string, WmCardInfo>;

// 实时下注单项
export interface WmNowBetItem {
    playerCount: number;
    value: number;
}

// dtNowBet 结构：{ "1": { playerCount, value }, "-1": {...}, ... }
export type WmDtNowBet = Record<string, WmNowBetItem>;

/** ========= 精简桌面数据（仅后端需要） ========= */
export type WmLeanGroup = {
    groupID: number;

    // 桌态（保持和后端要求一致；与 gameStage 同值）
    tableStatus?: number;
    gameStage?: number;

    // 限红（白名单）
    tableDtExtend?: {
        singleLimit?: number;
        tableMinBet?: number;
        [k: string]: any;
    };

    // 局号
    gameNo: number;
    gameNoRound: number;

    // 荷官
    dealerID?: number | string;

    // 倒计时
    betTimeCount?: number;
    betTimeContent?: Record<string, any>;
    timeMillisecond?: number;
    betTimeReceivedAt?: number;

    // 在线人数
    userCount?: number;

    // 路单（仅 resultObjArr）
    historyData?: { resultObjArr?: any[] };

    dealerName?: string;
    dealerImage?: string;
    dtNowBet?: WmDtNowBet;

    cardsArr?: number[];
};