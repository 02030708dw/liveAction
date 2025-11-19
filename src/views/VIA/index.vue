<template>
    <div class="via-flow">
        <h1>VIA 接入流程调试（1-17 步）</h1>

        <div class="actions">
            <button :disabled="running" @click="runAll">
                {{ running ? '运行中...' : '一键执行 1-17 步' }}
            </button>
            <button :disabled="running" @click="reset">重置</button>

            <!-- 🔔 新增：打开投注弹窗 -->
            <button @click="showBetDialog = true">
                测试下注（弹窗）
            </button>
        </div>

        <p v-if="currentStepIndex >= 0">
            当前执行到：第 {{ currentStepIndex + 1 }} 步 {{ currentStep?.name }}
        </p>

        <hr />

        <ul class="step-list">
            <li v-for="(key, idx) in stepOrder" :key="key" class="step-item">
                <div class="step-header">
                    <span class="step-title">
                        {{ idx + 1 }}. {{ steps[key].name }}
                    </span>

                    <span class="step-status" :class="statusClass(steps[key])">
                        <template v-if="steps[key].loading">进行中...</template>
                        <template v-else-if="steps[key].success === true">成功</template>
                        <template v-else-if="steps[key].success === false">失败</template>
                        <template v-else>未执行</template>
                    </span>

                    <button class="step-btn" :disabled="running" @click="runStep(key)">
                        单步执行
                    </button>
                </div>

                <p v-if="steps[key].error" class="step-error">
                    错误：{{ steps[key].error }}
                </p>

                <details v-if="steps[key].response">
                    <summary>查看返回数据</summary>
                    <pre>{{ steps[key].response }}</pre>
                </details>
            </li>
        </ul>

        <hr />

        <h2>日志</h2>
        <pre class="logs">
    <code v-for="(line, i) in logs" :key="i">{{ line }}</code>
</pre>

        <!-- 🔔 新增：下注弹窗组件 -->
        <ViaBetDialog v-model="showBetDialog" defaultTableId="851" defaultGameCode="BACCARAT60S" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { STEP_ORDER, type StepKey } from '@/types/via/flow';
import { useViaAuthStore } from '@/stores/viaAuth';
import { useAuthStore } from '@/stores/auth';
import ViaBetDialog from './components/ViaBetDialog.vue';

const authStore = useAuthStore();
async function startViaFlow() {
    // 平台登录 + 进入 VIA 游戏
    await authStore.login('dk0001', 'a123456');
    await authStore.enterViaGame();
}

const store = useViaAuthStore();
const { running, currentStepIndex, steps, logs } = storeToRefs(store);
const { runAll, runStep, reset } = store;

const stepOrder = STEP_ORDER;

const currentStep = computed(() => {
    if (currentStepIndex.value < 0) return null;
    const key = stepOrder[currentStepIndex.value];
    return steps.value[key as StepKey];
});

function statusClass(step: any) {
    if (step.loading) return 'is-loading';
    if (step.success === true) return 'is-success';
    if (step.success === false) return 'is-fail';
    return 'is-idle';
}

// 🔔 控制投注弹窗显示
const showBetDialog = ref(false);

onMounted(startViaFlow);
</script>

<style scoped>
.via-flow {
    max-width: 900px;
    margin: 24px auto;
    padding: 16px;
    border: 1px solid #eee;
    border-radius: 8px;
    font-size: 14px;
}

.actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

button {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #ccc;
    cursor: pointer;
}

button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.step-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.step-item {
    padding: 8px 0;
    border-bottom: 1px dashed #eee;
}

.step-header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.step-title {
    flex: 1;
    font-weight: 600;
}

.step-status {
    font-size: 12px;
}

.step-status.is-success {
    color: #1a7f37;
}

.step-status.is-fail {
    color: #d93025;
}

.step-status.is-loading {
    color: #e67e22;
}

.step-error {
    color: #d93025;
    margin-top: 4px;
}

.logs {
    max-height: 200px;
    overflow: auto;
    background: #f7f7f7;
    padding: 8px;
    border-radius: 4px;
}

.step-btn {
    font-size: 12px;
}
</style>
