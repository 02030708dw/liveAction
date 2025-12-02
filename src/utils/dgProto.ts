import protobuf from 'protobufjs';

export const BASE = 'https://phpclienta.nakiph.xyz';
export const LS_AUTH = 'nakiph_auth';
export const LS_WSKEY = 'nakiph_wskey';
export const LS_GAME_TOKEN = 'nakiph_gameToken';

export interface AuthInfo {
    tokenHeader: string;
    tokenPrefix: string;
    accessToken: string;
}

/** ====== 宽容解码 Reader & parseMsg（基本保持你原来的实现） ====== */
export class Reader {
    buf: Uint8Array;
    pos = 0;
    constructor(buf: Uint8Array) {
        this.buf = buf;
    }
    eof() {
        return this.pos >= this.buf.length;
    }
    uint32() {
        let val = 0,
            shift = 0,
            b: number;
        do {
            b = this.buf[this.pos++]!;
            val |= (b & 0x7f) << shift;
            shift += 7;
        } while (b >= 128);
        return val >>> 0;
    }
    int32() {
        return this.uint32() | 0;
    }
    int64() {
        // 这里简化成 number
        return this.uint32();
    }
    string() {
        const len = this.uint32();
        const s = this.buf.subarray(this.pos, this.pos + len);
        this.pos += len;
        return new TextDecoder().decode(s);
    }
    double() {
        const v = new DataView(
            this.buf.buffer,
            this.buf.byteOffset + this.pos,
            8,
        ).getFloat64(0, true);
        this.pos += 8;
        return v;
    }
    skipType(wt: number) {
        switch (wt) {
            case 0:
                this.uint32();
                break;
            case 1:
                this.pos += 8;
                break;
            case 2: {
                const l = this.uint32();
                this.pos += l;
                break;
            }
            case 5:
                this.pos += 4;
                break;
            default:
                throw Error('Unknown wireType: ' + wt);
        }
    }
}

export function parseMsg(r: Reader): any {
    const obj: any = {};
    while (!r.eof()) {
        const tag = r.uint32();
        const id = tag >>> 3;
        const wt = tag & 7;
        if (!id) {
            r.skipType(wt);
            continue;
        }
        let val: any;
        switch (wt) {
            case 0:
                val = r.int32();
                break;
            case 1:
                val = r.double();
                break;
            case 2: {
                const len = r.uint32();
                const sub = new Reader(r.buf.subarray(r.pos, r.pos + len));
                r.pos += len;
                try {
                    const inner = parseMsg(sub);
                    val =
                        Object.keys(inner).length > 0
                            ? inner
                            : new TextDecoder().decode(sub.buf);
                } catch {
                    val = new TextDecoder().decode(sub.buf);
                }
                break;
            }
            case 5:
                val = r.int32();
                break;
            default:
                r.skipType(wt);
                continue;
        }
        if (obj[id] === undefined) obj[id] = val;
        else if (Array.isArray(obj[id])) obj[id].push(val);
        else obj[id] = [obj[id], val];
    }
    return obj;
}

/** 工具 */
export const asString = (v: any): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return '';
    return String(v);
};

/** ====== 映射结构 ====== */

export function mapVirtual(r: any): any[] {
    if (!r) return [];
    const arr = Array.isArray(r) ? r : [r];
    return arr.map((v) => ({
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
        list: Array.isArray(v[13]) ? v[13].map(asString) : [],
    }));
}

export function mapDealer(r: any) {
    if (!r) return null;
    return {
        id: r[1] ?? 0,
        name: asString(r[2]),
        no: asString(r[3]),
        photo: asString(r[4]),
        gender: r[5] ?? 0,
        online: !!r[6],
        type: r[9] ?? 0,
    };
}

export function mapLobbyPush(r: any): any[] {
    if (!r) return [];
    const arr = Array.isArray(r) ? r : [r];
    return arr.map((v) => ({
        tableId: v[1] ?? 0,
        onlineCount: +(v[2] ?? 0),
        totalAmount: +(v[3] ?? 0),
        vipName: asString(v[4]),
        seatFull: !!v[5],
    }));
}

function fixGameNo(raw: any): string {
    if (typeof raw === 'object' && raw !== null) {
        const s = Object.values(raw as any).join('');
        return s && s.length < 13 ? '25' + s : s;
    }
    const s = asString(raw);
    return s && s.length < 13 ? '25' + s : s;
}

export function mapTable(r: any): any[] {
    if (!r) return [];
    const arr = Array.isArray(r) ? r : [r];
    return arr.map((v) => ({
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

export function detectVersion(raw: any): string {
    const keys = Object.keys(raw)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
    const maxField = keys.length ? Math.max(...keys) : 0;
    if (maxField >= 19) return 'v3 (anchor)';
    if (maxField === 18) return 'v2 (room)';
    if (maxField >= 17) return 'v1 (standard)';
    if (maxField <= 14) return 'vLite (basic)';
    return 'unknown';
}

export interface PublicMapped {
    _version: string;
    cmd: number;
    token: string;
    codeId: number;
    lobbyId: number;
    gameNo: string;
    tableId: number;
    seat: number;
    mid: string;
    dList: any[];
    type: number;
    userName: string;
    list: string[];
    mids: any[];
    object: string;
    virtual: any[];
    lobbyPush: any[];
    table: any[];
    room?: any;
    anchor?: any;
}

export function mapPublicBean(raw: any): PublicMapped {
    const ver = detectVersion(raw);
    const o: PublicMapped = {
        _version: ver,
        cmd: raw[1] ?? 0,
        token: asString(raw[2]),
        codeId: raw[3] ?? 0,
        lobbyId: raw[4] ?? 0,
        gameNo: asString(raw[5]),
        tableId: raw[6] ?? 0,
        seat: raw[7] ?? 0,
        mid: asString(raw[8] ?? '0'),
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
    if (raw[18]) (o as any).room = raw[18];
    if (raw[19]) (o as any).anchor = raw[19];
    return o;
}

/** PublicBean 的 protobuf 定义（和原来一样） */

export const PublicBean = new protobuf.Type('PublicBean')
    .add(new protobuf.Field('cmd', 1, 'int32'))
    .add(new protobuf.Field('token', 2, 'string'))
    .add(new protobuf.Field('codeId', 3, 'int32'))
    .add(new protobuf.Field('lobbyId', 4, 'int32'))
    .add(new protobuf.Field('gameNo', 5, 'string'))
    .add(new protobuf.Field('tableId', 6, 'int32'))
    .add(new protobuf.Field('seat', 7, 'int32'))
    .add(new protobuf.Field('mid', 8, 'int64'))
    .add(new protobuf.Field('dList', 9, 'double', 'repeated'))
    .add(new protobuf.Field('type', 10, 'int32'))
    .add(new protobuf.Field('userName', 11, 'string'))
    .add(new protobuf.Field('list', 12, 'string', 'repeated'))
    .add(new protobuf.Field('mids', 13, 'int64', 'repeated'))
    .add(new protobuf.Field('object', 14, 'string'));

/** pushState -> UI 展示结构 */

export interface CountdownInfo {
    base: number;
    lastUpdate: number;
    active: boolean;
}

export interface PushState {
    list: any[];
    table: any[];
    tableStateById: Record<number, any>;
    roadsByTableId: Record<number, any>;
    playersByTableId: Record<number, any>;
    betAreaByTableId: Record<number, any>;
    statsByTableId: Record<number, any>;
    chatByTableId: Record<number, any>;
    eventsByTableId: Record<number, any>;
    betResultByTableId: Record<number, any>;
    richList: any[];
    openCardByTableId: Record<number, any>;
    countdownByTableId: Record<number, CountdownInfo>;
}

export interface UiTableInfo {
    stampTime: number;
    dealerDomain: number;
    gameHall: number;
    gameCode: number;
    tableID: number;
    tableName: string;
    gameNo: number;
    gameShoe: number;
    gameRound: number;
    shuffle: number;
    maintenance: number;
    dealerID: string;
    dealerImage: string;
    supportWeb: number;
    newGame: number;
    roads: string[];
}

export interface UiDealerEvent {
    dealerId: string;
    deliverTime: number;
    eventType: string;
    tableID: number;
    gameRound: number;
    gameShoe: number;
    iTime: number;
    roundStartTime: number;
    shuffle: number;
    timestamp: number;

    // 新增，给 AIA 用的原始倒计时参数
    countdownBase?: number;       // 下注总秒数
    countdownLastUpdate?: number; // 当时的本地时间戳(ms)
}

export interface UiRoadInfo {
    repaintTime: number;
    tableID: number;
    gameShoe: number;
    gameRound: number;
    winCounts: [number, number, number];
    goodRoadType: number;
    goodRoadCount: number;
    prevGoodRoadJson: any[];
    currGoodRoadJson: any[];
    bigRoads: any[];
}

export interface UiBetInfo {
    betCount: number;
    currentBet: number;
}

export interface UiTable {
    tableInfo: UiTableInfo;
    dealerEvent: UiDealerEvent;
    roadInfo: UiRoadInfo;
    betInfo: UiBetInfo;
}

/** 根据 pushState 拼一个桌面 UI 结构 */
export function buildUiTableData(
    tableId: number,
    ps: PushState,
): UiTable | null {
    tableId = Number(tableId) || 0;
    if (!tableId) return null;

    const allTables = Array.isArray(ps.table) ? ps.table : [];
    const summary = allTables.find(
        (t: any) => Number(t.tableId || t.tableID) === tableId,
    );
    if (!summary) return null;

    const state1002 = ps.tableStateById[tableId] || {};
    const roads1004 = ps.roadsByTableId[tableId] || summary.roads || {};
    const bet208 = ps.betAreaByTableId[tableId] || {};

    const betInfo: UiBetInfo = {
        betCount: bet208.betCount || summary.onlineCount || 0,
        currentBet: bet208.totalAmount || summary.totalAmount || 0,
    };

    const gameShoe = Number(state1002.shoeId || summary.shoeId || 0);
    const gameRound = Number(state1002.playId || summary.playId || 0);

    // countdown
    let cdRemain = 0;
    const cdInfo = ps.countdownByTableId[tableId];
    if (cdInfo && cdInfo.active) {
        const elapsed = Math.floor((Date.now() - cdInfo.lastUpdate) / 1000);
        cdRemain = Math.max(cdInfo.base - elapsed, 0);
    }

    const tableInfo: UiTableInfo = {
        stampTime: Date.now(),
        dealerDomain: 1,
        gameHall: 0,
        gameCode: summary.gameId || 0,
        tableID: tableId,
        tableName: summary.tableName || '',
        gameNo: summary.gameNo || '',
        gameShoe,
        gameRound,
        shuffle: 0,
        maintenance: 0,
        dealerID: summary.dealer
            ? `${summary.dealer.name || ''}/-/${summary.dealer.id || ''}`
            : '',
        dealerImage: summary.dealer ? summary.dealer.photo || '' : '',
        supportWeb: 1,
        newGame: 0,
        roads: roads1004,
    };

    const dealerEvent: UiDealerEvent = {
        dealerId: tableInfo.dealerID,
        deliverTime: cdInfo?.lastUpdate || Date.now(),
        eventType:
            state1002.state === 1
                ? 'GP_BETTING'
                : state1002.state === 2
                    ? 'GP_DEALING'
                    : state1002.state === 5
                        ? 'GP_SETTLEMENT'
                        : 'GP_NEW_GAME_START',
        tableID: tableId,
        gameRound,
        gameShoe,
        iTime: cdRemain,
        roundStartTime: cdInfo?.lastUpdate || Date.now(),
        shuffle: 0,
        timestamp: Date.now(),
        // 新增，给 AIA 用的原始倒计时参数
        countdownBase: cdInfo?.base || 0,
        countdownLastUpdate: cdInfo?.lastUpdate || 0,
    };

    const roadInfo: UiRoadInfo = {
        repaintTime: Date.now(),
        tableID: tableId,
        gameShoe,
        gameRound,
        winCounts: (roads1004.winCounts as [number, number, number]) || [0, 0, 0],
        goodRoadType: roads1004.goodRoadType || 0,
        goodRoadCount: roads1004.goodRoadCount || 0,
        prevGoodRoadJson: roads1004.prevGoodRoadJson || [],
        currGoodRoadJson: roads1004.currGoodRoadJson || [],
        bigRoads: roads1004.bigRoads || [],
    };

    return { tableInfo, dealerEvent, roadInfo, betInfo };
}
