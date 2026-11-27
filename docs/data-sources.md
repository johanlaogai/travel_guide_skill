# 数据源与合规

> 目标不是“查得到”，而是“查到的每一条都能解释它从哪来、什么时候查的、可信到什么程度”。

## 1. 来源分层

```
官方页面/官方公众号
  > 权威开放数据（Open-Meteo / Wikimedia / Frankfurter / Nager）
  > OSM（Nominatim / Overpass）
  > UGC（小红书/公众号/点评）
  > 模型常识（禁止作为来源）
```

`provider: model` 在 `makeSource()` 里直接抛错。模型可以提出假设、写路线草案，但不能生成一条 `source` 来“证明”营业时间。

## 2. Open-Meteo

### 用途

- 目的地地理编码（城市级）；
- 16 天内逐日天气预报；
- 超出 16 天的历史气候估算（只写“气候”，不写“当天预报”）。

### 端点

```
GET https://geocoding-api.open-meteo.com/v1/search
  ?name=Guangzhou&count=5&language=zh&format=json&countryCode=CN

GET https://api.open-meteo.com/v1/forecast
  ?latitude=23.1291&longitude=113.2644
  &daily=weather_code,temperature_2m_max,temperature_2m_min,
         precipitation_probability_max,precipitation_sum,sunrise,sunset
  &timezone=auto&start_date=2026-11-28&end_date=2026-11-30

GET https://archive-api.open-meteo.com/v1/archive
  ?latitude=...&longitude=...&start_date=...&end_date=...
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum
  &timezone=auto
```

环境变量可覆盖 base：`TRAVEL_GUIDE_OPEN_METEO_BASE`、`TRAVEL_GUIDE_OPEN_METEO_GEOCODE_BASE`、`TRAVEL_GUIDE_OPEN_METEO_ARCHIVE_BASE`。

### 规则

- Forecast API 最多 16 天；不要把 16 天外的结果标成“预报”。
- 免费非商业额度：约 600 次/分、5,000/小时、10,000/天、300,000/月；批量请求应合并经纬度/日期。
- 数据许可 CC BY 4.0；HTML footer 必须显示 **“Weather data by Open-Meteo.com”** 并链接 <https://open-meteo.com/>。
- 商业使用需按 Open-Meteo 条款付费；本项目不代付。
- 缓存 TTL：预报 1 小时；历史/气候 24 小时；地理编码 30 天。

### 失败时

天气失败不阻断整条行程：写入 warning，HTML 显示“天气待补”，不要编温度。离线模式只读缓存；无缓存就明确告诉用户。

## 3. Nominatim

### 用途

- 地点名 → 坐标/地址；
- 坐标 → 地址（reverse）；
- 已有 OSM ID → 详情（lookup）。

### 端点

```
GET https://nominatim.openstreetmap.org/search
  ?q=陈家祠%20广州&format=jsonv2&addressdetails=1&extratags=1
  &namedetails=1&limit=5&accept-language=zh-CN&countrycodes=cn

GET https://nominatim.openstreetmap.org/reverse
  ?lat=23.1291&lon=113.2445&format=jsonv2&addressdetails=1

GET https://nominatim.openstreetmap.org/lookup
  ?osm_ids=W123,R456&format=jsonv2
```

环境变量：`TRAVEL_GUIDE_NOMINATIM_BASE`。

### 使用政策（必须遵守）

官方：<https://operations.osmfoundation.org/policies/nominatim/>

- 最多 **1 请求/秒**；脚本必须单线程；长期脚本建议 ≤4 请求/分钟。
- 必须提供有效 `User-Agent` 或 `Referer`，能识别应用和联系方式。
- 必须缓存结果；重复查询不要重复打。
- 禁止自动补全、网格化 reverse、批量地理编码、下载某区域全部 POI。
- 必须显示 OpenStreetMap/ODbL 归属。
- 不得把 Nominatim 当实时导航/紧急服务。
- 若把本工具用于 LLM/agent，必须显著链接该政策并说明限制；生成的代码也必须遵守。

本项目：`RateLimiter` 默认 1100ms；结果缓存 30 天；UA 为
`travel-guide-skill/0.1 (+https://github.com/johanlaogai/travel_guide_skill)`；不做自动补全。

## 4. Overpass

### 用途

- 目的地周边小半径的景点/博物馆/公园/餐厅候选；
- 只作为“发现候选”，不是官方营业信息。

### 端点

```
POST https://overpass-api.de/api/interpreter
Content-Type: application/x-www-form-urlencoded

data=[out:json][timeout:25];
(
  nwr["tourism"~"attraction|museum|viewpoint"](around:3000,23.1291,113.2644);
  nwr["historic"](around:3000,23.1291,113.2644);
  nwr["amenity"~"restaurant|cafe"](around:3000,23.1291,113.2644);
);
out center tags 60;
```

环境变量：`TRAVEL_GUIDE_OVERPASS_BASE`。

### 使用政策（必须遵守）

官方页：<https://overpass-api.de/>；条款：<https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/>

- 脚本同时只保留 **1 条下载连接**（全局最多 2 条）。
- 有效 UA/Referer；禁止批量下载/高流量；结果必须缓存。
- 小范围、限定 tag、限定数量；不要拉整座城市。
- 显示 “Data © OpenStreetMap contributors (ODbL)” 并提供 <https://www.openstreetmap.org/fixthemap>。
- 服务无可用性保证；失败要降级，不要重试风暴。

本项目：模块级 `Mutex`；`out center tags N`；缓存 7 天；只取候选，不把 OSM `opening_hours` 当官方。

## 5. Wikimedia

### 用途

- 目的地/景点背景（Wikipedia/Wikivoyage）；
- 坐标、官网、图片（Wikidata/Commons）；
- 给 HTML 提供“为什么值得去”的公开背景，而不是 UGC 软文。

### 端点

```
GET https://zh.wikipedia.org/w/api.php
  ?action=query&prop=extracts|coordinates|pageimages|pageprops
  &titles=广州&format=json&formatversion=2&redirects=1
  &exintro=1&explaintext=1&maxlag=5

GET https://zh.wikipedia.org/w/api.php
  ?action=query&list=geosearch&gscoord=23.1291|113.2644
  &gsradius=10000&gslimit=50&format=json&formatversion=2&maxlag=5

GET https://www.wikidata.org/w/api.php
  ?action=wbsearchentities&search=广州塔&language=zh
  &format=json&formatversion=2&maxlag=5
```

同样可换 `zh.wikivoyage.org`、`commons.wikimedia.org`；base 可用
`TRAVEL_GUIDE_WIKIPEDIA_BASE`、`TRAVEL_GUIDE_WIKIVOYAGE_BASE`、
`TRAVEL_GUIDE_WIKIDATA_BASE`、`TRAVEL_GUIDE_COMMONS_BASE` 覆盖。

### 规则

- 描述性 UA；串行；`maxlag=5`；`format=json&formatversion=2`。
- 文本 CC BY-SA 4.0；图片注意 Commons 单文件许可；HTML 只放短摘要/缩略图并归属。
- 不把维基当营业时间/票价的官方来源；这些仍需 `official`。
- 缓存 30 天。

## 6. 官方页面

### 用途

- 开放时间、最后入场、闭馆日、预约入口、票价、免费日；
- 交通首末班、机场/车站信息；
- 签证/入境/天气预警/大型活动。

### 规则

- 单页核验，不批量抓取；遵守 robots/条款。
- 只记录事实摘要 + URL + `retrievedAt`，不复制长文/图片。
- 页面打不开/只有二手转载：标 `unverified`，不要用记忆补。
- `openingHours`/`ticketPrice` 只有在 `sourceIds` 里存在 `provider: official & confidence: official` 时才允许通过 `check`。

## 7. Frankfurter / Nager

- Frankfurter：<https://api.frankfurter.dev/v1/latest?base=CNY&symbols=USD,JPY,EUR>，ECB 参考汇率；缓存 12 小时；只用于预算换算，不做交易。
- Nager.Date：<https://date.nager.at/api/v3/PublicHolidays/2026/CN>，公共假期；缓存 30 天；用于拼假/闭馆提醒，具体景区闭馆仍看官方。

## 8. 缓存、离线与限速

| 数据 | TTL | 说明 |
|---|---:|---|
| 天气预报 | 1h | 当天可能变化 |
| 历史/气候 | 24h | 只做估算 |
| 地理编码 | 30d | Nominatim 要求缓存 |
| Overpass POI | 7d | 候选会变 |
| Wikimedia | 30d | 背景稳定 |
| Frankfurter | 12h | 汇率 |
| Nager | 30d | 假期稳定 |
| TikHub | 7d | 付费，避免重复扣费 |

- 缓存目录：`.travel-guide-cache/`（已 gitignore）。
- `--offline`：只读缓存，不发起请求；缺缓存就报错/降级。
- `--refresh`：绕过 TTL 重新拉取。
- `TRAVEL_GUIDE_PROXY`/`HTTPS_PROXY`：通过 `curl` 子进程走代理（零 npm 依赖）；不打印代理凭证。

## 8.5 底图瓦片（查看 HTML 时）

地图不是数据事实源，只是展示层；Leaflet 1.9.4 已内联，瓦片由浏览器在查看时请求。

| 底图 | URL 模板 | 坐标 | 归属 | 说明 |
| --- | --- | --- | --- | --- |
| Esri World Street Map（默认） | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}` | WGS84 | “Tiles © Esri” | 无需 key；本机实测可达 |
| 高德中文 | `https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}` | GCJ-02 | “© 高德地图” | 需把 WGS84 点转 GCJ-02；非官方 key，仅底图展示 |
| OpenStreetMap | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | WGS84 | “© OpenStreetMap contributors” | 遵守 OSM tile 使用政策；本机可能不可达 |

- 瓦片请求不受 `connect-src 'none'` 限制，因为 `<img>` 走 `img-src`；CSP 仍阻止 `fetch`/XHR。
- 瓦片失败时 Leaflet 显示提示；无坐标或无瓦片时回退到地址列表。
- 需要在 Esri/高德/OSM 之间切换时，HTML 右上角底图选择器会写入 `localStorage`。
- 公开分享前确认底图供应商条款；底图不是 OpenStreetMap 数据，不要混淆归属。

## 9. 归属清单

HTML footer 与 `sources.md` 会自动带：

- Weather data by Open-Meteo.com（CC BY 4.0）
- © OpenStreetMap contributors（ODbL）+ fixthemap
- Wikimedia（CC BY-SA 4.0）
- Frankfurter / Nager.Date
- 官方页面：标题 + 链接 + 访问时间
- TikHub（如使用）：第三方 API；平台条款/版权/隐私由使用者承担

## 10. 不要做的事

- 不要用模型记忆补营业时间/票价；
- 不要把 OSM `opening_hours` 标成官方；
- 不要批量抓取/绕过登录/反爬；
- 不要用 Nominatim 做自动补全；
- 不要把 UGC 的“必去/排队 2 小时”当事实；
- 不要在 HTML 里嵌入 Key、订单号、个人电话；
- 不要把示例快照当实时预报。
