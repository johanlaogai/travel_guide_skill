# Sources：来源、置信度与证据

## 一条来源长什么样

```json
{
  "id": "src-abc123",
  "provider": "official",
  "kind": "official",
  "title": "广东省博物馆参观预约",
  "url": "https://www.guangdongmuseum.com/...",
  "retrievedAt": "2026-11-27T02:00:00.000Z",
  "transport": "live",
  "license": "官方页面条款",
  "confidence": "official",
  "rawHash": "sha256..."
}
```

## provider

`open-meteo` / `nominatim` / `overpass` / `wikimedia` / `official` / `frankfurter` / `nager` / `tikhub` / `manual`。

没有 `model`。模型不能生成来源。

## transport

- `live`：本次实时请求；
- `cache`：来自本地缓存；
- `snapshot`：随项目分发的快照/示例；
- `manual`：用户/agent 手工录入，必须能解释。

## confidence

| 值 | 用法 | HTML |
|---|---|---|
| `official` | 官方/一手；开放时间/票价/预约 | 绿色 |
| `verified` | 权威开放数据/交叉验证；OSM 坐标 | 蓝色 |
| `forecast` | 天气预报 | 青色 |
| `community` | OSM 标签、Wiki 背景、UGC | 黄色 |
| `estimate` | 交通时长/预算/气候估算 | 灰色 |
| `unverified` | 明确未核验 | 红色 |

## 硬规则

- 锚点/餐饮必须有 `sourceIds`；
- `sourceIds` 必须能解析；
- `openingHours`/`ticketPrice` 必须至少有一个 `provider: official & confidence: official`；
- `booking.required` 必须有官方来源或预约 URL；
- 16 天内每天必须有天气来源；
- `provider: model` 直接拒绝；
- URL 必须是 http(s) 或 `manual://`；
- `retrievedAt` 必须可解析；
- `license` 不能为空。

## 记录习惯

- 一个事实一条来源；不要把整页攻略当一个来源。
- 官方页面标题写清楚“哪个页面/哪个政策”，不要只写“官网”。
- `rawHash` 存响应/正文 hash，便于复核；不要存整页版权内容。
- `note` 写“这条来源支持哪一句”，不要写广告。
- 重复 enrich 不会改变 source id（id 不含 retrievedAt），但 `retrievedAt` 会更新。

## 冲突

- 官方 vs UGC：官方优先；UGC 只作体验参考。
- 两个官方冲突：都保留，标“待核实”，在 HTML 风险区提示。
- 旧页面 vs 新公告：以新公告为准，记录两个 URL 和日期。
- 查不到：`unverified` + “以官方当日公告为准”，不要编。

## 归属

- Open-Meteo：CC BY 4.0，显示 “Weather data by Open-Meteo.com”；
- OSM/Nominatim/Overpass：ODbL，显示 © OpenStreetMap contributors + fixthemap；
- Wikimedia：CC BY-SA 4.0；
- 官方页面：标题 + 链接 + 访问时间；
- TikHub：第三方 API，平台条款/版权/隐私由使用者承担。

## 公开分享

`--public` 会：

- 清空 `emergency.contacts`；
- 删除订单/确认号；
- 脱敏电话/邮箱/证件号；
- 标记 `meta.publicMode`。

分享前自己再检查：酒店房间号、同行人姓名、车牌、保单号、二维码。
