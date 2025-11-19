// src/modules/via/types/flow.ts

// 所有步骤 key
export type StepKey =
    | 'step01Login'
    | 'step02GetProfile'
    | 'step03GetGameTypes'
    | 'step04GetHallLevels'
    | 'step05InitRoad'
    | 'step06GetGlobalSetting'
    | 'step07GetGameConfigSummary'
    | 'step08GetOnlineStats'
    | 'step09InitLobby'
    | 'step10GetRoad'
    | 'step11PlaceBet'
    | 'step12GetGameState'
    | 'step13GetPlayerRealtimeState'
    | 'step14GetTrendState'
    | 'step15EnterOrLeaveChatRoom'
    | 'step16GetVideoStream'
    | 'step17RebetInfo';

export const STEP_ORDER: StepKey[] = [
    'step01Login',
    'step02GetProfile',
    'step03GetGameTypes',
    'step04GetHallLevels',
    'step05InitRoad',
    'step06GetGlobalSetting',
    'step07GetGameConfigSummary',
    'step08GetOnlineStats',
    'step09InitLobby',
    'step10GetRoad',
    'step11PlaceBet',
    'step12GetGameState',
    'step13GetPlayerRealtimeState',
    'step14GetTrendState',
    'step15EnterOrLeaveChatRoom',
    'step16GetVideoStream',
    'step17RebetInfo',
];

export const STEP_LABEL: Record<StepKey, string> = {
    step01Login: 'No.1 登录',
    step02GetProfile: 'No.2 获取个人信息',
    step03GetGameTypes: 'No.3 获取游戏类型',
    step04GetHallLevels: 'No.4 游戏厅层级定义',
    step05InitRoad: 'No.5 初始化牌路',
    step06GetGlobalSetting: 'No.6 全局设置',
    step07GetGameConfigSummary: 'No.7 游戏配置总表',
    step08GetOnlineStats: 'No.8 在线人数统计',
    step09InitLobby: 'No.9 初始化大厅',
    step10GetRoad: 'No.10 获取路纸',
    step11PlaceBet: 'No.11 下注统计/下单',
    step12GetGameState: 'No.12 游戏事件状态',
    step13GetPlayerRealtimeState: 'No.13 玩家实时下注状态',
    step14GetTrendState: 'No.14 当前路纸走势',
    step15EnterOrLeaveChatRoom: 'No.15 进出聊天室',
    step16GetVideoStream: 'No.16 获取视频流',
    step17RebetInfo: 'No.17 下注',
};

export interface StepState {
    name: string;
    loading: boolean;
    success: boolean | null; // null = 未执行
    error: string | null;
    response: any | null; // 保存接口返回（调试用）
}

export interface ViaFlowState {
    running: boolean;
    currentStepIndex: number;
    steps: Record<StepKey, StepState>;
    logs: string[];
    // 这里还可以放一些关键数据，比如：
    platformToken: string;
    headerAuthToken: string;
}
