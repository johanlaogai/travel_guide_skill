# 架构

## 一句话

`trip.json` 是唯一事实源；Node CLI 做校验、数据融合和渲染；`index.html` 是构建产物，构建后行程数据不联网，只有底图瓦片会请求第三方。

```
用户/agent
  │  init / 编辑 trip.json
  ▼
trip.json ──enrich──► providers ──► sources[] + days[].weather + discoveries[]
  │                         │
  │                         ├─ Open-Meteo
  │                         ├─ Nominatim
  │                         ├─ Overpass
  │                         ├─ Wikimedia
  │                         ├─ Frankfurter / Nager
  │                         └─ TikHub（可选，付费）
  ▼
 check ──► errors/warnings
  │
  ▼
 build ──► index.html / itinerary.md / sources.md / trip.ics / build-receipt.json
```

## 模块

| 路径 | 职责 |
|---|---|
| `bin/travel-guide.mjs` | 入口，错误码 |
| `src/cli.mjs` | 命令表/动态加载 |
| `src/commands/*` | init/dates/enrich/import/check/build/expenses/doctor/demo |
| `src/core/dates.mjs` | 日期、星期、时区、时长 |
| `src/core/money.mjs` | 整数分、预算区间、等分、最少转账 |
| `src/core/provenance.mjs` | provider/confidence/source 模型与覆盖率 |
| `src/core/validate.mjs` | 硬规则 + strict 升级 + PII |
| `src/core/cache.mjs` | TTL/offline/refresh |
| `src/core/rate-limit.mjs` | 单连接/最小间隔 |
| `src/core/http.mjs` | fetch、UA、重试、curl 代理 |
| `src/core/redact.mjs` | PII 扫描/公开版脱敏 |
| `src/core/atomic.mjs` | 文件/目录原子替换 |
| `src/data/providers/*` | 各数据源适配器 |
| `src/data/enrich.mjs` | 地理编码→天气→POI→Wiki→汇率/假期 |
| `src/render/html.mjs` | 单文件 HTML |
| `src/render/map.mjs` | Leaflet 地图壳、点收集、无坐标回退 |
| `src/render/ics.mjs` | UTC VEVENT |
| `src/render/markdown.mjs` | Markdown/来源台账 |
| `src/render/sources.mjs` | 卡片内来源链接/归属/转义 |
| `src/render/assets.mjs` | 读取并内联 CSS/Leaflet/客户端脚本 |
| `src/render/assets/timeline.js` | 编辑后客户端重渲染时间线 |
| `src/render/assets/map.js` | Leaflet 初始化、底图切换、筛选、focusItem |
| `src/render/assets/editor.js` | 编辑 dialog、草稿、导出/恢复 |
| `src/render/assets/app.js` | 筛选/地图联动/主题/外链回退/清单/ICS |

## 来源模型

```json
{
  "id": "src-<hash>",
  "provider": "open-meteo | nominatim | overpass | wikimedia | official | frankfurter | nager | tikhub | manual",
  "kind": "weather | geocode | poi | wiki | official | ugc | fx | holiday | note",
  "title": "...",
  "url": "https://... 或 manual://...",
  "retrievedAt": "ISO",
  "transport": "live | cache | snapshot | manual",
  "license": "...",
  "confidence": "official | verified | forecast | community | estimate | unverified",
  "rawHash": "..."
}
```

- `id` 由 `provider/kind/url|title/rawHash` 稳定生成，**不含 retrievedAt**；重复 enrich 不会产生新 id。
- `sourceIds` 必须解析到 `sources[]`；否则 `check` 失败。
- `provider: model` 被禁止。
- `transport` 让读者知道数据是实时、缓存、快照还是手工。

## 校验

`validateTrip(trip, {strict, allowUnverified, publicMode, now})`：

**硬错误**

- schemaVersion、meta、日期、天数、人数、币种；
- 来源格式/重复/引用；
- 一天 >3 锚点；
- 锚点/餐饮无来源；
- 锚点无坐标；
- 非首项缺 `transit`；
- 16 天内缺天气来源；
- `booking.required` 无官方来源且无 URL；
- `openingHours`/`ticketPrice` 非官方来源；
- 预算 min>max。

**提醒；strict 可升级**

- 无来源、无饭点、只有 URL 没有官方来源、未核实项、预算不一致、public PII。

## 渲染

- HTML 内联 CSS/JS 和 Leaflet 1.9.4（BSD-2-Clause），无外部脚本；
- CSP：`default-src 'none'; connect-src 'none'; img-src data: https:`；只允许地图瓦片作为图片加载；
- `trip` JSON 内嵌到 `<script type="application/json">`，`<` 转义；编辑草稿存 `localStorage`，不上传；
- ICS 内嵌到 `<script type="text/plain">`，下载用 Blob；
- 地图默认 Esri World Street Map（WGS84）；高德底图在客户端做 WGS84→GCJ-02；OSM 可选；瓦片失败或无坐标时显示地址列表；
- 来源链接放在行程卡片内：官方/天气为 `data-external` 超链接，手工整理项显示不可点“行程整理”；不再渲染来源覆盖统计、来源表或来源筛选；
- 外链统一事件委托：`window.open` 被拦截时回退 `location.href`；“地图定位”调用 Leaflet `focusItem`；
- 编辑模式支持修改/新增/删除/上移/下移和改当天标题；新增项自动补 `src-editor-manual` 来源；导出 `trip.json`，恢复初始删除草稿并刷新；
- 所有用户数据 `escapeHtml`/`escapeAttr`；链接只允许 http(s)。

## 构建

`build` 先校验；失败返回 1。成功时：

1. `replaceDirAtomic(out, populate)`：临时目录写全部文件，成功后替换；
2. 写 `index.html`、`itinerary.md`、`sources.md`、`trip.ics`、`build-receipt.json`；
3. 回执含输入/输出 SHA-256、来源覆盖率、warnings；
4. `--public` 先 `publicTrip()` 脱敏，再渲染。

## 测试

- `node --test`，不访问实时网络；
- provider 用本地 fixture HTTP server + 环境变量 base；
- 覆盖：日期/时区、金额/分账、来源稳定性、校验硬规则、HTML 关键标记、ICS、公开脱敏、缓存/限速、CLI 构建。
