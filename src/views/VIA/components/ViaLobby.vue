<!-- src/views/via/ViaLobby.vue -->
<template>
    <div class="via-lobby">
        <header class="lobby-header">
            <h1>VIA 大厅</h1>
            <p class="sub">
                共 {{ rooms.length }} 个桌台
                <span v-if="loading">（数据加载中…）</span>
            </p>

            <div class="toolbar">
                <button :disabled="loading" @click="refresh">
                    {{ loading ? '刷新中…' : '刷新房间数据（No.9-12）' }}
                </button>

                <label class="filter">
                    游戏类型：
                    <select v-model="filterGameCode">
                        <option value="">全部</option>
                        <option v-for="code in gameCodes" :key="code" :value="code">
                            {{ code }}
                        </option>
                    </select>
                </label>
            </div>
        </header>

        <section class="room-grid">
            <TableCard v-for="room in filteredRooms" :key="room.tableId" :room="room" @enter="onEnterRoom"
                @bet="onBet" />
        </section>

        <!-- 下注弹窗 -->
        <BetDialog v-if="betDialogVisible && currentBetRoom" :room="currentBetRoom" @close="betDialogVisible = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useViaAuthStore } from '@/stores/viaAuth';
import type { ViaLobbyRoom } from '@/types/via/lobby';
import TableCard from './TableCard.vue';
import BetDialog from './ViaBetDialog.vue';

const via = useViaAuthStore();
const { lobbyRooms } = storeToRefs(via);

const loading = ref(false);
const filterGameCode = ref('');

const rooms = computed<ViaLobbyRoom[]>(() => lobbyRooms.value || []);

const gameCodes = computed(() => {
    const set = new Set<string>();

    rooms.value.forEach((r) => {
        if (r.gameCode) set.add(r.gameCode);
    });
    return Array.from(set);
});

const filteredRooms = computed(() => {
    if (!filterGameCode.value) return rooms.value;
    return rooms.value.filter((r) => r.gameCode === filterGameCode.value);
});

/**
 * 刷新房间数据：依次执行 No.9-12，然后 buildLobbyRooms 已经在 store 里自动调用
 */
async function refresh() {
    if (loading.value) return;
    loading.value = true;
    try {
        // 依赖 loginData.token，所以如果还没登录，建议你在外面先跑过 1~8 步
        await via.runStep('step09InitLobby');
        await via.runStep('step10GetRoad');
        await via.runStep('step11PlaceBet');
        await via.runStep('step12GetGameState');
    } finally {
        loading.value = false;
    }
}

// 首次进入页面，如果没有房间数据，就自动刷新一次
onMounted(() => {
    if (!lobbyRooms.value?.length) {
        refresh();
    }
});

// 进入房间（这里先简单输出，你之后可以跳到具体游戏路由）
function onEnterRoom(room: ViaLobbyRoom) {
    console.log('进入房间：', room.tableId, room.displayName);
    // 这里你可以：router.push({ name: 'ViaRoom', params: { tableId: room.tableId } })
}

// 打开下注弹窗
const betDialogVisible = ref(false);
const currentBetRoom = ref<ViaLobbyRoom | null>(null);

function onBet(room: ViaLobbyRoom) {
    currentBetRoom.value = room;
    betDialogVisible.value = true;
}
</script>

<style scoped>
.via-lobby {
    padding: 16px 24px 32px;
    background: #050816;
    color: #f5f5f5;
    min-height: 100vh;
}

.lobby-header {
    margin-bottom: 16px;
}

.lobby-header h1 {
    font-size: 20px;
    margin: 0 0 4px;
}

.sub {
    font-size: 12px;
    opacity: 0.8;
}

.toolbar {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

button {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
    background: #1f2933;
    color: #f5f5f5;
    font-size: 12px;
    cursor: pointer;
}

button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.filter select {
    margin-left: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
    background: #0b1020;
    color: #f5f5f5;
    font-size: 12px;
}

.room-grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 12px;
}

.filter select {
    margin-left: 4px;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
    background: #0b1020;
    color: #f5f5f5;
    font-size: 12px;

    /* 去掉原生样式，兼容一些浏览器 */
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
}

/* 下拉列表里的每一项样式 */
.filter select option {
    background: #050816;
    /* 深色背景 */
    color: #f5f5f5;
    /* 白字 */
}
</style>
