<template>
    <div class="dialog">
        <div class="via-ws-login">
            <h3 class="title">No.1 登录连接 & 连接</h3>

            <form class="form" @submit.prevent="handleSubmit">
                <div class="field">
                    <label>账号</label>
                    <input v-model="username" type="text" placeholder="输入账号" :disabled="loading" />
                </div>

                <div class="field">
                    <label>密码</label>
                    <input v-model="password" type="password" placeholder="输入密码" :disabled="loading" />
                </div>

                <!-- 如果需要可以让 wsUrl 可配置，这里先写死 / 用 env -->
                <div class="field">
                    <label>WS 地址</label>
                    <input v-model="wsUrl" type="text" placeholder="wss://www.j4r3b77.com/websocket-service/player"
                        :disabled="loading" />
                </div>

                <div class="actions">
                    <button type="submit" :disabled="loading">
                        {{ loading ? '登录中...' : '登录并连接 WS' }}
                    </button>
                    <span class="status">{{ viaWs.status }}</span>
                </div>

                <p v-if="errorMsg" class="error">
                    {{ errorMsg }}
                </p>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useViaWsStore } from '@/stores/viaWs';
// import { useViaAuthStore } from '@/stores/viaAuth';


const viaWs = useViaWsStore();
// const viaAuth = useViaAuthStore();

const username = ref(`member${(15 + 10 * Math.random()).toFixed(0)}`);
const password = ref('a123456');
const wsUrl = ref('wss://www.j4r3b77.com/websocket-service/player'); // 你实际的地址
const loading = ref(false);
const errorMsg = ref('');

// 提交表单：先调 enterGame 拿 token，再连接 ws
const handleSubmit = async () => {
    if (!username.value || !password.value) {
        errorMsg.value = '请输入账号和密码';
        return;
    }

    errorMsg.value = '';
    loading.value = true;

    try {
        await viaWs.startAutoFlow(
            username.value,
            password.value,
            wsUrl.value, // 比如 'wss://www.j4r3b77.com/websocket-service/player'
        );

        handleLoginSuccess();
    } catch (err: any) {
        handleClose();
        console.error(err);
        errorMsg.value = err?.message || '登录或连接失败';
        viaWs.log(`❌ 登录/连接失败: ${errorMsg.value}`);
    } finally {
        loading.value = false;
    }
};
onMounted(() => {
    handleSubmit()
})
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'success'): void
}>();

function handleClose() {
    emit('close');
}

function handleLoginSuccess() {
    emit('success');
    emit('close');   // 登录成功顺便关掉弹窗
}
</script>

<style scoped>
.dialog {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);

}

.via-ws-login {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 20px;
    background: #fafafa;
    width: 430px;
}

.title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
}

.form {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.field label {
    font-size: 12px;
    color: #555;
}

.field input {
    padding: 6px 8px;
    border-radius: 3px;
    border: 1px solid #ccc;
    font-size: 13px;
}

.field input:disabled {
    background: #f3f3f3;
}

.actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
}

.actions button {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid #409eff;
    background: #409eff;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
}

.actions button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.status {
    font-size: 12px;
    color: #666;
}

.error {
    margin-top: 4px;
    font-size: 12px;
    color: #e53935;
}
</style>
