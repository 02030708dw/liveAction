import protobuf from 'protobufjs';

export const BASE = 'https://phpclienta.nakiph.xyz';
export const LS_AUTH = 'nakiph_auth';
export const LS_WSKEY = 'nakiph_wskey';
export const LS_GAME_TOKEN = 'nakiph_gameToken';

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
	poker?: any;
}

export class Reader {
	buf: Uint8Array;
	pos = 0;
	len: number;            // ⭐ 新增

	constructor(buf: Uint8Array) {
		this.buf = buf;
		this.len = buf.length;  // ⭐ 新增
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
		// 简化成 number / string 都行，下面会转成字符串
		return this.uint32();
	}
	uint64() {
		// 简单实现：协议里这些 64 位字段数值不会太离谱，直接当作 uint32 用
		return this.uint32();
	}
	bool() {
		return this.uint32() !== 0;
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
// ====== VM86 风格 PublicBean 解码 ======

export interface Vm86PublicBean {
	cmd?: number;
	token?: string;
	codeId?: number;
	lobbyId?: number;
	gameNo?: string;
	tableId?: number;
	seat?: number;
	mid?: number | string;
	dList?: number[];
	type?: number;
	userName?: string;
	list?: string[];
	mids?: (number | string)[];
	object?: string;
	virtual?: any[];
	lobbyPush?: any[];
	table?: Vm74Table[];
	room?: any;
	anchor?: any;
}

export function decodeVm86PublicBean(r: Reader, l?: number): Vm86PublicBean {
	if (!(r instanceof Reader)) r = new Reader(r as any);
	const c = l === undefined ? r.len : r.pos + l;
	const m: Vm86PublicBean = {
		dList: [],
		list: [],
		mids: [],
		virtual: [],
		lobbyPush: [],
		table: [],
	};

	while (r.pos < c) {
		const t = r.uint32();
		const id = t >>> 3;

		switch (id) {
			case 1:
				m.cmd = r.int32();
				break;
			case 2:
				m.token = r.string();
				break;
			case 3:
				m.codeId = r.int32();
				break;
			case 4:
				m.lobbyId = r.int32();
				break;
			case 5:
				m.gameNo = r.string();
				break;
			case 6:
				m.tableId = r.int32();
				break;
			case 7:
				m.seat = r.int32();
				break;
			case 8: {
				const mid = r.int64() as any;
				m.mid = typeof mid === 'object' ? String(mid) : mid;
				break;
			}
			case 9: {
				const arr = (m.dList ??= []);
				if ((t & 7) === 2) {
					const end = r.uint32() + r.pos;
					while (r.pos < end) arr.push(r.double());
				} else {
					arr.push(r.double());
				}
				break;
			}
			case 10:
				m.type = r.int32();
				break;
			case 11:
				m.userName = r.string();
				break;
			case 12:
				(m.list ??= []).push(r.string());
				break;
			case 13: {
				const arr = (m.mids ??= []);
				if ((t & 7) === 2) {
					const end = r.uint32() + r.pos;
					while (r.pos < end) arr.push(r.int64());
				} else {
					arr.push(r.int64());
				}
				break;
			}
			case 14:
				// ⭐ 这里还是原始字符串，不做 JSON.parse，你可以自己外面处理
				m.object = r.string();
				break;
			case 15: {
				// VM91: LobbyPush
				const len = r.uint32();
				(m.lobbyPush ??= []).push(decodeVm91LobbyPush(r, len));
				break;
			}
			case 16: {
				// VM61: Virtual
				const len = r.uint32();
				(m.virtual ??= []).push(decodeVm61Virtual(r, len));
				break;
			}
			case 17: {
				const len = r.uint32();
				(m.table ??= []).push(decodeVm74Table(r, len));
				break;
			}
			default:
				r.skipType(t & 7);
				break;
		}
	}

	if (m.cmd == null) {
		throw new Error("missing required 'cmd'");
	}
	return m;
}
export function mapVm86BeanToPublic(bean: Vm86PublicBean): PublicMapped {
	const o: PublicMapped = {
		_version: 'vm86',
		cmd: bean.cmd ?? 0,
		token: bean.token ?? '',
		codeId: bean.codeId ?? 0,
		lobbyId: bean.lobbyId ?? 0,
		gameNo: bean.gameNo ?? '',
		tableId: bean.tableId ?? 0,
		seat: bean.seat ?? 0,
		mid: bean.mid != null ? String(bean.mid) : '0',
		dList: bean.dList ?? [],
		type: bean.type ?? 0,
		userName: bean.userName ?? '',
		list: bean.list?.map(asString) ?? [],
		mids: bean.mids ?? [],
		object: bean.object ?? '',
		virtual: bean.virtual ?? [],
		lobbyPush: bean.lobbyPush ?? [],
		table: mapVm74Tables(bean.table),
	};

	if ((bean as any).room) (o as any).room = (bean as any).room;
	if ((bean as any).anchor) (o as any).anchor = (bean as any).anchor;

	return o;
}
// ====== VM74 风格的 Table 解码 ======

export interface Vm74Table {
	tableId?: number;
	shoeId?: number | string;
	playId?: number | string;
	state?: number;
	countDown?: number;
	result?: string;
	poker?: string;
	tel?: string[];
	ext?: string[];
	roads?: string[];
	gameNo?: string;
	fms?: string;
	tableName?: string;
	vipName?: string;
	totalAmount?: number;
	onlineCount?: number;
	dealer?: any;
	gameId?: number;
	anchor?: any;
}

export function decodeVm74Table(r: Reader, l: number): Vm74Table {
	const c = l === undefined ? r.len : r.pos + l;
	const m: Vm74Table = {
		tel: [],
		ext: [],
		roads: [],
	};

	while (r.pos < c) {
		const t = r.uint32();
		const id = t >>> 3;
		switch (id) {
			case 1:
				m.tableId = r.uint32();
				break;
			case 2:
				m.shoeId = r.int64();
				break;
			case 3:
				m.playId = r.int64();
				break;
			case 4:
				m.state = r.int32();
				break;
			case 5:
				m.countDown = r.int32();
				break;
			case 6:
				m.result = r.string();
				break;
			case 7:
				m.poker = r.string();
				break;
			case 8:
				(m.tel ??= []).push(r.string());
				break;
			case 9:
				(m.ext ??= []).push(r.string());
				break;
			case 10:
				(m.roads ??= []).push(r.string());
				break;
			case 11:
				// ⭐ 关键：gameNo 直接 string，不会再出现 [object Object]
				m.gameNo = r.string();
				break;
			case 12:
				m.fms = r.string();
				break;
			case 13:
				m.tableName = r.string();
				break;
			case 14:
				m.vipName = r.string();
				break;
			case 15:
				m.totalAmount = r.int32();
				break;
			case 16:
				m.onlineCount = r.int32();
				break;
			case 17: {
				// dealer 是个嵌套 message，这里用 parseMsg 粗解一下即可
				const len = r.uint32();
				const sub = new Reader(r.buf.subarray(r.pos, r.pos + len));
				r.pos += len;
				m.dealer = parseMsg(sub);
				break;
			}
			case 18:
				m.gameId = r.int32();
				break;
			case 19: {
				const len = r.uint32();
				const sub = new Reader(r.buf.subarray(r.pos, r.pos + len));
				r.pos += len;
				m.anchor = parseMsg(sub);
				break;
			}
			default:
				r.skipType(t & 7);
				break;
		}
	}

	return m;
}
function mapVm74Tables(list: Vm74Table[] | undefined): any[] {
	if (!Array.isArray(list)) return [];
	return list.map((t) => ({
		tableId: t.tableId ?? 0,
		shoeId: asString(t.shoeId),
		playId: asString(t.playId),
		state: t.state ?? 0,
		countDown: t.countDown ?? 0,
		result: asString(t.result),
		poker: asString(t.poker),
		tel: Array.isArray(t.tel) ? t.tel.map(asString) : [],
		ext: Array.isArray(t.ext) ? t.ext.map(asString) : [],
		roads: Array.isArray(t.roads) ? t.roads.map(asString) : [],
		gameNo: asString(t.gameNo),
		fms: asString(t.fms),
		tableName: asString(t.tableName),
		vipName: asString(t.vipName),
		totalAmount: t.totalAmount ?? 0,
		onlineCount: t.onlineCount ?? 0,
		dealer: mapDealer(t.dealer),
		gameId: t.gameId ?? 0,
		anchor: t.anchor ?? null,
	}));
}

// ====== VM61: Virtual 解码 ======

export interface Vm61Virtual {
	seatId?: number;
	userName?: string;
	deviceType?: number;
	list?: string[];
	// 其它字段先不关心，将来需要再补
}

export function decodeVm61Virtual(r: Reader, l: number): Vm61Virtual {
	const c = l === undefined ? r.len : r.pos + l;
	const m: Vm61Virtual = {
		list: [],
	};

	while (r.pos < c) {
		const t = r.uint32();
		const id = t >>> 3;
		switch (id) {
			case 1:
				m.seatId = r.int32();
				break;
			case 2:
				m.userName = r.string();
				break;
			// 3~11 原来 JS 里被省略了，用默认分支 skipType 即可
			case 12:
				m.deviceType = r.uint32();
				break;
			case 13:
				(m.list ??= []).push(r.string());
				break;
			default:
				r.skipType(t & 7);
				break;
		}
	}

	return m;
}
// ====== VM91: LobbyPush 解码 ======

export interface Vm91LobbyPush {
	tableId?: number;
	onlineCount?: number | string;
	vipName?: string;
	seatFull?: boolean;
	// 3 号字段在原 JS 里被省略了，暂时不管
}

export function decodeVm91LobbyPush(r: Reader, l: number): Vm91LobbyPush {
	const c = l === undefined ? r.len : r.pos + l;
	const m: Vm91LobbyPush = {};

	while (r.pos < c) {
		const t = r.uint32();
		const id = t >>> 3;
		switch (id) {
			case 1:
				m.tableId = r.uint32();
				break;
			case 2: {
				const v = r.uint64() as any;
				m.onlineCount = typeof v === 'object' ? String(v) : v;
				break;
			}
			// case 3: 原文件中有，但内容被省略，这里直接走 default 跳过
			case 4:
				m.vipName = r.string();
				break;
			case 5:
				m.seatFull = r.bool();
				break;
			default:
				r.skipType(t & 7);
				break;
		}
	}

	return m;
}


/** 工具 */
export const asString = (v: any): string => {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'object') return '';
	return String(v);
};

export function decodeDgMsgVm86(u8: Uint8Array): PublicMapped {
	const bean = decodeVm86PublicBean(new Reader(u8));
	return mapVm86BeanToPublic(bean);
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
	liveURL: string;
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

	//牌数据
	poker: string;
	//桌子状态
	state: number;
	gameNo: string;
	pokerGameNo: string;
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
	const poker1002 = ps.openCardByTableId[tableId] || {};
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
		liveURL: summary.liveURL || '',
	};

	const dealerEvent: UiDealerEvent = {
		dealerId: tableInfo.dealerID,
		deliverTime: cdInfo?.lastUpdate || Date.now(),
		gameNo: poker1002.gameNo,
		pokerGameNo: poker1002.pokerGameNo,
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
		//牌数据
		poker: poker1002.poker || '',
		state: state1002.state || 1,
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


// ======== Android 风格的用户名解析工具 =========

function asNonEmptyString(value: any): string | null {
	if (value === null || value === undefined) return null;
	const s = String(value).trim();
	return s.length ? s : null;
}

function decodeToObjectMap(src: any): Record<string, any> | null {
	if (!src) return null;
	if (typeof src === 'object') {
		return src as Record<string, any>;
	}
	if (typeof src === 'string' && src.trim()) {
		try {
			const parsed = JSON.parse(src);
			if (parsed && typeof parsed === 'object') {
				return parsed as Record<string, any>;
			}
		} catch {
			return null;
		}
	}
	return null;
}

function extractParsedVm(mapped: any): Record<string, any> | null {
	const parsed = mapped?.parsedVm86 ?? mapped?.parsed;
	if (parsed && typeof parsed === 'object') {
		return parsed as Record<string, any>;
	}
	return null;
}

function extractRawPayload(mapped: any): Record<string, any> | null {
	const raw = mapped?.rawPayload;
	if (raw && typeof raw === 'object') {
		return raw as Record<string, any>;
	}
	return null;
}

function extractUserNameFromObject(source: any): string | null {
	const obj = decodeToObjectMap(source);
	if (!obj) return null;

	// 先从 object.username / object.userName 里拿
	const direct = asNonEmptyString(obj.username ?? obj.userName);
	if (direct) return direct;

	// 再从 object.member.xxx 里拿
	const member = obj.member;
	if (member && typeof member === 'object') {
		const memberObj = member as Record<string, any>;
		const u1 = asNonEmptyString(memberObj.username ?? memberObj.userName);
		if (u1) return u1;
		const nick = asNonEmptyString(memberObj.nickname);
		if (nick) return nick;
	}

	return null;
}

/**
* 完整版用户名提取，等价 Android 的 _extractUserName
* 按顺序从：
*  - mapped.userName
*  - parsedVm.userName
*  - rawPayload.userName
*  - parsedVm.object / rawPayload.object / mapped.object 里各种 username / member.username / nickname
* 里找
*/
export function extractUserNameFromMapped(mapped: any): string | null {
	// 1) 直接字段
	const direct = asNonEmptyString(mapped?.userName);
	if (direct) return direct;

	// 2) parsedVm86 / parsed 里的 userName
	const parsedVm = extractParsedVm(mapped);
	const parsedUser = asNonEmptyString(parsedVm?.userName);
	if (parsedUser) return parsedUser;

	// 3) rawPayload 里的 userName
	const rawPayload = extractRawPayload(mapped);
	const rawUser = asNonEmptyString(rawPayload?.userName);
	if (rawUser) return rawUser;

	// 4) 各种 object 里挖
	const fromParsedObj = extractUserNameFromObject(parsedVm?.object);
	if (fromParsedObj) return fromParsedObj;

	const fromRawObj = extractUserNameFromObject(rawPayload?.object);
	if (fromRawObj) return fromRawObj;

	const fromDataObj = extractUserNameFromObject(mapped?.object);
	if (fromDataObj) return fromDataObj;

	return null;
}


export function extractPokerNums(poker: any): number[] {
	if (!poker) return [];
	try {
		const obj = typeof poker === 'string' ? JSON.parse(poker) : poker;

		const toNums = (v: any): number[] => {
			if (!v) return [];
			if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
			const s = String(v);
			return s
				.split(/[-,]/)
				.filter(Boolean)
				.map(Number)
				.filter(Number.isFinite);
		};

		const banker = toNums(obj?.banker);
		const player = toNums(obj?.player);
		return [...player, ...banker];
	} catch {
		// 兜底：抓所有数字
		const s = String(poker);
		const m = s.match(/\d+/g);
		return (m ?? []).map(Number).filter(Number.isFinite);
	}
}

export function isMeaningfulPoker(poker: any): boolean {
	const nums = extractPokerNums(poker);
	// 只要有一张 >0 就算有效（第三张可能为 0）
	return nums.some((n) => n > 0 && n !== 255);
}
