# Expenses：记账与分账

## CSV 格式

```csv
date,item,category,amount,currency,payer,participants,note,source
2026-11-28,陈家祠门票,tickets,20,CNY,小林,小林;小周,2 人,manual://demo/chen-clan
2026-11-28,早茶,food,120,CNY,小周,小林;小周,2 人,manual://demo/food
```

- `category`：transport / lodging / food / tickets / shopping / other；
- `amount`：元，最多两位小数；代码转整数分；
- `participants`：用 `;`、`,` 或 `、` 分隔；空则只算付款人；
- `currency`：默认 `trip.meta.budget.currency`；多币种要先有 `trip.meta.fx`；
- `source`：可选，指向票据/订单（公开版不要放订单号）。

## 运行

```bash
node bin/travel-guide.mjs expenses \
  --trip trips/guangzhou-3d/trip.json \
  --csv trips/guangzhou-3d/expenses.csv

# JSON 给 agent/程序用
node bin/travel-guide.mjs expenses --trip ... --csv ... --json
```

## 算法

1. 金额转整数分；
2. 每个参与者等分：`floor(total/n)`，余数按参与者排序依次 +1 分；
3. 付款人先记“垫付”，再扣自己的份额；
4. 余额 >0 应收，<0 应付；
5. 贪心匹配最大债务/最大债权，输出最少转账。

例：268 元、3 人 → 89.34 / 89.33 / 89.33（排序第一的人多 1 分）。不会出现 89.333 的浮点误差。

## 多币种

- 先把外币按 `trip.meta.fx` 换算成基准币，再结算；
- 汇率是参考值，不是交易价；大额换汇以银行/卡组织为准；
- 不要在同一笔结算里混币种。

## 隐私

- `expenses.csv` 默认在 `trips/`，已被 gitignore；
- 公开版不要放订单号、手机号、房号；
- 分享结算结果时只保留昵称/首字母。

## 边界

- 不接银行账户、不做支付；
- 不处理退款/税费/小费规则（可写在 `note`，人工确认）；
- 不保证会计合规；重要报销请用财务系统。
