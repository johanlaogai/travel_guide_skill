# travel-guide

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai) 的**可核验旅行规划 skill**：把目的地、日期和偏好，变成一份带来源台账、可离线打开、可交互、可就地编辑的单文件 HTML 行程。

不是“让模型写一段攻略”。每条营业时间、票价、预约规则都能点回来源；查不到就标“待核实”，不猜。

## 它能做什么

- **新行程**：按地理位置聚类，逐日排 2–3 个锚点，补交通、饭点、缓冲和雨天备选。
- **攻略复刻**：从小红书/公众号链接、截图或文字里抽取地点，再用 Nominatim/Overpass 落点、去重、核验。
- **修订**：加/删地点、换天、带老人小孩、改预算后，重算交通与检查项。
- **行前检查**：天气、闭馆、预约、证件、保险、行李、紧急信息。
- **记账分账**：CSV 记账，按分计算，多人等分余数确定性分配，输出最少转账。
- **交付**：单文件交互 HTML（真实地图、目的地手册、避坑清单、可编辑/导出）+ Markdown + ICS + 来源台账 + 构建回执。

主产物：

```
dist/
├── index.html          # 单文件交互页：真实地图、切天、筛选、预算、清单、编辑、打印、ICS
├── itinerary.md        # 可复制到聊天/文档
├── sources.md          # 完整来源台账
├── trip.ics            # 日历
└── build-receipt.json  # 输入/输出 hash、覆盖率、警告
```

## 为什么不是“瞎编”

| 数据类型 | 首选来源 | 置信度 |
|---|---|---|
| 开放时间、票价、预约、闭馆 | 官方页面/官方公众号 | `official` |
| 坐标、地址、POI | Nominatim / Overpass / 官方 | `verified` / `community` |
| 16 天内天气 | Open-Meteo Forecast | `forecast` |
| 历史气候 | Open-Meteo Archive/Climate | `estimate` |
| 背景、图片、官网 | Wikipedia / Wikivoyage / Wikidata / Commons | `community` |
| 汇率 | Frankfurter（ECB） | `verified` |
| 公共假期 | Nager.Date | `verified` |
| 小红书笔记 | 用户粘贴，或可选 TikHub | `community` |
| 交通时长、预算 | 启发式/用户输入，标 `derived` | `estimate` |

规则写在代码里，不只写在提示词里：

- `provider: model` 被禁止；
- 锚点/餐饮/住宿/城际交通没有 `sourceIds`，`check` 直接失败；buffer 必须 `derived: true` + `derivation`；
- 3 天以上行程必须有目的地手册（背景/文化/风俗/美食/打卡/避坑），每块都要 `sourceIds`；
- `openingHours`/`ticketPrice` 只有 `official` 来源才允许；
- 16 天内行程没有天气来源，`check` 失败；
- `--strict` 会把指定的提醒升级为错误；
- 来源链接直接放在行程卡片和手册条目上；`sources.md` 是完整台账。

## 快速开始

要求：Node.js >= 20（零 npm 运行时依赖）。

```bash
git clone git@github.com:johanlaogai/travel_guide_skill.git
cd travel_guide_skill

# 1) 新建行程
node bin/travel-guide.mjs init \
  --destination 广州 --start 2026-11-28 --days 3 \
  --travelers 2 --budget mid --out trips/guangzhou-3d

# 2) 拉取地理编码/天气/POI/Wiki/汇率/假期（遵守限速与缓存）
node bin/travel-guide.mjs enrich --trip trips/guangzhou-3d/trip.json

# 3) 补写 days/items/sources 后校验
node bin/travel-guide.mjs check --trip trips/guangzhou-3d/trip.json --strict

# 4) 生成交互 HTML
node bin/travel-guide.mjs build --trip trips/guangzhou-3d/trip.json \
  --out trips/guangzhou-3d/dist

# 5) 记账
node bin/travel-guide.mjs expenses --trip trips/guangzhou-3d/trip.json \
  --csv trips/guangzhou-3d/expenses.csv
```

离线看示例（不需要网络）：

```bash
node bin/travel-guide.mjs demo --out .tmp/demo
# open .tmp/demo/index.html
```

## 安装为 DSH skill

```bash
./scripts/install.sh
# 默认 symlink 到 ~/.dsh/skills/travel-guide
# 自定义目录：DSH_SKILLS_DIR=/path/to/skills ./scripts/install.sh
# 复制而不是 symlink：./scripts/install.sh --copy
```

安装后，DSH 的技能目录会看到 `travel-guide/SKILL.md`。运行：

```bash
node bin/travel-guide.mjs doctor
```

检查 Node、git、curl、缓存目录和 skill 安装状态；加 `--live` 会各发 1 次请求检查 Open-Meteo/Nominatim/Overpass/Wikimedia 连通性，不会调用付费 TikHub。

## 命令

| 命令 | 作用 |
|---|---|
| `init` | 创建 `trip.json` / `expenses.csv` / README 骨架 |
| `dates` | 算星期、周末、公共假期、请假天数 |
| `enrich` | 拉取地理编码、天气预报/气候、周边 POI、Wiki、汇率、假期 |
| `import` | 导入小红书/文字/截图；TikHub 可选且付费 |
| `check` | 校验来源、坐标、交通、饭点、预约、预算、PII |
| `build` | 生成 HTML/Markdown/ICS/来源台账/回执 |
| `expenses` | 记账汇总与多人结算 |
| `doctor` | 环境与数据源体检 |
| `demo` | 离线构建广州示例 |

所有命令都支持 `--json`（除 `doctor` 外也有结构化输出），方便 agent 调用。

## 数据源与合规

- **Open-Meteo**：预报最多 16 天；免费非商业额度；显示 “Weather data by Open-Meteo.com” 并链接；CC BY 4.0。
- **Nominatim**：≤1 请求/秒、有效 User-Agent、必须缓存；禁止自动补全、批量地理编码、整区下载；ODbL。
- **Overpass**：脚本同时 1 条下载连接、小范围查询、结果缓存；显示 © OpenStreetMap contributors 和 fixthemap；ODbL。
- **Wikimedia**：Action API、串行、`maxlag=5`、描述性 UA；文本 CC BY-SA 4.0。
- **官方页面**：单页核验，不批量抓取；只记录事实和链接，不复制长文。
- **TikHub**：可选、付费、非官方；默认关闭；Key 只放环境变量；使用前读 [docs/tikhub.md](docs/tikhub.md)。

详细端点、参数、限速和缓存策略见 [docs/data-sources.md](docs/data-sources.md)。

## 交互 HTML

`index.html` 是自包含文件，Leaflet 1.9.4 内联，地图瓦片在查看时按需加载：

- **真实地图**：默认 Esri World Street Map（WGS84），可切高德中文底图（自动 WGS84→GCJ-02）或 OSM；支持缩放、拖动、重置、按天/类型/搜索筛选和卡片联动；瓦片失败或无坐标时回退到地址列表；
- **可就地编辑**：顶部「编辑」→ 修改/新增/删除/上移/下移行程项、改当天标题；修改只存本机 `localStorage`，刷新保留；可导出 `trip.json` 或恢复初始版本；导出的新锚点自动带“用户在 HTML 中编辑”来源；
- 按天切换、按类型筛选、搜索、深链接；
- 预算环形图与分类区间；
- 行李/预约清单，勾选状态存 `localStorage`；
- **来源放在卡片上**：官方/天气来源是可点击的超链接；只有手工整理、没有官方链接的项显示不可点的“行程整理”，不再有单独的来源覆盖统计或来源表；
- **目的地手册与避坑**：背景、文化、风俗、美食、网红打卡、实用贴士和 8+ 条踩雷提醒，每块带来源；
- **来源完整**：酒店挂住宿区域官方页，城际交通/车站/机场挂 12306/机场，缓冲项标“估算 · 路线时间”；
- 外链点击优先新标签打开，被浏览器拦截时回退当前页；“地图定位”直接聚焦地图 marker；
- 明/暗主题、打印/PDF、ICS 下载；
- CSP 允许地图图片（`img-src data: https:`），但禁止 `connect-src`；行程数据不联网，只有底图瓦片会请求第三方；
- 字体用系统 CJK 字体栈，不打包字体、不发字体请求；纯 Linux/容器若缺中文字体，请安装 Noto Sans CJK（如 `fonts-noto-cjk`）。

浏览器验收清单见 [references/delivery.md](references/delivery.md)。

## 项目结构

```
SKILL.md                 # DSH skill 入口：铁律、流程、模式、合规
bin/travel-guide.mjs     # CLI 入口
src/
├── cli.mjs
├── commands/            # init/dates/enrich/import/check/build/expenses/doctor/demo
├── core/                # 日期/金额/来源/缓存/限速/HTTP/脱敏/校验/原子写
├── data/
│   ├── providers/       # Open-Meteo/Nominatim/Overpass/Wikimedia/Frankfurter/Nager/TikHub
│   ├── context.mjs      # cache + limiter + UA
│   └── enrich.mjs       # 数据融合
└── render/              # HTML/Leaflet 地图壳/ICS/Markdown/来源链接
    └── assets/          # 内联 CSS + timeline/map/editor/app 客户端脚本
vendor/leaflet/          # Leaflet 1.9.4（BSD-2-Clause，内联进 HTML）
schemas/                 # trip/source JSON Schema
references/              # skill 的分主题操作手册
docs/                    # 数据源、TikHub、架构
examples/guangzhou-3d/   # 离线示例
tests/                   # node --test
scripts/                 # install / lint
.github/workflows/ci.yml # Node 20/22
```

## 开发

```bash
npm test          # node --test
npm run lint      # node --check + 必需文件检查
npm run check     # 示例硬规则
npm run build     # 示例构建
npm run demo      # 离线演示
```

测试不访问实时网络；provider 用本地 fixture HTTP server + 环境变量 base URL。CI 用 Node 20/22 矩阵。

## 隐私与分享

- `--public` 会清空紧急联系人、删除订单/确认号、脱敏电话/邮箱/证件号，并在 HTML 顶部显示“公开分享版”。
- `trips/`、`.travel-guide-cache/`、`.env`、`*.private.*` 默认被 `.gitignore` 忽略。
- TikHub Key 只从 `TIKHUB_API_KEY` 读取，不写入 `trip.json`、HTML、日志或 git。
- 生成的 HTML 不向本 skill 的服务器发送行程数据；查看地图时浏览器会向所选底图供应商请求瓦片，来源/地图外链也受目标站点隐私政策约束。
- 编辑内容只保存在浏览器 `localStorage`，不会自动上传；导出 `trip.json` 后自行决定是否分享。

## 不做什么

- 不下单、不支付、不订机票/酒店/门票；
- 不提供实时导航、公交到站、打车；
- 不做签证法律意见、海外紧急救援；
- 不做多人实时协作服务端；
- 不绕过登录/反爬，不批量抓取。

## License

MIT。第三方数据/服务的归属与条款见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
