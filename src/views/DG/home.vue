<template>
  <main class="min-h-screen bg-slate-950 text-slate-100 font-mono p-5 space-y-10">
    <!-- ① 登录 -->
    <section class="space-y-3">
      <h3 class="text-lg font-semibold">① 登录</h3>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">用户名</label>
        <input v-model="username"
          class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <label class="text-sm text-slate-300">密码</label>
        <input v-model="password" type="password"
          class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <button @click="onLogin"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
          登录
        </button>
      </div>

      <div class="text-xs text-slate-400">
        保存到 localStorage 键：
        <code class="px-1 py-0.5 rounded bg-slate-900 text-[11px] text-slate-100">
          nakiph_auth
        </code>
      </div>

      <pre
        class="mt-2 w-full bg-slate-900/70 text-slate-100 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3">
{{ loginOut }}
      </pre>
    </section>

    <!-- ② 进入游戏 -->
    <section class="space-y-3">
      <h3 class="text-lg font-semibold">② 进入游戏（使用已保存的 Authorization）</h3>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">code</label>
        <input v-model="eg_code"
          class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <label class="text-sm text-slate-300">gamerCode</label>
        <input v-model="eg_gamer"
          class="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <label class="text-sm text-slate-300">providerCode</label>
        <input v-model="eg_provider"
          class="w-28 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <label class="text-sm text-slate-300">live</label>
        <input v-model="eg_live"
          class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <label class="text-sm text-slate-300">html</label>
        <input v-model="eg_html"
          class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />

        <button :disabled="!authStore.auth" @click="onEnter"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
          进入游戏
        </button>
      </div>

      <pre
        class="mt-2 w-full bg-slate-900/70 text-slate-100 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3">
{{ enterOut }}
      </pre>
    </section>

    <!-- ③ 获取 wskey -->
    <section class="space-y-3">
      <h3 class="text-lg font-semibold">③ 获取 wskey（解析 bundle.js 中的 t.wskey）</h3>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">bundle.js</label>
        <input v-model="bundleUrl"
          class="flex-1 min-w-[220px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        <button @click="onWsKey"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white">
          获取 wskey
        </button>
      </div>

      <div class="text-xs text-slate-400">
        保存到 localStorage 键：
        <code class="px-1 py-0.5 rounded bg-slate-900 text-[11px] text-slate-100">
          nakiph_wskey
        </code>
      </div>

      <pre
        class="mt-2 w-full bg-slate-900/70 text-slate-100 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3">
{{ wskeyOut }}
      </pre>
    </section>

    <!-- WS 操作 -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">WS</h2>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">Token:</label>
        <input v-model="wsStore.token"
          class="flex-1 min-w-[260px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">WSKEY:</label>
        <input v-model="wsStore.wskey"
          class="flex-1 min-w-[260px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">mid:</label>
        <input v-model="wsStore.mid"
          class="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        <label class="text-sm text-slate-300">tableId:</label>
        <input v-model.number="wsStore.tableId"
          class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        <label class="text-sm text-slate-300">type:</label>
        <input v-model.number="wsStore.type"
          class="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div class="flex flex-wrap gap-2">
        <button @click="wsStore.connect"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white">
          连接
        </button>
        <button @click="wsStore.close"
          class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-slate-100">
          关闭连接
        </button>
        <button @click="wsStore.sendPacket(99)"
          class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-slate-100">
          发送心跳
        </button>
        <button @click="wsStore.sendPacket(10086)"
          class="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-slate-100">
          发送 10086
        </button>
      </div>

      <div id="status" class="text-xs text-emerald-400">
        {{ wsStore.status }}
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold">日志输出</h3>
          <button @click="wsStore.clearLogs"
            class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-100">
            清除日志
          </button>
        </div>

        <textarea readonly :value="wsStore.logs.join('\n')"
          class="w-full h-52 rounded bg-slate-900/80 border border-slate-800 text-xs text-slate-100 p-2 font-mono outline-none"></textarea>
      </div>
    </section>

    <!-- 桌台展示 -->
    <section class="space-y-3">
      <DgTables :tables="wsStore.uiTables" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/dgAuth';
import { useDgWsStore } from '@/stores/dgWs';
import DgTables from './components/DgTables.vue';

const authStore = useAuthStore();
const wsStore = useDgWsStore();

const username = ref('member19');
const password = ref('a123456');

const eg_code = ref('1');
const eg_gamer = ref('DG');
const eg_provider = ref('cq9');
const eg_live = ref('true');
const eg_html = ref('true');

const bundleUrl = ref(
  'https://new-dd-cn.20299999.com/ddnewpc/V3.1.7/js/bundle.js',
);

const loginOut = computed(() =>
  authStore.loginResp
    ? JSON.stringify(authStore.loginResp, null, 2)
    : '（等待）',
);
const enterOut = computed(() =>
  authStore.enterResp
    ? JSON.stringify(authStore.enterResp, null, 2) +
    (authStore.gameToken
      ? `\n\n✅ 已解析游戏 token:\n${authStore.gameToken}`
      : '')
    : '（等待）',
);
const wskeyOut = computed(
  () =>
    authStore.wskeyResp ||
    (authStore.wskey ? `✅ 已保存的 wskey：\n\n${authStore.wskey}` : '（等待）'),
);

const onLogin = async () => {
  try {
    await authStore.login(username.value.trim(), password.value);
    wsStore.initFromAuth();
  } catch (e: any) {
    alert(e.message || e);
  }
};

const onEnter = async () => {
  try {
    await authStore.enterGame({
      code: eg_code.value,
      gamerCode: eg_gamer.value,
      providerCode: eg_provider.value,
      live: eg_live.value === 'true',
      html: eg_html.value === 'true',
    });
    wsStore.initFromAuth();
  } catch (e: any) {
    alert(e.message || e);
  }
};

const onWsKey = async () => {
  try {
    await authStore.fetchWsKey(bundleUrl.value.trim());
    wsStore.wskey = authStore.wskey;
  } catch (e: any) {
    alert(e.message || e);
  }
};

onMounted(() => {
  authStore.loadFromLocal();
  wsStore.initFromAuth();
});
</script>
