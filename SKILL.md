---
name: travel-guide
description: 规划、复刻、修订和交付可核验的旅行行程：从攻略链接/截图提取地点，按地理位置与交通排程，查天气/开放/预约/预算，输出单文件交互 HTML（真实地图、目的地手册、避坑清单、可编辑、清单、预算、ICS、卡片内来源链接）。Use when the user asks for a trip plan, itinerary, travel guide, 攻略复刻, 行程修订, 行前检查, or 旅游记账.
---

# Travel Guide

把「目的地 + 日期/天数 + 偏好」做成一份**可核验、可交互、可分享**的行程。主产物是单文件 `index.html`，不是一段无法追溯的聊天文字。

## 什么时候用

- 用户要旅行计划、行程、路线、攻略、几天怎么玩。
- 用户发来小红书/公众号攻略链接、截图、文字，要“照着排”。
- 用户要改已有行程、加/删地点、换天、带老人小孩、改预算。
- 用户要行前清单、预约提醒、天气/闭馆检查、旅行记账、多人分账。
- 用户要一个能发给同行人的 HTML/PDF/ICS。

不适用于：机票酒店门票下单、实时导航、签证代办、海外紧急救援。不要假装能做这些。

## 铁律：不瞎编

1. **模型不是来源。** 任何营业时间、票价、预约规则、闭馆日、交通班次，必须来自 `sources[]` 里的 URL/官方页面；不知道就写“以官方当日公告为准”，标 `unverified`，不要猜。
2. **官方优先。** 开放时间、票价、预约、闭馆只认 `official` 来源；OSM 的 `opening_hours` 只能算 `community`，不能当官方。
3. **UGC 只是灵感。** 小红书/公众号/点评里的“必去”“排队 2 小时”是社区信息，标 `community`；不能作为票价/预约依据。
4. **天气是预报。** Open-Meteo 16 天内才是预报，标 `forecast` 并写更新时间；超过 16 天只能写气候估算，不能写“当天天气”。
5. **每条都要能点开。** `item.sourceIds` 必须能解析到 `sources[]`；没有来源的锚点/餐饮/住宿/城际交通，`check` 会失败；buffer 必须 `derived: true` + `derivation`，不能假装有来源。
6. **不批量抓取。** Nominatim 1 请求/秒、Overpass 单连接、Wikimedia 串行；遵守缓存与 UA 要求。不要绕过登录/反爬。

## 标准流程

在 skill 目录下运行（命令中的 `travel-guide` 指 `node bin/travel-guide.mjs`）：

```bash
node bin/travel-guide.mjs init --destination 广州 --start 2026-11-28 --days 3 \
  --travelers 2 --budget mid --out trips/guangzhou-3d
node bin/travel-guide.mjs enrich --trip trips/guangzhou-3d/trip.json
node bin/travel-guide.mjs check --trip trips/guangzhou-3d/trip.json --strict
node bin/travel-guide.mjs build --trip trips/guangzhou-3d/trip.json \
  --out trips/guangzhou-3d/dist
```

### 1. Intake

一次只问缺的关键信息，不要盘问。必填：目的地、日期或天数。默认：1 人、平衡节奏、中档预算、公共交通优先。

尽量补齐：出发地/到达时间、人数与关系、预算档、兴趣、饮食/无障碍/带娃/老人、签证/证件、是否自驾、住宿区域、必须去/不想去。

日期不明确时用 `dates` 算星期/假期/拼假，不要心算。

### 2. Research

`enrich` 会做：

- Open-Meteo 地理编码 + 16 天天气预报（超出则气候估算）。
- Nominatim 地址/POI；Overpass 周边景点/餐厅。
- Wikimedia 背景、坐标、官网；Frankfurter 汇率；Nager 假期（可选）。
- 为 3 天以上行程补 `overview.guide`：背景/文化/风俗、美食、打卡点、避坑、贴士；每块都要 `sourceIds`。

然后 agent 用 `web_search`/`web_fetch` 逐项核官方信息：

- 开放时间、最后入场、闭馆日、预约入口、票价、免费日。
- 交通：地铁/公交首末班、机场/火车站到市区、是否需要换乘。
- 住宿：区域安全性/交通便利性；不编具体房价。
- 特殊：签证、入境、天气预警、大型活动/施工/罢工。

把结果写进 `trip.json` 的 `sources[]`，并在 `item.sourceIds` 引用。官方页面打不开就标 `unverified`，不要用记忆补。

### 3. Plan

- 按地理位置聚类，每天 2–3 个锚点，不跨城折返。
- 每个锚点之间写 `transit`（方式、时长、距离、是否估算）；留 15–30 分钟缓冲。
- 饭点：午餐 11:30–13:30，晚餐 17:30–19:30；不要用“随便吃”糊弄。
- 到达日/返程日少排；留酒店入住/行李时间。
- 每天准备一个雨天/闭馆备选（`backupFor`）。
- 预算给区间，不假装精确；交通时长标 `estimate`。

### 4. Check

```bash
node bin/travel-guide.mjs check --trip <trip.json> --strict
```

硬错误必须修：无来源、无坐标、无交通、一天超过 3 锚点、无饭点、应预约但无官方来源、16 天内无天气、动态字段非官方来源、3 天以上无 guide、guide 块缺来源。

草稿/示例可以 `--allow-unverified` 构建，但 HTML 必须显著标“示例/待核验”，不能当正式行程交付。

### 5. Build

```bash
node bin/travel-guide.mjs build --trip <trip.json> --out <dir> [--public] [--strict]
```

输出：

- `index.html`：单文件、离线、交互（切天/筛选/搜索/地图/清单/预算/主题/打印/ICS/来源）。
- `itinerary.md`：可复制进聊天/文档的版本。
- `trip.ics`：日历。
- `sources.md`：来源台账。
- `build-receipt.json`：输入/输出 hash、来源覆盖（有来源/估算/缺失）、警告。

构建后必须用浏览器打开检查：控制台无错误、桌面/移动布局正常、切天/筛选/清单/主题/打印/ICS 可用。DSH 环境用 `bcdp_*` 工具。

### 6. Deliver

聊天里给：3–5 行摘要、每天一句话、预算区间、最需要提前预约的 1–2 项、文件路径。

```
已生成：<out>/index.html
来源：官方 N 条 / OSM M 条 / 预报 K 条；未核实项见 HTML 顶部
```

## 模式

### 新行程

走完整流程。先 `init`，再 `enrich`，再写 `days/items`，最后 `check`/`build`。

### 攻略复刻（小红书/公众号/截图）

1. 小红书链接：默认请用户粘贴正文/截图。只有用户明确同意按次付费并配置 `TIKHUB_API_KEY` 时才用：
   ```bash
   node bin/travel-guide.mjs import --url '<share_text>' --tikhub \
     --max-cost-usd 0.05 --max-notes 1 --out imports/
   ```
   先 `--dry-run` 看费用；不要自动重试；失败不重复扣费。
2. 从正文/图片抽取候选地点（名称、城市、理由、来源句）。
3. 每个地点用 Nominatim/Overpass 落点、去重、核验；不确定的不要硬塞进行程。
4. 保留原笔记链接作为 `community` 来源，不要复制整篇受版权保护的内容。

### 修订

改 `days/items` 后重算受影响的 `transit`、饭点、闭馆日、预算；不要只改时间不改交通。改完重跑 `check`/`build`。

### 行前检查

输出：天气、预约状态、闭馆/节假日、证件/签证、保险、行李、紧急联系人、离线地图/支付。动态项必须给官方链接。

### 途中

HTML 的“今天”视图可离线看；不要声称实时导航/公交到站。附近候选用 Overpass 小半径查询，标 `community`。

### 记账

```bash
node bin/travel-guide.mjs expenses --trip <trip.json> --csv expenses.csv --settle
```

金额用分计算；多人等分余数确定性分配；输出最少转账。不要接银行账户。

### 分享

`--public` 脱敏：姓名、电话、邮箱、证件、订单号、房间号、紧急联系人。分享前自己再检查一遍。

## 文件约定

- `trip.json`：唯一事实源；所有展示从它生成。
- `sources[]`：每条来源有 `id/provider/kind/url/retrievedAt/transport/license/confidence/label`；kind 覆盖 lodging/transport/route/culture/food/photo/safety。
- `overview.guide`：目的地手册；`item.detail`：景点故事；`item.derived/derivation`：估算型 buffer。
- `expenses.csv`：`date,item,category,amount,currency,payer,participants,note,source`。
- 产物目录不要提交个人行程；`.gitignore` 已忽略 `trips/`、`*.private.json`、缓存。
- 示例在 `examples/guangzhou-3d/`；`demo` 命令可离线重建。

## 来源与置信度

- `official`：官方/一手，开放时间/票价/预约可用。
- `verified`：权威开放数据或交叉验证；OSM 坐标可用。
- `forecast`：天气预报，写更新时间。
- `community`：OSM 标签、Wikimedia 背景、UGC。
- `estimate`：交通时长/预算/节奏等启发式。
- `unverified`：明确未核验，HTML 红色徽章。

HTML 把来源链接放在每条行程卡片和手册块内；`sources.md` 是完整台账。顶部「编辑」可就地修改/新增/删除/排序并导出 `trip.json`，修改只存浏览器 localStorage；景点卡片可展开“看点与故事”。

## 数据源与合规

- Open-Meteo：预报最多 16 天；免费非商业额度；必须显示 “Weather data by Open-Meteo.com” 并链接。
- Nominatim：≤1 请求/秒、有效 UA、必须缓存；禁止自动补全/批量地理编码/整区下载。
- Overpass：同时 1 条下载连接；小范围查询；必须显示 OSM/ODbL 归属和 fixthemap 链接。
- Wikimedia：串行、`maxlag=5`、描述性 UA；文本 CC BY-SA 4.0。
- 官方页面：单页核验，不批量抓取。
- TikHub：可选、付费、非官方；默认关闭；使用前读 `docs/tikhub.md`；Key 只放环境变量，不入库、不入 HTML。

## 参考文件

- `references/intake.md`：提问清单与默认值。
- `references/research.md`：官方核验清单。
- `references/sources.md`：来源/置信度/校验规则。
- `references/planning.md`：排程启发式与反例。
- `references/revise.md`：改行程的检查清单。
- `references/expenses.md`：记账与分账。
- `references/checklists.md`：行前/行李/紧急。
- `references/delivery.md`：HTML 验收与分享。

## 失败时

- API 超时：`--offline` 用缓存；没有缓存就标 `unverified`，告诉用户哪几项没查到，不要编。
- 日期/地点歧义：给 2–3 个候选让用户选；不要默认选一个。
- 预算不足：给“保底版/舒适版”两个区间，说明砍了什么。
- 天气/闭馆冲突：给替代日/替代点，不要硬排。
- 用户要求下单/实时导航：明确说做不到，给官方链接/电话。
