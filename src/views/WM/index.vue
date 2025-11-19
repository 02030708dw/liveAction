<template>
  <main
    class="min-h-screen bg-slate-950 text-slate-100 font-mono p-5 space-y-10"
  >
    <!-- 登录 -->
    <section class="space-y-3">
      <h3 class="text-lg font-semibold">登录 / 进入游戏 / WebSocket</h3>

      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-slate-300">用户名</label>
        <input
          v-model="username"
          class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <label class="text-sm text-slate-300">密码</label>
        <input
          v-model="password"
          type="password"
          class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          @click="onLogin"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          登录
        </button>

        <button
          @click="onEnterGame"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          进入游戏（获取 sid）
        </button>
      </div>

      <!-- 登录响应 -->
      <div class="space-y-1">
        <p class="text-xs text-slate-400">登录响应：</p>
        <pre
          class="mt-1 w-full bg-slate-900/70 text-slate-100 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3"
          >{{ loginOut }}</pre
        >
      </div>

      <!-- 当前 sid -->
      <div class="space-y-1">
        <p class="text-xs text-slate-400">当前 sid：</p>
        <pre
          class="mt-1 w-full bg-slate-900/70 text-emerald-300 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3"
          >{{ sid }}</pre
        >
      </div>

      <!-- 从大厅拿到的限红配置 -->
      <div class="space-y-1">
        <p class="text-xs text-slate-400">
          dtBetLimitSelectID（从大厅WS回传）：
        </p>
        <pre
          class="mt-1 w-full bg-slate-900/70 text-amber-300 text-xs whitespace-pre-wrap rounded border border-slate-800 p-3"
          >{{ dtBetLimitSelectID }}</pre
        >
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();

const username = ref("member19");
const password = ref("a123456");

const loginOut = ref("");
const enterGameOut = ref("");

const sid = ref("");
const dtBetLimitSelectID = ref<Record<string, number> | null>(null);

const hallSocket = ref<WebSocket | null>(null); // 15109
const clientSocket = ref<WebSocket | null>(null); // 15801
const gameSocket = ref<WebSocket | null>(null); // 15101
const phpClientSocket = ref<WebSocket | null>(null); // phpclient

let hallHeartbeatTimer: number | null = null;

// 防止重复连 15801 / 15101
const clientAndGameConnected = ref(false);

const onEnterGame = async () => {
  try {
    const res = (await authStore.enterWMGame()) as {
      resCode: string;
      resDesc: string;
      resultSet: string;
    };

    enterGameOut.value = JSON.stringify(res, null, 2);

    const urlObj = new URL(res.resultSet);
    const sidValue = urlObj.searchParams.get("sid");
    if (!sidValue) {
      console.error("未从 resultSet 中解析到 sid");
      return;
    }

    sid.value = sidValue;
    console.log("获取到 sid:", sid.value);

    clientAndGameConnected.value = false;
    dtBetLimitSelectID.value = null;

    // 一步启动链路：
    connectPhpClient(); // 先连中转
    connectHall(); // 再连大厅，等 protocol=0 回来再拉起 15801 / 15101
  } catch (e: any) {
    enterGameOut.value = `进入游戏失败：${e?.message ?? String(e)}`;
  }
};

/** 登录 HTTP */
const onLogin = async () => {
  try {
    const res = await authStore.login(username.value, password.value);
    loginOut.value =
      typeof res === "object"
        ? JSON.stringify(res, null, 2)
        : String(res ?? "登录成功");
  } catch (e: any) {
    loginOut.value = `登录失败：${e?.message ?? String(e)}`;
  }
};

/** 连接 phpclient WS：wss://phpclienta.nakiph.xyz/ws/getTableInfos */
const connectPhpClient = () => {
  if (
    phpClientSocket.value &&
    phpClientSocket.value.readyState === WebSocket.OPEN
  ) {
    return;
  }

  if (phpClientSocket.value) {
    phpClientSocket.value.close();
  }

  const ws = new WebSocket("wss://phpclienta.nakiph.xyz/ws/getTableInfos");
  phpClientSocket.value = ws;

  ws.onopen = () => {
    console.log("phpclient WS 已连接");
  };

  ws.onerror = (e) => {
    console.error("phpclient WS error", e);
  };

  ws.onclose = () => {
    console.log("phpclient WS 已关闭");
  };
};

/** 连接大厅 WS：wss://wmgs.szlehuo.com/15109 */
const connectHall = () => {
  if (!sid.value) {
    console.warn("没有 sid，不能连接大厅 15109");
    return;
  }

  if (hallSocket.value) hallSocket.value.close();
  if (hallHeartbeatTimer !== null) {
    window.clearInterval(hallHeartbeatTimer);
    hallHeartbeatTimer = null;
  }

  const ws = new WebSocket("wss://wmgs.szlehuo.com/15109");
  hallSocket.value = ws;

  ws.onopen = () => {
    console.log("大厅 15109 WS 已连接");

    // 1）发送登录（你文档里 protocol=1 登录）
    const loginBody = {
      protocol: 1,
      data: {
        sid: sid.value,
        dtBetLimitSelectID: {}, // 第一次登录传空对象
        bGroupList: false,
        videoName: "TC",
        videoDelay: 3000,
        userAgent: navigator.userAgent,
      },
    };
    ws.send(JSON.stringify(loginBody));
    console.log("大厅 15109 已发送登录 protocol=1");

    // 2）获取大厅初始化信息 protocol=35
    const initBody = {
      protocol: 35,
      data: { type: -1 },
    };
    ws.send(JSON.stringify(initBody));
    console.log("大厅 15109 已发送初始化 protocol=35");

    // 3）心跳 115
    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        const hb = {
          protocol: 115,
          data: { gameID: 101 },
        };
        ws.send(JSON.stringify(hb));
        console.log("大厅 15109 心跳 protocol=115");
      }
    };
    sendHeartbeat();
    hallHeartbeatTimer = window.setInterval(sendHeartbeat, 10_000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as { protocol: number; data: any };
      // console.log("大厅 15109 收到:", msg);

      if (msg.protocol === 0) {
        // ⭐ 登录成功 / 初始数据包，里面有 dtBetLimitSelectID
        // console.log("大厅 15109 protocol=0:", msg.data);

        if (msg.data?.dtBetLimitSelectID) {
          dtBetLimitSelectID.value = msg.data.dtBetLimitSelectID;

          // 拿到限红后，如果还没连过 15801 / 15101，则立即拉起
          if (!clientAndGameConnected.value) {
            connectClient();
            connectGame();
            clientAndGameConnected.value = true;
          }
        }
      } else if (msg.protocol === 35) {
        // ⭐ 大厅初始化，推给 phpclient
        // console.log("大厅 15109 protocol=35:", msg.data);

        const payload = {
          type: "wmGameTableInfos",
          data: msg.data,
        };

        if (
          phpClientSocket.value &&
          phpClientSocket.value.readyState === WebSocket.OPEN
        ) {
          phpClientSocket.value.send(JSON.stringify(payload));
          console.log("已将 protocol=35 data 推给 phpclient");
        } else {
          console.warn(
            "phpclient WS 未连接，无法推 wmGameTableInfos（protocol=35 data）"
          );
        }
      } else {
        // 其他协议你看需求再处理
        // console.log("大厅 15109 其他协议:", msg);
      }
    } catch (e) {
      console.error("解析大厅 15109 WS 消息失败", e, event.data);
    }
  };

  ws.onerror = (e) => {
    console.error("大厅 15109 WS error", e);
  };

  ws.onclose = () => {
    console.log("大厅 15109 WS 已关闭");
    if (hallHeartbeatTimer !== null) {
      window.clearInterval(hallHeartbeatTimer);
      hallHeartbeatTimer = null;
    }
  };
};

/** 连接客户端验证 WS：wss://wmgs.szlehuo.com/15801 */
const connectClient = () => {
  if (!sid.value || !dtBetLimitSelectID.value) {
    console.warn("缺 sid 或 dtBetLimitSelectID，无法连 15801");
    return;
  }

  if (clientSocket.value) clientSocket.value.close();

  const ws = new WebSocket("wss://wmgs.szlehuo.com/15801");
  clientSocket.value = ws;

  ws.onopen = () => {
    console.log("客户端验证 15801 WS 已连接");

    const body = {
      protocol: 1,
      data: {
        sid: sid.value,
        dtBetLimitSelectID: dtBetLimitSelectID.value,
        bGroupList: true, // 文档里 15801 是 true
        videoName: "TC",
        videoDelay: 3000,
        userAgent: navigator.userAgent,
      },
    };

    ws.send(JSON.stringify(body));
    console.log("15801 已发送登录 protocol=1");
  };

  ws.onmessage = (event) => {
    // console.log("15801 收到:", event.data);
  };

  ws.onerror = (e) => {
    console.error("15801 WS error", e);
  };

  ws.onclose = () => {
    console.log("15801 WS 已关闭");
  };
};

const connectGame = () => {
  if (!sid.value || !dtBetLimitSelectID.value) {
    console.warn("缺 sid 或 dtBetLimitSelectID，无法连 15101");
    return;
  }

  if (gameSocket.value) gameSocket.value.close();

  const ws = new WebSocket("wss://wmgs.szlehuo.com/15101");
  gameSocket.value = ws;

  ws.onopen = () => {
    console.log("游戏厅 15101 WS 已连接");

    const body = {
      protocol: 1,
      data: {
        sid: sid.value,
        dtBetLimitSelectID: dtBetLimitSelectID.value,
        bGroupList: false, // 文档里 15101 是 false
        videoName: "TC",
        videoDelay: 3000,
        userAgent: navigator.userAgent,
      },
    };

    ws.send(JSON.stringify(body));
    console.log("15101 已发送登录 protocol=1");
  };

  ws.onmessage = (event) => {
    // console.log("15101 收到:", event.data);
  };

  ws.onerror = (e) => {
    console.error("15101 WS error", e);
  };

  ws.onclose = () => {
    console.log("15101 WS 已关闭");
  };
};

/** 组件卸载时清理所有连接 */
onBeforeUnmount(() => {
  hallSocket.value?.close();
  clientSocket.value?.close();
  gameSocket.value?.close();
  phpClientSocket.value?.close();
  if (hallHeartbeatTimer !== null) {
    window.clearInterval(hallHeartbeatTimer);
  }
});
</script>
