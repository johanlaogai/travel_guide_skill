import fs from 'node:fs/promises';
import path from 'node:path';
import { parse, requireOption, parseCsv, printJson } from './helpers.mjs';
import { loadTrip } from '../core/trip.mjs';
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  formatCents,
  formatTransfer,
  parseAmountToCents,
  settleExpenses,
} from '../core/money.mjs';
import { UsageError } from '../core/errors.mjs';

export async function run(argv) {
  const { values } = parse('expenses', argv, {
    trip: { type: 'string' },
    csv: { type: 'string' },
    currency: { type: 'string' },
    settle: { type: 'boolean', default: true },
    json: { type: 'boolean', default: false },
  });
  const tripPath = requireOption(values, 'trip', '缺少 --trip');
  const trip = await loadTrip(tripPath);
  const csvPath = path.resolve(values.csv ?? path.join(path.dirname(tripPath), 'expenses.csv'));
  const text = await fs.readFile(csvPath, 'utf8');
  const rows = parseCsv(text);
  if (!rows.length) {
    if (values.json) printJson({ csvPath, expenses: [], summary: null });
    else console.log('expenses.csv 还没有数据。');
    return 0;
  }
  const baseCurrency = (values.currency ?? trip.meta.budget.currency ?? 'CNY').toUpperCase();
  const expenses = rows.map((row, index) => {
    const category = row.category || 'other';
    if (!EXPENSE_CATEGORIES.includes(category)) {
      throw new UsageError(`第 ${index + 2} 行 category 无效：${category}（可用：${EXPENSE_CATEGORIES.join(', ')}）`);
    }
    if (!row.payer) throw new UsageError(`第 ${index + 2} 行缺少 payer`);
    let amountCents = parseAmountToCents(row.amount);
    let currency = (row.currency || baseCurrency).toUpperCase();
    if (currency !== baseCurrency) {
      const fx = trip.meta.fx;
      if (fx?.quote === currency && Number.isFinite(fx.rate)) {
        amountCents = Math.round(amountCents * fx.rate);
        currency = baseCurrency;
      } else {
        throw new UsageError(`第 ${index + 2} 行币种 ${currency} 无法换算为 ${baseCurrency}；请先补 trip.meta.fx 或统一币种`);
      }
    }
    const participants = String(row.participants || row.payer)
      .split(/[;,、]/)
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      date: row.date,
      item: row.item,
      category,
      amountCents,
      currency,
      payer: row.payer,
      participants,
      note: row.note,
      source: row.source,
    };
  });
  const summary = settleExpenses(expenses, { currency: baseCurrency });
  if (values.json) {
    console.log(JSON.stringify({
      csvPath,
      baseCurrency,
      expenses,
      summary,
      transfers: summary.transfers.map((transfer) => ({ ...transfer, label: formatTransfer(transfer, baseCurrency) })),
    }, null, 2));
    return 0;
  }
  console.log(`${csvPath}\n`);
  console.log('日期        项目                         分类   金额        付款人');
  for (const expense of expenses) {
    console.log(
      `${expense.date.padEnd(10)}  ${String(expense.item).slice(0, 24).padEnd(24)} ${String(CATEGORY_LABELS[expense.category] ?? expense.category).padEnd(4)} ${formatCents(expense.amountCents, baseCurrency).padStart(10)}  ${expense.payer}`,
    );
  }
  console.log(`\n合计：${formatCents(summary.totalCents, baseCurrency)}`);
  for (const [key, entry] of Object.entries(summary.byCategory)) {
    console.log(`  ${entry.label.padEnd(4)} ${formatCents(entry.cents, baseCurrency)}`);
  }
  console.log('\n余额：');
  for (const [person, balance] of Object.entries(summary.balances)) {
    console.log(`  ${person}: ${balance.label} ${formatCents(Math.abs(balance.cents), baseCurrency)}`);
  }
  console.log('\n最少转账：');
  if (!summary.transfers.length) console.log('  无需转账');
  else for (const transfer of summary.transfers) console.log(`  ${formatTransfer(transfer, baseCurrency)}`);
  return 0;
}
