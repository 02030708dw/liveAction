<template>
    <div class="via-ws-logs">
        <div class="logs-header">
            <span class="title">WS 日志</span>

            <div class="actions">
                <!-- 一排 1–16 的请求按钮（按你给的实际编号排序） -->
                <div class="req-buttons">
                    <button v-for="no in noList" :key="no" class="req-btn" type="button" @click="sendReq(no)">
                        No.{{ no }} {{ noTitles[no] }}
                    </button>
                </div>

                <span class="count">共 {{ logs.length }} 条</span>
                <button class="btn" type="button" @click="clear">清空</button>
            </div>
        </div>

        <div class="logs-body" ref="scrollEl">
            <div v-if="!logs.length" class="log-empty">
                暂无日志
            </div>

            <div v-for="(item, index) in logs" :key="index" class="log-line">
                {{ item }}
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useViaWsStore } from '@/stores/viaWs';

const viaWs = useViaWsStore();
const { logs } = storeToRefs(viaWs);

const scrollEl = ref<HTMLDivElement | null>(null);

// 和 store 里对应的标题映射（可以抽到单独常量文件里复用）
const noTitles: Record<number, string> = {
    2: '订阅玩家公共频道',
    3: '订阅玩家余额变动',
    4: '玩家资料变化',
    5: '玩家登出事件',
    6: '订阅广播',
    7: '订阅vendor配置变动',
    8: '订阅vendor活动',
    9: '订阅vendor广告',
    10: '订阅游戏桌列表',
    12: '订阅游戏桌状态',
    13: '订阅下注统计',
    14: '取消订阅',
    15: '订阅桌面信息',
    16: '订阅路单',
};

// 需要展示按钮的编号列表（跳过 11）
const noList = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16];

watch(
    logs,
    () => {
        if (scrollEl.value) {
            scrollEl.value.scrollTop = 0;
        }
    },
    { deep: true }
);

const clear = () => {
    viaWs.logs = [];
};

// 点击按钮：统一调用 sendNoRequest
const sendReq = (no: number) => {
    viaWs.sendNoRequest(no);
};
</script>

<style scoped>
.via-ws-logs {
    display: flex;
    flex-direction: column;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    background: #fafafa;
    height: 560px;
}

.logs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid #e5e5e5;
    background: #f3f3f3;
}

.title {
    font-weight: 600;
}

.actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
}

/* 上面一大排按钮 */
.req-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-width: 520px;
    justify-content: flex-end;
}

.req-btn {
    padding: 2px 6px;
    font-size: 11px;
    border-radius: 3px;
    border: 1px solid #bbb;
    background: #fff;
    cursor: pointer;
    white-space: nowrap;
}

.req-btn:hover {
    background: #e6f0ff;
}

.count {
    color: #666;
    font-size: 12px;
    margin-right: 4px;
}

.btn {
    padding: 2px 8px;
    font-size: 12px;
    border-radius: 3px;
    border: 1px solid #ccc;
    background: white;
    cursor: pointer;
}

.btn:hover {
    background: #eee;
}

.logs-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px;
    font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
    background: #0b1020;
    color: #d3e0ff;
}

.log-line {
    white-space: pre-wrap;
    line-height: 1.4;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
    padding: 2px 0;
}

.log-line:last-child {
    border-bottom: none;
}

.log-empty {
    color: #888;
    text-align: center;
    padding: 12px 0;
}
</style>
