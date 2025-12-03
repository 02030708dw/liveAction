<template>
    <section class="space-y-3">
        <h3 class="text-lg font-semibold">Baccarat 桌子列表（gameID = 101）</h3>

        <div v-if="!tables || tables.length === 0" class="text-xs text-slate-400">
            暂无桌子数据，请确认已收到 protocol=35 初始化。
        </div>

        <div v-else class="grid gap-4" :class="{
            'grid-cols-1': tables.length <= 1,
            'md:grid-cols-2': tables.length >= 2,
            'xl:grid-cols-3': tables.length >= 3,
        }">
            <!-- 单个桌子卡片 -->
            <article v-for="table in tables" :key="table.groupID"
                class="flex flex-col bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-md min-w-[360px]">
                <!-- 头部：游戏名 / ID / Shoe / Round / CD -->
                <header class="flex items-center justify-between px-4 py-2 bg-slate-800/90 border-b border-slate-700">
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 text-[10px] rounded-full bg-purple-600/80 text-white uppercase tracking-wide">
                            Baccarat
                        </span>

                        <span class="text-sm font-semibold">
                            {{ table.tableDtExtend?.tableName || 'Baccarat' }}
                        </span>

                        <span class="ml-2 text-[11px] text-slate-400">
                            ID: {{ table.groupID }}
                        </span>
                    </div>

                    <div class="flex items-center gap-4 text-[11px] text-slate-300">
                        <span>Shoe {{ table.gameNo || '--' }}</span>
                        <span>Round {{ table.gameNoRound ?? 0 }}</span>
                        <span>CD {{ getCountdownSec(table) }}</span>
                    </div>
                </header>

                <!-- 中间：路单 + 荷官 -->
                <section class="flex px-4 py-3 gap-4">
                    <!-- 左：路单 -->
                    <div class="flex-1 flex flex-col">
                        <div class="text-xs mb-1 text-slate-400">大路</div>

                        <div
                            class="flex-1 bg-slate-950/70 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-300">
                            <div v-if="hasHistory(table)">
                                共 {{ table.historyArr!.length }} 局，
                                红 {{ table.historyData?.redCount ?? 0 }} /
                                黑 {{ table.historyData?.blackCount ?? 0 }} /
                                0 {{ table.historyData?.zeroCount ?? 0 }} 次
                            </div>
                            <div v-else class="text-slate-500">暂无路纸数据</div>
                        </div>
                    </div>

                    <!-- 右：荷官 -->
                    <div class="w-28 flex flex-col items-center">
                        <div
                            class="w-24 h-32 rounded-md overflow-hidden bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                            <img v-if="table.dealerImage" :src="table.dealerImage" class="w-full h-full object-cover"
                                :alt="table.dealerName" />
                            <div v-else class="text-[10px] text-slate-500 text-center px-2">
                                暂无荷官图片
                            </div>
                        </div>
                        <div class="mt-1 text-xs text-slate-200 truncate max-w-24">
                            {{ table.dealerName || 'Dealer' }}
                        </div>

                        <div class="mt-2 px-2 py-0.5 rounded-full text-[10px] bg-blue-700/90 text-white">
                            {{ getStageText(table) }}
                        </div>
                    </div>
                </section>

                <!-- 底部：统计 + 操作 -->
                <footer
                    class="mt-auto flex items-center justify-between px-4 py-2 bg-slate-900/90 border-t border-slate-800 text-xs">
                    <div class="flex flex-col gap-0.5 text-[11px]">
                        <div>
                            <span class="text-amber-400">总投注</span>
                            <span class="ml-1 text-slate-100">
                                {{ getTotalBet(table).toFixed(1) }}
                            </span>
                        </div>
                        <div>
                            <span class="text-amber-400">下注人数</span>
                            <span class="ml-1 text-slate-100">
                                {{ getTotalPlayerCount(table) }}
                            </span>
                        </div>
                        <div v-if="balanceData" class="text-[10px] text-slate-400">
                            余额：{{ balanceData.balance }} {{ balanceData.currencyCode }}
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button
                            class="px-3 py-1 rounded-full text-[11px] bg-blue-700/90 text-white hover:bg-blue-600 transition">
                            新局开始 / {{ getStageText(table) }}
                        </button>
                        <button
                            class="px-4 py-1 rounded-full text-[12px] bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition"
                            @click="openBetModal(table)">
                            投注
                        </button>
                    </div>
                </footer>
            </article>
        </div>

        <!-- 统一的 WM 投注弹窗 -->
        <WmBetModal v-model:show="betModalVisible" :group="currentGroup" @bet-success="handleBetSuccess" />
    </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import type { WmGroupInfo, WmGameBalanceData } from '@/types/wm/ws';
import WmBetModal from './WmBetModal.vue';

const props = defineProps<{
    tables: WmGroupInfo[];
    balanceData?: WmGameBalanceData | null;
}>();

const balanceData = computed(() => props.balanceData ?? null);

// ========== 投注弹窗相关 ==========
const betModalVisible = ref(false);
const currentGroup = ref<WmGroupInfo | null>(null);

const openBetModal = (table: WmGroupInfo) => {
    currentGroup.value = table;
    betModalVisible.value = true;
};

const handleBetSuccess = () => {
    // 这里你可以接入自己的 toast 提示
    console.log('[WM] 已发送下注请求，等待 23 回包');
};

// ========== 原有工具函数 ==========
const hasHistory = (table: WmGroupInfo) =>
    Array.isArray(table.historyArr) && table.historyArr.length > 0;

const getCountdownSec = (table: WmGroupInfo) => {
    const baseMs = table.timeMillisecond ?? 0; // 原始剩余毫秒
    if (!baseMs || baseMs <= 0) return 0;

    const recvAt = (table as any).betTimeReceivedAt as number | undefined;
    if (!recvAt) {
        // 没记录本地时间，就按原始值直接显示
        const sec = Math.floor(baseMs / 1000);
        return sec > 0 ? sec : 0;
    }

    // 计算从收到包到现在过去了多久
    const passed = now.value - recvAt;
    const leftMs = baseMs - passed;

    const leftSec = Math.ceil(leftMs / 1000);
    return leftSec > 0 ? leftSec : 0;
};


const getStageText = (table: WmGroupInfo) => {
    switch (table.gameStage) {
        case 1: return '洗牌中';
        case 2: return '准备下注';
        case 3: return '下注中';
        case 4: return '开牌中';
        default: return '未知阶段';
    }
};

const getTotalBet = (table: WmGroupInfo) => {
    const dt: any = table.dtNowBet;
    if (!dt) return 0;
    if (dt['-1']) return Number(dt['-1'].value || 0);
    return Object.values(dt).reduce((sum: number, v: any) => sum + Number(v?.value || 0), 0);
};

const getTotalPlayerCount = (table: WmGroupInfo) => {
    const dt: any = table.dtNowBet;
    if (!dt) return 0;
    if (dt['-1']) return Number(dt['-1'].playerCount || 0);
    return Object.values(dt).reduce(
        (sum: number, v: any) => sum + Number(v?.playerCount || 0),
        0,
    );
};

const now = ref(Date.now());
let nowTimer: number | null = null;

onMounted(() => {
    nowTimer = window.setInterval(() => {
        now.value = Date.now();
    }, 200) as unknown as number;
});

onUnmounted(() => {
    if (nowTimer !== null) {
        window.clearInterval(nowTimer);
        nowTimer = null;
    }
});
</script>
