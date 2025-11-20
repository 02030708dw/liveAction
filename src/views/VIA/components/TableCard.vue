<!-- src/views/via/components/TableCard.vue -->
<template>
    <article class="table-card">
        <header class="card-header">
            <div class="game-tag">
                <span class="game-main">{{ gameName }}</span>
                <span class="game-sub">{{ room.gameCode }}</span>
                <span class="table-id">ID: {{ room.tableId }}</span>
            </div>

            <div class="shoe-info">
                <span>Shoe {{ room.gameShoe ?? '-' }}</span>
                <span>Round {{ room.gameRound ?? '-' }}</span>
                <span>CD {{ countdown }}</span>
            </div>
        </header>

        <section class="card-body">
            <div class="road">
                <div class="road-title">大路</div>
                <div class="road-content">
                    暂无路纸数据
                </div>

                <div class="bp-stats">
                    <span>B: {{ room.winnerCounter?.BANKER ?? 0 }}</span>
                    <span>P: {{ room.winnerCounter?.PLAYER ?? 0 }}</span>
                    <span>T: {{ room.winnerCounter?.TIE ?? 0 }}</span>
                </div>
            </div>

            <div class="dealer">
                <div class="avatar-wrap">
                    <div class="avatar" v-if="room.dealerAvatar">
                        {{ room.dealerNickname }}
                        <!-- <img :src="room.dealerAvatar" :alt="room.dealerNickname || 'dealer'" /> -->
                    </div>
                    <div class="avatar placeholder" v-else>
                        {{ dealerInitial }}
                    </div>
                    <div class="dealer-name">{{ room.dealerNickname || 'Dealer' }}</div>
                </div>

                <button class="status-btn">
                    {{ statusText }}
                </button>

                <button class="enter-btn" @click="$emit('enter', room)">
                    Enter
                </button>
            </div>
        </section>

        <footer class="card-footer">
            <div class="bet-summary">
                总投注 {{ room.totalBetAmount.toFixed(1) ?? '0.0' }}
                <span class="sep">｜</span>
                下注人数 {{ room.betPlayers ?? 0 }}
            </div>
            <button class="bet-btn" @click="$emit('bet', room)">
                下注
            </button>
        </footer>
    </article>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { ViaLobbyRoom } from '@/types/via/lobby';

const props = defineProps<{
    room: ViaLobbyRoom;
}>();

defineEmits<{
    (e: 'enter', room: ViaLobbyRoom): void;
    (e: 'bet', room: ViaLobbyRoom): void;
}>();

// ---------- 倒计时逻辑 ----------
const remain = ref<number | null>(null);
let timer: number | null = null;

function clearTimer() {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }
}

function startTimer(from: number) {
    clearTimer();
    remain.value = from;
    timer = window.setInterval(() => {
        if (remain.value === null) return;

        if (remain.value <= 1) {
            remain.value = 0;
            clearTimer();
        } else {
            remain.value = remain.value - 1;
        }
    }, 1000);
}

// 下注阶段的类型（只有这些才需要倒计时）
const BET_PHASE_TYPES = new Set([
    'GP_NEW_GAME_START',
    'GP_BETTING',
]);

// 同时监听 iTime + dealerEventType
watch(
    () => [props.room.iTime, props.room.dealerEventType] as [
        number | undefined,
        string | undefined
    ],
    (newVal, oldVal) => {
        const [newITime, newType] = newVal;
        // const oldITime = oldVal?.[0];
        const oldType = oldVal?.[1];

        const inBetPhase = !!newType && BET_PHASE_TYPES.has(newType);

        // 非下注阶段：不展示倒计时
        if (!inBetPhase) {
            remain.value = null;
            clearTimer();
            return;
        }

        if (typeof newITime !== 'number' || newITime <= 0) {
            remain.value = null;
            clearTimer();
            return;
        }

        const typeChanged = newType !== oldType;

        // 1）阶段变了（上一局→新局），直接用新 iTime 重启
        if (typeChanged) {
            startTimer(newITime);
            return;
        }

        // 2）阶段没变：根据差值决定要不要重置
        if (remain.value === null) {
            // 本地还没有计时，直接启一个
            startTimer(newITime);
            return;
        }

        const diff = Math.abs(newITime - remain.value);
        const THRESHOLD = 3; // 差距阈值，自己可以调

        if (diff > THRESHOLD) {
            // 差距太大，当成服务器纠正时间，重置
            startTimer(newITime);
        }
        // 差距不大就忽略，让本地倒计时继续
    },
    { immediate: true },
);

onBeforeUnmount(clearTimer);

// 显示用的倒计时
const countdown = computed(() => {
    if (remain.value === null || remain.value < 0) return '-';
    return remain.value;
});


// ---------- 其它展示逻辑 ----------
const gameName = computed(() => {
    if (props.room.gameCode?.includes('BACCARAT')) return 'Baccarat';
    if (props.room.gameCode?.includes('DT')) return 'Dragon Tiger';
    if (props.room.gameCode?.includes('SB') || props.room.gameCode?.includes('HL'))
        return 'Dice';
    return 'Game';
});

// 状态文案，用本地倒计时判断是否“下注中”
const statusText = computed(() => {
    const room = props.room;
    const remainSec = remain.value; // 你本地倒计时里的剩余秒数（可能是 null）

    // 1. 优先处理“特殊状态”
    if (room.shuffle === 1) return '洗牌中';
    if (room.tableStatus === 2) return '维护中';
    if (room.tableStatus === 3) return '关闭';

    const t = room.dealerEventType as string | undefined;

    // 2. 根据 dealerEventType 判阶段
    switch (t) {
        case 'GP_NEW_GAME_START':
        case 'GP_BETTING':
            // 一般 NEW_GAME_START / GP_BETTING 这段时间就是下注阶段
            // 有倒计时就展示“新局开始 / 下注中”，没有倒计时就只写新局开始
            if (typeof remainSec === 'number' && remainSec > 0) {
                return '新局开始 / 下注中';
            }
            return '新局开始';

        case 'GP_STOP_BET':
            // 停止下注，等发牌/开奖
            return '停止下注';

        case 'GP_ONE_CARD_DRAWN':
        case 'GP_DEALING':
        case 'GP_DRAWING':
        case 'GP_ONE_CARD_DEALER_DRAWN':
        case 'GP_ONE_CARD_PLAYER_DRAWN':
            // 你现在抓到的是 GP_ONE_CARD_DRAWN，其实就是“开牌中”
            return '开牌中';

        case 'GP_WINNER':
        case 'GP_SETTLEMENT':
            // 已经有赢家了，结果公布阶段
            return '开牌并公布结果';
    }

    // 3. 没有 dealerEventType 或遇到未知值时的兜底逻辑
    if (typeof remainSec === 'number' && remainSec > 0) {
        return '下注中';
    }

    return '新局开始 / 等待';
});


const dealerInitial = computed(() => {
    const name = props.room.dealerNickname || '';
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase();
});
</script>

<style scoped>
.table-card {
    background: #0b1020;
    border-radius: 10px;
    border: 1px solid #1f2933;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: #f5f5f5;
}

.card-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
}

.game-tag {
    display: flex;
    gap: 4px;
    align-items: center;
}

.game-main {
    padding: 2px 6px;
    border-radius: 4px;
    background: #5b21ff;
    font-weight: 600;
    font-size: 11px;
}

.game-sub {
    font-weight: 600;
}

.table-id {
    opacity: 0.7;
}

.shoe-info span+span {
    margin-left: 8px;
}

.card-body {
    display: flex;
    gap: 8px;
}

.road {
    flex: 1;
    background: #050816;
    border-radius: 6px;
    padding: 6px;
    font-size: 12px;
}

.road-title {
    margin-bottom: 4px;
    font-weight: 600;
}

.road-content {
    background: #020617;
    border-radius: 4px;
    padding: 12px;
    text-align: center;
    color: #9ca3af;
}

.bp-stats {
    margin-top: 6px;
    display: flex;
    gap: 8px;
    font-size: 11px;
}

.dealer {
    width: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}

.avatar-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.avatar {
    width: 80px;
    height: 100px;
    border-radius: 8px;
    overflow: hidden;
    background: #111827;
}

.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.avatar.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
}

.dealer-name {
    font-size: 12px;
}

.status-btn {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #e5e7eb;
}

.enter-btn {
    margin-top: 2px;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid #10b981;
    background: #059669;
    color: #ecfdf5;
}

.card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    margin-top: 4px;
}

.bet-summary {
    color: #fbbf24;
}

.sep {
    margin: 0 4px;
    opacity: 0.6;
}

.bet-btn {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid #2563eb;
    background: #1d4ed8;
    color: #eff6ff;
    font-size: 12px;
}
</style>
