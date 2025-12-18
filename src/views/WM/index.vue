<template>
  <main class="min-h-screen bg-slate-950 text-slate-100 font-mono p-5 space-y-10">
    <!-- 登录 -->
    <section class="space-y-3">
      <h3 class="text-lg font-semibold">登录 / 进入游戏 / WebSocket（自动模式）</h3>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">用户名</label>
        <input v-model="username"
          class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <label class="text-sm text-slate-300">密码</label>
        <input v-model="password" type="password"
          class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <!-- 按钮可以保留手动触发（调试用），也可以删掉 -->
        <button @click="onLogin"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
          手动登录
        </button>

        <button @click="onEnterGame"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
          手动进入游戏（获取 sid）
        </button>

        <span class="text-xs text-slate-400">
          当前为自动模式：进入页面即自动登录 + 连接；WS 断开自动重连
        </span>
      </div>

      <!-- 登录响应 -->
      <div class="space-y-1">
        <p class="text-xs text-slate-400">登录响应：</p>
        <pre
          class="mt-1 w-full bg-slate-900/70 text-slate-100 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3">{{ loginOut }}</pre>
      </div>

      <!-- 当前 sid -->
      <div class="space-y-1">
        <p class="text-xs text-slate-400">当前 sid：</p>
        <pre
          class="mt-1 w-full bg-slate-900/70 text-emerald-300 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3">{{ sid }}</pre>
      </div>

      <!-- 从大厅拿到的限红配置 -->
      <div class="space-y-1">
        <p class="text-xs text-slate-400">
          dtBetLimitSelectID（从大厅WS回传）：
        </p>
        <pre
          class="mt-1 w-full bg-slate-900/70 text-amber-300 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3">{{ dtBetLimitSelectID }}</pre>
      </div>
    </section>
    <!-- 桌子列表 -->
    <WmTables :tables="tables" :balance-data="balanceData" />
  </main>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWmWsStore } from '@/stores/wmWs';
import WmTables from './components/WmTable.vue';

const wmWsStore = useWmWsStore();
const {
  sid,
  dtBetLimitSelectID,
  loginOut,
  game101GroupInfo,
  balanceData,
} = storeToRefs(wmWsStore);

const username = ref('member22');
const password = ref('a123456');

const tables = computed(() => game101GroupInfo.value.filter(v => v.tableStatus === 1) ?? []);

/** HTTP 登录（手动按钮用，可选） */
const onLogin = async () => {
  try {
    await wmWsStore.httpLogin(username.value, password.value);
  } catch { }
};

/** 手动：进入游戏 + 全链路 WS（调试用） */
const onEnterGame = async () => {
  try {
    await wmWsStore.enterGameAndConnect();
  } catch { }
};

onMounted(() => {
  wmWsStore.startAutoFlow(username.value, password.value);
});

onBeforeUnmount(() => {
  wmWsStore.stopAutoFlow();
});
</script>