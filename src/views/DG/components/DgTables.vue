<template>
  <section>
    <h3>桌台展示（使用真实数据）</h3>
    <p class="muted">
      WS 收到 43/1002/1004 等消息后，Pinia 中的 uiTables 会更新。
    </p>

    <div id="dg-table-container">
      <div
        v-for="t in tables"
        :key="t.tableInfo.tableID"
        class="table-card"
      >
        <!-- header -->
        <div class="header">
          <div class="header-left">
            <span class="game-tag">Baccarat</span>
            <span class="table-name">Baccarat {{ t.tableInfo.tableName }}</span>
            <span style="font-size:11px;color:#9ca3af;">
              ID: {{ t.tableInfo.tableID }}
            </span>
          </div>
          <div class="header-right">
            <span>
              <strong>Shoe</strong>
              <span>{{ t.tableInfo.gameShoe }}</span>
            </span>
            <span>
              <strong>Round</strong>
              <span>{{ t.tableInfo.gameRound }}</span>
            </span>
            <span>
              <strong>CD</strong>
              <span>{{ t.dealerEvent.iTime }}</span>
            </span>
          </div>
        </div>

        <!-- road -->
        <div class="road">
          <div class="road-title">
            <span>大路</span>
            <div class="road-stats">
              <span>
                <span class="dot-b"></span>B:
                <span>{{ t.roadInfo.winCounts[0] }}</span>
              </span>
              <span>
                <span class="dot-p"></span>P:
                <span>{{ t.roadInfo.winCounts[1] }}</span>
              </span>
              <span>
                <span class="dot-t"></span>T:
                <span>{{ t.roadInfo.winCounts[2] }}</span>
              </span>
            </div>
          </div>

          <div class="road-grid" :style="gridStyle(t)">
            <template v-if="getRoadGrid(t).length">
              <div
                v-for="(cell, idx) in getRoadGrid(t)"
                :key="idx"
                class="road-cell"
                :class="[
                  cell.type,
                  { pair: cell.pair, empty: cell.type === 'empty' }
                ]"
              >
                {{ cell.char }}
              </div>
            </template>
            <template v-else>
              暂无路纸数据
            </template>
          </div>
        </div>

        <!-- dealer -->
        <div class="dealer">
          <div class="dealer-img-wrap">
            <img
              class="dealer-img"
              :src="dealerImg(t)"
            />
          </div>
          <div class="dealer-name">
            {{ dealerName(t) }}
          </div>
          <div>
            <span
              class="status-pill"
              :class="statusClass(t)"
            >
              {{ statusText(t) }}
            </span>
          </div>
        </div>

        <!-- footer -->
        <div class="footer">
          <div class="footer-left">
            <span>
              <strong>总投注</strong>
              <span>{{ t.betInfo.currentBet.toFixed(1) }}</span>
            </span>
            <span>
              <strong>下注人数</strong>
              <span>{{ t.betInfo.betCount }}</span>
            </span>
          </div>
          <button class="enter-btn">Enter</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { UiTable } from '@/utils/dgProto';
import { useDgWsStore, resolveStatus } from '@/stores/dgWs';

defineProps<{
  tables: UiTable[];
}>();

const wsStore = useDgWsStore();

/** 计算大路网格宽高 */
const maxX = (t: UiTable) =>
  (t.roadInfo.bigRoads || []).reduce(
    (m: number, r: any) => Math.max(m, r.showX),
    0,
  );

const maxY = (t: UiTable) =>
  (t.roadInfo.bigRoads || []).reduce(
    (m: number, r: any) => Math.max(m, r.showY),
    0,
  );

/** grid 容器样式 */
const gridStyle = (t: UiTable) => {
  const cols = maxX(t) + 1;
  const rows = maxY(t) + 1;
  return {
    display: 'grid',
    gap: '2px',
    gridTemplateColumns: `repeat(${cols || 1}, 1fr)`,
    gridTemplateRows: `repeat(${rows || 1}, 1fr)`,
  };
};

type RoadType = 'b' | 'p' | 't' | 'empty';

interface RoadCell {
  char: string;
  type: RoadType;
  pair: boolean;
}

/** 映射 roadCode -> 显示字符 / 颜色类型 */
const mapRoadCode = (roadCode: number): RoadCell => {
  switch (roadCode) {
    case 1:
    case 6:
      return { char: 'B', type: 'b', pair: roadCode === 6 };
    case 2:
    case 8:
      return { char: 'P', type: 'p', pair: roadCode === 8 };
    case 9:
    case 10:
      return { char: 'T', type: 't', pair: roadCode === 10 };
    default:
      return { char: '', type: 'empty', pair: false };
  }
};

/** 把 bigRoads 转成一个一维数组，用于 v-for 渲染 */
const getRoadGrid = (t: UiTable): RoadCell[] => {
  const bigRoads = t.roadInfo.bigRoads || [];
  if (!bigRoads.length) return [];

  const cols = maxX(t) + 1;
  const rows = maxY(t) + 1;
  const total = cols * rows;

  const grid: RoadCell[] = Array.from({ length: total }, () => ({
    char: '',
    type: 'empty',
    pair: false,
  }));

  bigRoads.forEach((item: any) => {
    const { showX, showY, road } = item;
    const idx = showY * cols + showX;
    if (idx < 0 || idx >= total) return;
    grid[idx] = mapRoadCode(road);
  });

  return grid;
};

/** 其他显示辅助函数 */
const dealerImg = (t: UiTable) =>
  wsStore.dealerImageUrl(t.tableInfo.dealerImage || '');

const dealerName = (t: UiTable) =>
  (t.tableInfo.dealerID || '').split('/')[0] || t.tableInfo.dealerID || '';

const statusText = (t: UiTable) =>
  resolveStatus(t.tableInfo, t.dealerEvent).text;

const statusClass = (t: UiTable) =>
  resolveStatus(t.tableInfo, t.dealerEvent).className;
</script>

<style scoped>
.muted {
  font-size: 12px;
  color: #8b949e;
}

#dg-table-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.table-card {
  flex: 0 0 calc(33.333% - 16px);
  max-width: 520px;
  min-width: 320px;
  background: #1b222c;
  border-radius: 10px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  display: grid;
  grid-template-columns: 3fr 1.2fr;
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    'header header'
    'road dealer'
    'footer footer';
  margin-top: 10px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.table-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.7);
}

.header {
  grid-area: header;
  background: #2b3544;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.game-tag {
  padding: 2px 6px;
  border-radius: 4px;
  background: #9b59b6;
  font-size: 11px;
}

.table-name {
  font-weight: 600;
  font-size: 14px;
}

.header-right {
  display: flex;
  gap: 12px;
  font-size: 12px;
  opacity: 0.9;
}

.header-right span strong {
  color: #ffd166;
  margin-right: 2px;
}

.road {
  grid-area: road;
  padding: 8px;
  background: #11161f;
}

.road-title {
  font-size: 12px;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #9ca3af;
}

.road-stats {
  font-size: 11px;
  display: flex;
  gap: 8px;
}

.road-stats span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.dot-b,
.dot-p,
.dot-t {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-b {
  background: #e74c3c;
}

.dot-p {
  background: #3498db;
}

.dot-t {
  background: #2ecc71;
}

.road-grid {
  margin-top: 4px;
  background: #05070b;
  border-radius: 4px;
  padding: 4px;
  display: grid;
  gap: 2px;
}

.road-cell {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(148, 163, 184, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  box-sizing: border-box;
}

.road-cell.empty {
  border: 1px solid rgba(55, 65, 81, 0.5);
  background: transparent;
}

.road-cell.b {
  background: #e74c3c;
  border-color: #c0392b;
}

.road-cell.p {
  background: #3498db;
  border-color: #2980b9;
}

.road-cell.t {
  background: #2ecc71;
  border-color: #27ae60;
}

.road-cell.pair::after {
  content: '•';
  font-size: 12px;
  color: #f1c40f;
}

.dealer {
  grid-area: dealer;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  background: #0f1722;
  border-left: 1px solid #374151;
}

.dealer-img-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.dealer-img {
  width: 96px;
  height: 126px;
  border-radius: 6px;
  object-fit: cover;
  background: #111827;
  border: 1px solid #4b5563;
}

.dealer-name {
  font-size: 12px;
  margin-bottom: 4px;
  text-align: center;
}

.status-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: #1e3a8a;
  color: #bfdbfe;
}

.status-pill--shuffle {
  background: #92400e;
  color: #fed7aa;
}

.status-pill--maintenance {
  background: #7f1d1d;
  color: #fecaca;
}

.footer {
  grid-area: footer;
  background: #11161f;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  border-top: 1px solid #1f2933;
}

.footer-left {
  display: flex;
  gap: 12px;
}

.footer-left span strong {
  margin-right: 4px;
  color: #fbbf24;
}

.enter-btn {
  padding: 4px 12px;
  border-radius: 16px;
  border: none;
  background: #22c55e;
  color: #052e16;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}

.enter-btn:hover {
  background: #16a34a;
}
</style>
