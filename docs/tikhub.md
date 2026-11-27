# TikHub 可选导入（付费、非官方）

TikHub 是第三方社媒数据 API 聚合商，提供小红书（Rednote）App V2 接口。它不是小红书官方，也不拥有底层内容。**默认关闭**；只有用户明确同意按次付费并配置 Key 时才用。

## 能做什么

- 把小红书分享链接/`share_text` 变成结构化笔记：标题、正文、标签、图片、作者、互动、评论；
- 作为“攻略复刻”的候选地点来源；
- 可选公众号文章提取（如 API 支持）。

## 不能做什么

- 不能提供营业时间、票价、预约、天气、路线；
- 不能替代 Nominatim/Overpass/官方核验；
- 不能作为事实底座；导入内容一律标 `community`；
- 不能保证平台条款/版权/隐私合规——这由使用者承担。

## 启用

```bash
export TIKHUB_API_KEY='...'   # 只放环境变量，不要写进仓库

# 先 dry-run 看费用，不调用 API
node bin/travel-guide.mjs import \
  --url 'https://www.xiaohongshu.com/explore/...' \
  --tikhub --dry-run --max-cost-usd 0.05 --max-notes 1

# 明确同意后
node bin/travel-guide.mjs import \
  --url 'https://xhslink.com/...' \
  --tikhub --max-cost-usd 0.05 --max-notes 1 --out imports/
```

## 成本与限流

- App V2 相关端点约 **$0.01/请求**；注册赠送额度有限；最低充值通常 $5。
- 默认 10 RPS/端点；本项目只用 **1 RPS**。
- API 不缓存，重复请求重复计费；响应里的 `cache_url` 通常只免费 24 小时。
- 传错/不存在的 note_id 仍可能计费；**不要自动重试**。
- 本项目：`--max-cost-usd` 默认 0（拒绝）；`--max-notes` 默认 1、硬上限 5；本地缓存 7 天；`--dry-run` 不发请求。

## 安全

- Key 只从 `TIKHUB_API_KEY` 读取；不写入 `trip.json`、HTML、日志、git。
- 错误信息会脱敏 Key。
- 只接受 `xiaohongshu.com` / `xhslink.com` / `xhslink.cn` 链接，或 24 位 hex note id；防止把任意 URL 发给第三方。
- 不抓取私密/登录后内容；不绕过平台限制。
- 导入后仍要逐项核验；UGC 只作灵感。

## 不用 Key 的替代

- 用户粘贴正文/截图；
- 手工摘录地点名 + 原链接；
- 用 Nominatim/Overpass 落点；
- 用官方页面核验动态事实。

## 参考

- 文档：<https://docs.tikhub.io/>
- 小红书 App V2 端点：`GET /api/v1/xiaohongshu/app_v2/get_image_note_detail`
- Base：`https://api.tikhub.io`
- 认证：`Authorization: Bearer <TIKHUB_API_KEY>`

价格、端点、条款可能变化；以 TikHub 当日文档/账单为准。
