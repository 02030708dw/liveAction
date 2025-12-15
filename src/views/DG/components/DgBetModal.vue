<template>
    <div class="bet-modal-backdrop">
        <div class="bet-modal">
            <h4 class="bet-title">
                桌台 {{ table?.tableInfo.tableName }}（ID: {{ tableId }}）
            </h4>

            <div class="bet-form">
                <div class="form-row">
                    <label>Game No</label>
                    <input v-model="betGameNo" />
                </div>

                <div class="form-row">
                    <label>roadType（cmd=43 object.type）</label>
                    <input v-model.number="betRoadType" type="number" />
                </div>

                <div class="form-row">
                    <label>tableIndex（info.table）</label>
                    <input v-model.number="betTableIndex" type="number" />
                </div>

                <div class="form-row">
                    <label>player（例如 100=闲家）</label>
                    <input v-model.number="betPlayer" type="number" />
                </div>

                <div class="form-row">
                    <label>limitId</label>
                    <input v-model.number="betLimitId" type="number" />
                </div>
            </div>

            <div class="bet-actions">
                <button class="btn-primary" @click="submitBet">
                    确认投注
                </button>
                <button class="btn-secondary" @click="$emit('close')">
                    取消
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { UiTable } from '@/utils/dgProto';
import { useDgWsStore } from '@/stores/dgWs';

const props = defineProps<{
    table: UiTable | null;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'bet-success'): void;
}>();

const wsStore = useDgWsStore();

/** ============ 本地表单状态 ============ */
const betGameNo = ref('');
const betRoadType = ref<number | null>(null);
const betTableIndex = ref<number | null>(null);
const betPlayer = ref<number>(100); // 默认闲家
const betLimitId = ref<number>(1);  // 默认 1

const tableId = computed(() => {
    if (!props.table) return '';
    return (
        (props.table.tableInfo as any).tableID ||
        (props.table.tableInfo as any).tableId ||
        ''
    );
});

/**
 * 尝试从 UiTable 里自动推 roadType / tableIndex / player / limitId
 * - roadType：优先从 table.roadType / roadInfo.roadType / tableInfo.roadType / tableInfo.type
 * - tableIndex：优先从 roadInfo.tableIndex / roadInfo.table / tableInfo.tableIndex
 * - player：默认 100（你示例里的闲家）
 * - limitId：默认 1
 */
const initForm = () => {
    if (!props.table) return;

    const info = props.table.tableInfo as any;
    const roadInfo = (props.table as any).roadInfo || {};

    // Game No：按你项目实际字段改，这里尝试几种常见写法
    betGameNo.value =
        info.gameNo ||
        info.gameNoStr ||
        info.roundNo ||
        '';

    // roadType 来源链：props.table.roadType -> roadInfo.roadType -> tableInfo.roadType -> tableInfo.type -> 默认 8
    const roadTypeCandidates = [
        (props.table as any).roadType,
        (roadInfo as any).roadType,
        info.roadType,
        info.type,
    ];
    const rt = roadTypeCandidates.find(
        (v) => v !== undefined && v !== null && v !== '',
    );
    betRoadType.value = rt !== undefined ? Number(rt) : 8; // 文档例子里就是 8

    // tableIndex 来源链：roadInfo.tableIndex -> roadInfo.table -> tableInfo.tableIndex -> 默认 3
    const tableIndexCandidates = [
        (roadInfo as any).tableIndex,
        (roadInfo as any).table,
        info.tableIndex,
    ];
    const ti = tableIndexCandidates.find(
        (v) => v !== undefined && v !== null && v !== '',
    );
    betTableIndex.value = ti !== undefined ? Number(ti) : 3;

    // player：默认闲家 100（你示例 {"player":100,...}）
    betPlayer.value = 100;

    // limitId：你现在协议里是 this.limitId.toString() = "1"
    betLimitId.value = 1;
};

watch(
    () => props.table,
    () => {
        initForm();
    },
    { immediate: true },
);

onMounted(() => {
    initForm();
});

const submitBet = () => {
    if (!props.table) return;

    const idNum = Number(tableId.value);
    if (!idNum) {
        alert('未找到有效 tableId');
        return;
    }
    if (!betGameNo.value) {
        alert('Game No 不能为空');
        return;
    }
    if (betRoadType.value == null) {
        alert('roadType 不能为空');
        return;
    }
    if (betTableIndex.value == null) {
        alert('tableIndex 不能为空');
        return;
    }

    try {
        wsStore.placeSingleBet({
            tableId: idNum,
            gameNo: betGameNo.value,
            betKey: "player",
            amount: betPlayer.value,
            roadType: betRoadType.value,
            tableIndex: betTableIndex.value ?? 3,
        });


        emit('bet-success');
        emit('close');
    } catch (err: any) {
        alert(err?.message || '下注失败，请查看 console 日志');
    }
};
</script>

<style scoped>
.bet-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.bet-modal {
    width: 360px;
    max-width: 90vw;
    background: #111827;
    border-radius: 8px;
    padding: 16px 18px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
    color: #e5e7eb;
}

.bet-title {
    font-size: 15px;
    margin-bottom: 12px;
}

.bet-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.form-row {
    display: flex;
    flex-direction: column;
    font-size: 13px;
}

.form-row label {
    margin-bottom: 4px;
    color: #9ca3af;
}

.form-row input {
    background: #020617;
    border: 1px solid #4b5563;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 13px;
    color: #e5e7eb;
}

.form-row input:focus {
    outline: none;
    border-color: #22c55e;
}

.bet-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
}

.btn-primary,
.btn-secondary {
    padding: 4px 10px;
    border-radius: 999px;
    border: none;
    font-size: 12px;
    cursor: pointer;
}

.btn-primary {
    background: #22c55e;
    color: #052e16;
}

.btn-primary:hover {
    background: #16a34a;
}

.btn-secondary {
    background: #374151;
    color: #e5e7eb;
}

.btn-secondary:hover {
    background: #4b5563;
}
</style>
