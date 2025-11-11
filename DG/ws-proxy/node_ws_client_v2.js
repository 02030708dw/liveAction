/**
 * node_ws_client_v18.js — 带自动心跳 + 宽容解码 + /send API + 本地日志
 * 依赖：npm i ws crypto-js socks-proxy-agent protobufjs
 */

const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const CryptoJS = require("crypto-js");
const { SocksProxyAgent } = require("socks-proxy-agent");
const protobuf = require("protobufjs/light"); // CommonJS: 'protobufjs/light'

/* ======================== 可配置参数 ======================== */

const WS_BASE = "wss://hwdata-new.taxyss.com";
const ORIGIN = "https://new-dd-cn.dingdangmail.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

// 玩家 Token（网页里就是 this.playerInfo.token）
const TOKEN = "aa00c0d9ddc24527bcd1d77dc7da3956";
// 固定 wsKey（网页里的 t.wskey）
const WSKEY = "pV5mY8dR2qGxH1sK9tBzN6uC3fWjE0aL7rTnJ4cQvSgPZyFMiXoUbDlAhOeRwd36";

// 代理（保持 socks5h://127.0.0.1:7898）63dwReOhAlDbUoXiMFyZPgSvQc4JnTr7La0EjWf3Cu6NzBt9Ks1HxGq2Rd8Ym5Vp
const USE_PROXY = true;
const PROXY_URL = "socks5h://127.0.0.1:7898";

// HTTP 控制端口
const HTTP_PORT = 3000;

// 心跳间隔（毫秒）
const HEARTBEAT_MS = 15000;

// 初始化顺序（进入大厅）
const INIT_SEQ = [
  { cmd: 10086, tableId: 1, type: 0, object: "PC" },
  { cmd: 45, type: 1 },
  { cmd: 43, tableId: 1, type: 0 },
  { cmd: 5011, type: 0 },
  { cmd: 87, type: 1 },
  { cmd: 24, type: 2 }
];

/* ======================== 工具函数 ======================== */

// 时间戳
const ts = () => new Date().toISOString();

// 追加日志到本地文件
function appendLog(line) {
  try {
    fs.appendFileSync("ws_log.txt", `[${ts()}] ${line}\n`);
  } catch (e) {
    console.error("[LOG] write error:", e.message);
  }
}

// Base64Url 安全（只用于日志显示，不用于实际请求）
function b64Url(str) {
  return str.replace(/\+/g, "%2B").replace(/\//g, "%2F").replace(/=/g, "%3D");
}

// 3DES 加密（网页同款）
function getEncryptToken(str) {
  const key = CryptoJS.enc.Utf8.parse(WSKEY);
  const enc = CryptoJS.TripleDES.encrypt(str, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return enc.toString(); // Base64
}

// 生成 sign
function genSign() {
  return getEncryptToken(TOKEN);
}

/* ========== 发送封包所需的最小 PublicBean 结构（protobufjs） ========== */

const { Type, Field } = protobuf;

const PublicBean = new Type("PublicBean")
  .add(new Field("cmd", 1, "int32"))
  .add(new Field("token", 2, "string"))
  .add(new Field("codeId", 3, "int32"))
  .add(new Field("lobbyId", 4, "int32"))
  .add(new Field("gameNo", 5, "string"))
  .add(new Field("tableId", 6, "int32"))
  .add(new Field("seat", 7, "int32"))
  .add(new Field("mid", 8, "int64"))
  .add(new Field("dList", 9, "double", "repeated"))
  .add(new Field("type", 10, "int32"))
  .add(new Field("userName", 11, "string"))
  .add(new Field("list", 12, "string", "repeated"))
  .add(new Field("mids", 13, "int64", "repeated"))
  .add(new Field("object", 14, "string"))
  // 下面 15/16/17 为数组消息，但发送时一般用不到，这里不建类型也能正常发
  ;

/** 构造并编码 PublicBean 二进制 */
function buildPacket(base) {
  // envelope 用于加密 token（网页原逻辑）
  const envelope = {
    cmd: base.cmd,
    token: TOKEN,
    time: Date.now()
  };
  const encToken = getEncryptToken(JSON.stringify(envelope));

  const msg = {
    cmd: base.cmd,
    token: encToken,
    codeId: base.codeId ?? 0,
    lobbyId: base.lobbyId ?? 0,
    gameNo: base.gameNo ?? "",
    tableId: base.tableId ?? 0,
    seat: base.seat ?? 0,
    mid: base.mid ?? "0",
    dList: base.dList ?? [],
    type: base.type ?? 0,
    userName: base.userName ?? "",
    list: base.list ?? [],
    mids: base.mids ?? [],
    object: base.object ?? "",
  };

  return PublicBean.encode(msg).finish();
}

function sendPublic(ws, base) {
  const buf = buildPacket(base);
  ws.send(buf);
  appendLog(`[SEND] ${JSON.stringify(base)}`);
  console.log(`[SEND] cmd=${base.cmd} bytes=${buf.length}`);
}

/* ======================== 宽容解码（不依赖 .proto） ======================== */

class Reader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  eof() { return this.pos >= this.buf.length; }
  uint32() {
    let val = 0, shift = 0, b;
    do { b = this.buf[this.pos++]; val |= (b & 0x7f) << shift; shift += 7; } while (b >= 128);
    return val >>> 0;
  }
  int32() { return this.uint32() | 0; }
  int64() { return this.uint32(); }
  string() {
    const len = this.uint32();
    const s = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(s);
  }
  double() {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return v;
  }
  skipType(wt) {
    switch (wt) {
      case 0: this.uint32(); break;
      case 1: this.pos += 8; break;
      case 2: { const l = this.uint32(); this.pos += l; break; }
      case 5: this.pos += 4; break;
      default: throw Error("Unknown wireType: " + wt);
    }
  }
}

function parseMsg(r) {
  const obj = {};
  while (!r.eof()) {
    const tag = r.uint32();
    const id = tag >>> 3, wt = tag & 7;
    if (!id) { r.skipType(wt); continue; }
    let val;
    switch (wt) {
      case 0: val = r.int32(); break;
      case 1: val = r.double(); break;
      case 2: {
        const len = r.uint32();
        const sub = new Reader(r.buf.subarray(r.pos, r.pos + len)); r.pos += len;
        try {
          const inner = parseMsg(sub);
          val = Object.keys(inner).length ? inner : new TextDecoder().decode(sub.buf);
        } catch {
          val = new TextDecoder().decode(sub.buf);
        }
        break;
      }
      case 5: val = r.int32(); break;
      default: r.skipType(wt); continue;
    }
    if (obj[id] === undefined) obj[id] = val;
    else if (Array.isArray(obj[id])) obj[id].push(val);
    else obj[id] = [obj[id], val];
  }
  return obj;
}

// 工具
const asString = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return "";
  return String(v);
};

// 映射 Virtual
function mapVirtual(r) {
  if (!r) return [];
  const arr = Array.isArray(r) ? r : [r];
  return arr.map(v => ({
    seatId: v[1] ?? 0,
    userName: asString(v[2]),
    currency: asString(v[3]),
    betInfo: asString(v[4]),
    balance: v[5] ?? 0,
    type: v[6] ?? 0,
    mid: asString(v[7]),
    streak: v[8] ?? 0,
    betNum: v[9] ?? 0,
    winNum: v[10] ?? 0,
    head: asString(v[11]),
    deviceType: v[12] ?? 0,
    list: Array.isArray(v[13]) ? v[13].map(asString) : []
  }));
}

// 映射 Dealer
function mapDealer(r) {
  if (!r) return null;
  return {
    id: r[1] ?? 0,
    name: asString(r[2]),
    no: asString(r[3]),
    photo: asString(r[4]),
    gender: r[5] ?? 0,
    online: !!r[6],
    type: r[9] ?? 0
  };
}

// 映射 LobbyPush
function mapLobbyPush(r) {
  if (!r) return [];
  const arr = Array.isArray(r) ? r : [r];
  return arr.map(v => ({
    tableId: v[1] ?? 0,
    onlineCount: +(v[2] ?? 0),
    totalAmount: +(v[3] ?? 0),
    vipName: asString(v[4]),
    seatFull: !!v[5]
  }));
}
function fixGameNo(raw) {
  if (typeof raw === "object" && raw !== null) {
    const s = Object.values(raw).join("");
    return s && s.length < 13 ? "25" + s : s;
  }
  const s = asString(raw);
  return s && s.length < 13 ? "25" + s : s;
}
// 映射 Table
function mapTable(r) {
  if (!r) return [];
  const arr = Array.isArray(r) ? r : [r];
  return arr.map(v => ({
    tableId: v[1] ?? 0,
    shoeId: asString(v[2]),
    playId: asString(v[3]),
    state: v[4] ?? 0,
    countDown: v[5] ?? 0,
    result: asString(v[6]),
    poker: asString(v[7]),
    tel: Array.isArray(v[8]) ? v[8].map(asString) : [],
    ext: Array.isArray(v[9]) ? v[9].map(asString) : [],
    roads: Array.isArray(v[10]) ? v[10].map(asString) : [],
    gameNo: fixGameNo(v[11]),
    fms: asString(v[12]),
    tableName: asString(v[13]),
    vipName: asString(v[14]),
    totalAmount: v[15] ?? 0,
    onlineCount: v[16] ?? 0,
    dealer: mapDealer(v[17]),
    gameId: v[18] ?? 0,
    anchor: v[19] ?? null,
  }));
}

function detectVersion(raw) {
  const keys = Object.keys(raw).map(Number).filter(n => !isNaN(n));
  const maxField = keys.length ? Math.max(...keys) : 0;
  if (maxField >= 19) return "v3 (anchor)";
  if (maxField === 18) return "v2 (room)";
  if (maxField >= 17) return "v1 (standard)";
  if (maxField <= 14) return "vLite (basic)";
  return "unknown";
}

function mapPublicBean(raw) {
  const ver = detectVersion(raw);
  const o = {
    _version: ver,
    cmd: raw[1] ?? 0,
    token: asString(raw[2]),
    codeId: raw[3] ?? 0,
    lobbyId: raw[4] ?? 0,
    gameNo: asString(raw[5]),
    tableId: raw[6] ?? 0,
    seat: raw[7] ?? 0,
    mid: asString(raw[8] ?? "0"),
    dList: Array.isArray(raw[9]) ? raw[9] : [],
    type: raw[10] ?? 0,
    userName: asString(raw[11]),
    list: Array.isArray(raw[12]) ? raw[12].map(asString) : [],
    mids: Array.isArray(raw[13]) ? raw[13] : [],
    object: asString(raw[14]),
    virtual: mapVirtual(raw[15]),
    lobbyPush: mapLobbyPush(raw[16]),
    table: mapTable(raw[17]),
  };
  if (raw[18]) o.room = raw[18];
  if (raw[19]) o.anchor = raw[19];
  return o;
}

/* ======================== WebSocket 连接 & 逻辑 ======================== */

let ws = null;
let heartbeatTimer = null;
let inited = false;

function connect() {
  const sign = genSign(); // 3DES(TOKEN)
  const url = `${WS_BASE}/?sign=${sign}`;

  const options = {
    headers: {
      // "Origin": ORIGIN,
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits"
    },
    handshakeTimeout: 15000
  };

  if (USE_PROXY) {
    options.agent = new SocksProxyAgent(PROXY_URL);
    console.log(`[PROXY] using ${PROXY_URL}`);
  } else {
    console.log("[PROXY] not using proxy");
  }

  console.log("[CONNECT]", url);
  appendLog(`[CONNECT] ${url}`);

  ws = new WebSocket(url, options);

  ws.on("open", () => {
    console.log("[WS] ✅ 已连接成功");
    appendLog("[WS] OPEN");
    // 先发心跳
    sendPublic(ws, { cmd: 99 });
    // 3 秒内没回包也继续初始化
    setTimeout(() => {
      if (!inited) {
        console.log("[INIT] ⏱ 超时触发初始化");
        startInit();
      }
    }, 3000);
  });

  ws.on("message", (data) => {
    // data 是 Buffer
    try {
      const raw = parseMsg(new Reader(new Uint8Array(data)));
      const mapped = mapPublicBean(raw);
      appendLog(`[RECV] ${JSON.stringify(mapped)}`);
      console.log("[RECV] mapped:", JSON.stringify(mapped));

      if (!inited) {
        startInit();
      }
    } catch (e) {
      appendLog(`[RECV_ERR] ${e.message}`);
      console.error("[RECV_ERR]", e.message);
    }
  });

  ws.on("error", (err) => {
    console.error("[WS] ❌ error:", err.message);
    appendLog(`[WS_ERROR] ${err.message}`);
  });

  ws.on("close", (code, reason) => {
    console.log("[WS] ❌ close:", code, reason);
    appendLog(`[WS_CLOSE] ${code} ${reason}`);
    clearInterval(heartbeatTimer);
  });
}

function startInit() {
  if (inited) return;
  inited = true;

  console.log("[INIT] 发送初始化序列", INIT_SEQ.map(i => i.cmd).join("/"));
  (async () => {
    for (const pkt of INIT_SEQ) {
      sendPublic(ws, pkt);
      await new Promise(r => setTimeout(r, 200));
    }
    console.log("[INIT] ✅ 完成");
    startHeartbeat();
  })();
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendPublic(ws, { cmd: 99 });
      console.log("[💓 HEARTBEAT] cmd=99");
    }
  }, HEARTBEAT_MS);
}

/* ======================== HTTP /send 接口 ======================== */

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const j = JSON.parse(body || "{}");
        // 兼容：如果传入完整 JSON（含 token），我们忽略外部 token，使用内部 token+3DES 方案
        // 必填：cmd
        if (!j.cmd) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, msg: "missing cmd" }));
          return;
        }
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, msg: "ws not connected" }));
          return;
        }
        // 只取我们关心的字段
        const base = {
          cmd: j.cmd | 0,
          codeId: j.codeId ?? 0,
          lobbyId: j.lobbyId ?? 0,
          gameNo: j.gameNo ?? "",
          tableId: j.tableId ?? 0,
          seat: j.seat ?? 0,
          mid: j.mid ?? "0",
          dList: Array.isArray(j.dList) ? j.dList : [],
          type: j.type ?? 0,
          userName: j.userName ?? "",
          list: Array.isArray(j.list) ? j.list : [],
          mids: Array.isArray(j.mids) ? j.mids : [],
          object: j.object ?? "",
        };
        sendPublic(ws, base);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sent: base }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, msg: e.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/betting") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const j = JSON.parse(body || "{}");
        // 兼容：如果传入完整 JSON（含 token），我们忽略外部 token，使用内部 token+3DES 方案
        // 必填：cmd
        if (!j.cmd) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, msg: "missing cmd" }));
          return;
        }
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, msg: "ws not connected" }));
          return;
        }
        // 只取我们关心的字段
        const base = {
          cmd: j.cmd | 0,
          codeId: j.codeId ?? 0,
          lobbyId: j.lobbyId ?? 0,
          gameNo: j.gameNo ?? "",
          tableId: j.tableId ?? 0,
          seat: j.seat ?? 0,
          mid: j.mid ?? "0",
          dList: Array.isArray(j.dList) ? j.dList : [],
          type: j.type ?? 0,
          userName: j.userName ?? "",
          list: Array.isArray(j.list) ? j.list : [],
          mids: Array.isArray(j.mids) ? j.mids : [],
          object: j.object ?? "",
        };
        sendPublic(ws, base);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sent: base }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, msg: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    const ok = !!ws && ws.readyState === WebSocket.OPEN;
    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok, state: ws ? ws.readyState : -1 }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, msg: "not found" }));
});

server.listen(HTTP_PORT, () => {
  console.log(`[HTTP] /send 端口: http://127.0.0.1:${HTTP_PORT}/send`);
  console.log(`[HTTP] /health 端口: http://127.0.0.1:${HTTP_PORT}/health`);
});


connect();
