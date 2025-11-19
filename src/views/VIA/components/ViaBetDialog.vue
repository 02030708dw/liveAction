<template>
    <!-- 遮罩层，点击遮罩空白处也能关闭 -->
    <div v-if="visible" class="via-bet-mask" @click.self="close">
        <div class="via-bet-modal">
            <h3 class="title">测试下注（No.17）</h3>

            <div class="form-row">
                <label>桌号 tableId：</label>
                <input v-model="tableId" />
            </div>

            <div class="form-row">
                <label>游戏代码 gameCode：</label>
                <input v-model="gameCode" />
            </div>

            <div class="form-row">
                <label>下注区 gameMode：</label>
                <select v-model="gameMode">
                    <option value="PLAYER">PLAYER</option>
                    <option value="BANKER">BANKER</option>
                    <option value="TIE">TIE</option>
                </select>
            </div>

            <div class="form-row">
                <label>下注金额：</label>
                <input v-model.number="amount" type="number" min="1" />
            </div>

            <div class="btn-row">
                <button @click="close">取消</button>
                <button :disabled="submitting" @click="submit">
                    {{ submitting ? '下注中...' : '确认下注' }}
                </button>
            </div>

            <p v-if="localError" class="error">下注失败：{{ localError }}</p>

            <div v-if="via.lastBetResult" class="result">
                <div>最新余额：{{ via.lastBetResult.balance }}</div>
                <div>余额版本：{{ via.lastBetResult.version }}</div>
            </div>

            <details v-if="via.lastBetReq" class="debug">
                <summary>最近一次下注请求（调试）</summary>
                <pre>{{ via.lastBetReq }}</pre>
            </details>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useViaAuthStore } from '@/stores/viaAuth';

const props = defineProps<{
    /** v-model 控制显示/隐藏 */
    modelValue: boolean;
    /** 默认桌号，例如 "851" */
    defaultTableId?: string;
    /** 默认游戏代码，例如 "BACCARAT60S" */
    defaultGameCode?: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', v: boolean): void;
}>();

const via = useViaAuthStore();

// 用 computed 包一层，支持 v-model
const visible = computed({
    get: () => props.modelValue,
    set: (v: boolean) => emit('update:modelValue', v),
});

const tableId = ref(props.defaultTableId ?? '');
const gameCode = ref(props.defaultGameCode ?? '');
const gameMode = ref('PLAYER');
const amount = ref<number | null>(10);
const localError = ref('');

// 打开弹窗时重置错误 & 默认值
watch(
    () => props.modelValue,
    (v) => {
        if (v) {
            localError.value = '';
            if (props.defaultTableId) tableId.value = props.defaultTableId;
            if (props.defaultGameCode) gameCode.value = props.defaultGameCode;
        }
    },
);

const submitting = computed(() => via.betLoading);

function close() {
    visible.value = false;
}

async function submit() {
    localError.value = '';

    if (!tableId.value || !gameCode.value || !amount.value || amount.value <= 0) {
        localError.value = '请填写完整信息且金额要大于 0';
        return;
    }

    try {
        await via.placeBet({
            tableId: tableId.value,
            gameCode: gameCode.value,
            gameMode: gameMode.value,
            amount: amount.value,
        });

        // 成功后直接关弹窗（调试阶段你也可以注释掉）
        // close();
    } catch (err: any) {
        localError.value = via.betError || err?.message || '下注失败';
    }
}
</script>

<style scoped>
.via-bet-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
}

.via-bet-modal {
    width: 420px;
    max-width: 90vw;
    background: #fff;
    border-radius: 8px;
    padding: 16px 18px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 14px;
}

.title {
    margin-top: 0;
    margin-bottom: 12px;
}

.form-row {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
}

.form-row label {
    width: 140px;
}

.form-row input,
.form-row select {
    flex: 1;
    padding: 4px 8px;
}

.btn-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
}

button {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #ccc;
    cursor: pointer;
    font-size: 13px;
}

button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.error {
    margin-top: 8px;
    color: #d93025;
}

.result {
    margin-top: 8px;
    color: #0b8043;
}

.debug {
    margin-top: 10px;
    max-height: 200px;
    overflow: auto;
    background: #f7f7f7;
    padding: 6px;
    border-radius: 4px;
}
</style>
