<template>
    <div class="wm-debug" v-if="enabled">
        <header class="top">
            <div class="row">
                <strong>WM Debug</strong>
                <span class="dot" :class="{ on: wsOpen15101 }" />
                <span class="mini">15101</span>
                <span class="dot" :class="{ on: wsOpen15109 }" />
                <span class="mini">15109</span>
                <span class="dot" :class="{ on: wsOpenPhp }" />
                <span class="mini">php</span>
            </div>

            <div class="row">
                <label class="mini">group</label>
                <input class="inp" v-model.number="wm.focusGroupID" placeholder="groupID" />

                <button class="btn" @click="pickFirstOnline">pick</button>
                <button class="btn" @click="wm.clearLog()">clear</button>
                <button class="btn" @click="wm.debugEnabled = !wm.debugEnabled">
                    log: {{ wm.debugEnabled ? "on" : "off" }}
                </button>
                <button class="btn" @click="enabled = false">hide</button>
            </div>
        </header>

        <section class="focus" v-if="focus">
            <div class="kv">
                <span>groupID:</span><b>{{ focus.groupID }}</b>
                <span>tableStatus:</span><b>{{ focus.tableStatus }}</b>
                <span>gameStage:</span><b>{{ focus.gameStage }}</b>
            </div>
            <div class="kv">
                <span>gameNo:</span><b>{{ focus.gameNo }}</b>
                <span>gameNoRound:</span><b>{{ focus.gameNoRound }}</b>
            </div>
            <div class="kv">
                <span>cardsArr:</span><b>{{ (focus.cardsArr || []).join(",") }}</b>
            </div>
        </section>

        <section ref="logRef" class="log">
            <div v-for="(l, i) in wm.debugLines" :key="i" class="line">{{ l }}</div>
        </section>
    </div>

    <!-- 小按钮：方便再打开 -->
    <button v-else class="wm-debug-open" @click="enabled = true">WM</button>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useWmWsStore } from "@/stores/wmWs";

const wm = useWmWsStore();

const enabled = ref(true);
// const focusGroupID = ref<number>(wm.joinedGroupID || 0);

const wsOpen15101 = computed(() => wm.gameSocket?.readyState === WebSocket.OPEN);
const wsOpen15109 = computed(() => wm.hallSocket?.readyState === WebSocket.OPEN);
const wsOpenPhp = computed(() => wm.phpClientSocket?.readyState === WebSocket.OPEN);

const focus = computed(() => {
    if (!wm.focusGroupID) return null;
    return wm.game101GroupInfo.get(wm.focusGroupID) || null;
});

function pickFirstOnline() {
    for (const g of wm.game101GroupInfo.values()) {
        if ((g as any).tableStatus === 1) {
            wm.focusGroupID = Number((g as any).groupID);
            return;
        }
    }
}

const logRef = ref<HTMLElement | null>(null);
watch(
    () => wm.debugLines.length,
    async () => {
        await nextTick();
        const el = logRef.value;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }
);
</script>

<style scoped>
.wm-debug {
    position: fixed;
    left: 10px;
    bottom: 10px;
    width: 520px;
    height: 360px;
    z-index: 99999;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(0, 0, 0, .78);
    color: #eaeaea;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .35);
}

.top {
    padding: 8px 10px;
    background: rgba(255, 255, 255, .06);
    border-bottom: 1px solid rgba(255, 255, 255, .12);
}

.row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.row:last-child {
    margin-bottom: 0;
}

.mini {
    font-size: 12px;
    opacity: .85;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, .25);
}

.dot.on {
    background: #37d67a;
}

.inp {
    width: 120px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, .18);
    background: rgba(0, 0, 0, .25);
    color: #fff;
    padding: 0 8px;
}

.btn {
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, .18);
    background: rgba(255, 255, 255, .08);
    color: #fff;
    padding: 0 10px;
    cursor: pointer;
}

.btn:active {
    transform: translateY(1px);
}

.focus {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, .12);
    background: rgba(255, 255, 255, .03);
}

.kv {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 6px;
}

.kv:last-child {
    margin-bottom: 0;
}

.kv span {
    opacity: .75;
}

.kv b {
    color: #fff;
    font-weight: 700;
}

.log {
    height: calc(100% - 110px);
    overflow: auto;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.4;
}

.line {
    white-space: pre-wrap;
    word-break: break-word;
    padding: 2px 0;
    border-bottom: 1px dashed rgba(255, 255, 255, .06);
}

.wm-debug-open {
    position: fixed;
    left: 10px;
    bottom: 10px;
    z-index: 99999;
    border: none;
    border-radius: 999px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, .7);
    color: #fff;
}
</style>
