# 广州 3 天 2 晚示例

这是 `travel-guide` v0.1 的演示行程，用来展示：

- 3 天、2 人、2026-11-28 至 2026-11-30 的逐日时间线；
- 西关老城、珠江新城、白云山—越秀三块区域的聚类；
- 自绘 SVG 地图、预算环形图、行李/预约清单、来源徽章；
- `check` / `build` / `expenses` 的完整链路。

## 重要说明

示例中的天气、坐标、营业时间、票价、预约规则是**演示快照/手工整理**，不是实时核验结果。HTML 顶部会显示“示例数据”横幅；真正出行前请：

1. 用官方页面核对开放时间、闭馆日、票价与预约；
2. 用 `enrich` 重新拉取天气与 POI；
3. 用 `check --strict` 检查来源与交通；
4. 用 `--public` 生成脱敏分享版。

## 运行

```bash
node bin/travel-guide.mjs check --trip examples/guangzhou-3d/trip.json
node bin/travel-guide.mjs demo --out .tmp/demo
node bin/travel-guide.mjs build --trip examples/guangzhou-3d/trip.json --out examples/guangzhou-3d/dist --allow-unverified
node bin/travel-guide.mjs expenses --trip examples/guangzhou-3d/trip.json --csv examples/guangzhou-3d/expenses.csv
```

打开 `examples/guangzhou-3d/dist/index.html`（或 `.tmp/demo/index.html`）查看交互页面。
