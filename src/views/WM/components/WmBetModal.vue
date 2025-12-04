<template>
    <div v-if="show" class="wm-bet-modal-mask" @click.self="handleClose">
        <div class="wm-bet-modal">
            <header class="modal-header">
                <h3>WM 下注</h3>
                <button class="close-btn" @click="handleClose">×</button>
            </header>

            <section class="modal-body" v-if="group">
                <div class="table-info">
                    <div>桌号：{{ group.groupID }}</div>
                    <div>局号：{{ group.gameNo }} - {{ group.gameNoRound }}</div>
                </div>

                <!-- 选择下注区域 -->
                <div class="bet-area-section">
                    <h4>选择下注区域</h4>
                    <div class="bet-area-list">
                        <button v-for="opt in betAreaOptions" :key="opt.key" class="bet-area-btn"
                            :class="{ active: selectedAreaKey === opt.key }" @click="selectedAreaKey = opt.key">
                            {{ opt.label }}
                        </button>
                    </div>
                </div>

                <!-- 下注金额 -->
                <div class="bet-amount-section">
                    <h4>下注金额</h4>
                    <input type="number" v-model.number="betMoney" min="1" class="bet-amount-input" />

                    <div class="chip-quick">
                        <button v-for="chip in quickChips" :key="chip" class="chip-btn" @click="betMoney = chip">
                            {{ chip }}
                        </button>
                    </div>
                </div>
            </section>

            <footer class="modal-footer">
                <button class="cancel-btn" @click="handleClose">取消</button>
                <button class="confirm-btn" :disabled="!canConfirm" @click="handleConfirm">
                    确认下注
                </button>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useWmWsStore } from "@/stores/wmWs";
import type { WmLeanGroup } from "@/types/wm/ws";

const props = defineProps<{
    show: boolean;
    group: WmLeanGroup | null;
}>();

const emit = defineEmits<{
    (e: "update:show", v: boolean): void;
    (e: "bet-success"): void;
}>();

const wmStore = useWmWsStore();

// ================== 下注区域映射 ==================
// 注意：这里的数字需要你按 WM 文档/实际协议改掉！！
// 我先占坑写一个常见的顺序，你可随时调整：
// ================== 下注区域映射 ==================
// 按你抓包的正式 betArea：
// 闲 = 2, 和 = 3, 庄 = 1, 闲对 = 5, 庄对 = 4
const BET_AREA_NUMBER: Record<string, number> = {
    PLAYER: 2,       // 闲
    BANKER: 1,       // 庄
    TIE: 3,          // 和
    PLAYER_PAIR: 5,  // 闲对
    BANKER_PAIR: 4,  // 庄对
};

const betAreaOptions = [
    { key: "PLAYER", label: "闲" },
    { key: "TIE", label: "和" },
    { key: "BANKER", label: "庄" },
    { key: "PLAYER_PAIR", label: "闲对" },
    { key: "BANKER_PAIR", label: "庄对" },
];


const selectedAreaKey = ref<keyof typeof BET_AREA_NUMBER | null>("PLAYER");
const betMoney = ref<number>(50);

const quickChips = [50, 100, 200, 500];

const canConfirm = computed(() => {
    return (
        !!props.group &&
        !!selectedAreaKey.value &&
        betMoney.value > 0 &&
        Number.isFinite(betMoney.value)
    );
});

function handleClose() {
    emit("update:show", false);
}

function handleConfirm() {
    if (!canConfirm.value || !props.group || !selectedAreaKey.value) return;

    const areaNo = BET_AREA_NUMBER[selectedAreaKey.value];
    if (!areaNo && areaNo !== 0) {
        console.warn("[WM] 找不到下注区域对应的 betArea:", selectedAreaKey.value);
        return;
    }

    const g = props.group;

    // 调用 store 的 placeBet
    wmStore.placeBet({
        groupID: g.groupID,
        gameNo: g.gameNo,
        gameNoRound: g.gameNoRound,
        betArr: [
            {
                betArea: areaNo,
                addBetMoney: betMoney.value,
            },
        ],
        commission: 0,
    });

    emit("bet-success");
    emit("update:show", false);
}
</script>

<style scoped>
.wm-bet-modal-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.wm-bet-modal {
    width: 400px;
    max-width: 90vw;
    background: #1f2933;
    color: #f9fafb;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    padding: 16px 16px 12px;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.modal-header h3 {
    font-size: 16px;
}

.close-btn {
    border: none;
    background: transparent;
    color: #9ca3af;
    font-size: 20px;
    cursor: pointer;
}

.table-info {
    font-size: 13px;
    margin-bottom: 12px;
    opacity: 0.9;
}

.bet-area-section,
.bet-amount-section {
    margin-bottom: 14px;
}

.bet-area-section h4,
.bet-amount-section h4 {
    font-size: 14px;
    margin-bottom: 6px;
}

.bet-area-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.bet-area-btn {
    flex: 1 0 30%;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #e5e7eb;
    cursor: pointer;
    font-size: 13px;
}

.bet-area-btn.active {
    border-color: #f59e0b;
    background: #92400e;
}

.bet-amount-input {
    width: 100%;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #e5e7eb;
    font-size: 14px;
    outline: none;
}

.bet-amount-input:focus {
    border-color: #f59e0b;
}

.chip-quick {
    margin-top: 8px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.chip-btn {
    flex: 1;
    padding: 4px 0;
    border-radius: 999px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #e5e7eb;
    cursor: pointer;
    font-size: 13px;
}

.modal-footer {
    margin-top: 8px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.cancel-btn,
.confirm-btn {
    padding: 6px 14px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-size: 13px;
}

.cancel-btn {
    background: #374151;
    color: #e5e7eb;
}

.confirm-btn {
    background: #f59e0b;
    color: #111827;
}

.confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
