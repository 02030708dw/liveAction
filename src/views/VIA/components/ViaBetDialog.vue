<!-- src/views/via/components/BetDialog.vue -->
<template>
    <div class="bet-mask">
        <div class="bet-dialog">
            <header class="bet-header">
                <div>
                    <h3>
                        桌台 {{ room.tableId }} - {{ room.displayName || room.gameCode }}
                    </h3>
                    <p class="sub">
                        游戏：{{ room.gameCode }} ｜ 当前局：Shoe {{ room.gameShoe ?? '-' }} /
                        Round {{ room.gameRound ?? '-' }}
                    </p>
                </div>
                <button class="close-btn" @click="onClose">✕</button>
            </header>

            <section class="bet-body">
                <!-- 下注区选择 -->
                <div class="field">
                    <label>下注区（gameMode）</label>
                    <select v-model="gameMode">
                        <option value="PLAYER">PLAYER（闲）</option>
                        <option value="BANKER">BANKER（庄）</option>
                        <option value="TIE">TIE（和）</option>
                        <!-- 你有需要再加其它 DragonBonus / SuperSix 等 -->
                    </select>
                </div>

                <!-- 金额输入 -->
                <div class="field">
                    <label>下注金额</label>
                    <div class="amount-row">
                        <input v-model.number="amount" type="number" min="0" step="1" placeholder="请输入金额" />
                        <span class="currency">{{ currency }}</span>
                    </div>

                    <div class="chips">
                        <button v-for="v in quickChips" :key="v" type="button" @click="addChip(v)">
                            +{{ v }}
                        </button>
                        <button type="button" @click="clearAmount">清空</button>
                    </div>
                </div>

                <!-- 提示信息 -->
                <p v-if="localError" class="error">{{ localError }}</p>
                <p v-else-if="betError" class="error">下注失败：{{ betError }}</p>
                <p v-else-if="lastBetResult" class="success">
                    最近一次下注成功，余额：{{ lastBetResult.balance }}（版本 {{ lastBetResult.version }}）
                </p>
            </section>

            <footer class="bet-footer">
                <button class="btn cancel" :disabled="betLoading" @click="onClose">
                    取消
                </button>
                <button class="btn confirm" :disabled="betLoading" @click="submit">
                    {{ betLoading ? '下注中…' : '确认下注' }}
                </button>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useViaAuthStore } from '@/stores/viaAuth';
import type { ViaLobbyRoom } from '@/types/via/lobby';

const props = defineProps<{
    room: ViaLobbyRoom;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'success'): void;
}>();

const via = useViaAuthStore();
const { betLoading, betError, lastBetResult, loginData } = storeToRefs(via);

// 默认下注区：PLAYER
const gameMode = ref<'PLAYER' | 'BANKER' | 'TIE'>('PLAYER');
// 默认金额：0
const amount = ref<number>(0);

const localError = ref<string | null>(null);

const currency = computed(
    () => loginData.value?.tokenInfo?.currency || 'PHP',
);

// 快捷筹码
const quickChips = [10, 50, 100, 500];

function addChip(v: number) {
    amount.value = (amount.value || 0) + v;
}

function clearAmount() {
    amount.value = 0;
}

// 表单校验
function validate(): boolean {
    if (!gameMode.value) {
        localError.value = '请选择下注区';
        return false;
    }
    if (!amount.value || amount.value <= 0) {
        localError.value = '请输入大于 0 的下注金额';
        return false;
    }
    localError.value = null;
    return true;
}

async function submit() {
    if (!validate()) return;

    try {
        await via.placeBet({
            tableId: props.room.tableId,
            gameCode: props.room.gameCode,
            gameMode: gameMode.value,
            amount: amount.value,
        });

        emit('success');
        onClose();
    } catch (e) {
        // 错误信息已经在 store.betError 中记录，这里只保留本地提示
        if (!localError.value) {
            localError.value = '下注失败，请检查日志';
        }
    }
}

function onClose() {
    emit('close');
}

// 修改输入时清掉错误
watch([gameMode, amount], () => {
    localError.value = null;
});
</script>

<style scoped>
.bet-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
}

.bet-dialog {
    width: 420px;
    max-width: 95%;
    background: #0b1020;
    border-radius: 10px;
    border: 1px solid #1f2933;
    padding: 16px 18px 14px;
    color: #f9fafb;
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.65);
}

.bet-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}

.bet-header h3 {
    margin: 0;
    font-size: 16px;
}

.sub {
    margin: 2px 0 0;
    font-size: 12px;
    opacity: 0.8;
}

.close-btn {
    border: none;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    font-size: 16px;
}

.bet-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
}

.field label {
    display: block;
    margin-bottom: 4px;
}

select,
input[type='number'] {
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #374151;
    background: #020617;
    color: #f9fafb;
    font-size: 13px;
    outline: none;
}

select:focus,
input[type='number']:focus {
    border-color: #2563eb;
}

.amount-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.currency {
    font-size: 12px;
    opacity: 0.8;
    min-width: 40px;
}

.chips {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.chips button {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #e5e7eb;
    font-size: 11px;
    cursor: pointer;
}

.chips button:hover {
    border-color: #818cf8;
}

.error {
    margin: 0;
    color: #fca5a5;
    font-size: 12px;
}

.success {
    margin: 0;
    color: #6ee7b7;
    font-size: 12px;
}

.bet-footer {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.btn {
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid transparent;
}

.btn.cancel {
    border-color: #4b5563;
    background: #111827;
    color: #e5e7eb;
}

.btn.confirm {
    border-color: #10b981;
    background: #059669;
    color: #ecfdf5;
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>
