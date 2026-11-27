export const EXPENSE_CATEGORIES = [
  'transport',
  'lodging',
  'food',
  'tickets',
  'shopping',
  'other',
];

export const CATEGORY_LABELS = {
  transport: '交通',
  lodging: '住宿',
  food: '餐饮',
  tickets: '门票',
  shopping: '购物',
  other: '其他',
};

export function parseAmountToCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`金额不是有效数字：${value}`);
    return Math.round(value * 100);
  }
  const raw = String(value ?? '').trim().replace(/,/g, '').replace(/[¥￥$€£]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) throw new Error(`金额格式无效：${value}`);
  const negative = raw.startsWith('-');
  const [whole, frac = ''] = raw.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export function centsToNumber(cents) {
  return Math.round(Number(cents)) / 100;
}

export function formatCents(cents, currency = 'CNY', locale = 'zh-CN') {
  const value = centsToNumber(cents);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatRangeCents(minCents, maxCents, currency = 'CNY') {
  if (minCents === maxCents) return formatCents(minCents, currency);
  return `${formatCents(minCents, currency)}–${formatCents(maxCents, currency)}`;
}

export function splitEvenly(totalCents, participants) {
  const unique = [...new Set(participants.map(String))];
  if (unique.length === 0) throw new Error('分账至少需要一个参与者');
  const base = Math.floor(totalCents / unique.length);
  const remainder = totalCents - base * unique.length;
  const shares = {};
  unique.sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach((name, index) => {
    shares[name] = base + (index < remainder ? 1 : 0);
  });
  return shares;
}

export function settleExpenses(expenses, options = {}) {
  const defaultCurrency = options.currency ?? 'CNY';
  const balances = new Map();
  const byCategory = new Map();
  const byPayer = new Map();
  let totalCents = 0;

  for (const expense of expenses) {
    const amount = Number.isInteger(expense.amountCents)
      ? expense.amountCents
      : parseAmountToCents(expense.amount);
    if (amount < 0) throw new Error(`支出金额不能为负：${expense.item ?? ''}`);
    const currency = expense.currency ?? defaultCurrency;
    if (currency !== defaultCurrency) {
      throw new Error(`结算前请先统一币种：${currency} ≠ ${defaultCurrency}`);
    }
    const payer = String(expense.payer ?? '').trim();
    if (!payer) throw new Error(`支出缺少付款人：${expense.item ?? ''}`);
    const participants = Array.isArray(expense.participants) && expense.participants.length
      ? expense.participants.map(String)
      : [payer];
    const shares = splitEvenly(amount, participants);
    totalCents += amount;
    balances.set(payer, (balances.get(payer) ?? 0) + amount);
    for (const [person, share] of Object.entries(shares)) {
      balances.set(person, (balances.get(person) ?? 0) - share);
    }
    const category = expense.category ?? 'other';
    byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
    byPayer.set(payer, (byPayer.get(payer) ?? 0) + amount);
  }

  const debtors = [];
  const creditors = [];
  for (const [person, balance] of balances.entries()) {
    if (balance < 0) debtors.push({ person, amount: -balance });
    else if (balance > 0) creditors.push({ person, amount: balance });
  }
  debtors.sort((a, b) => b.amount - a.amount || a.person.localeCompare(b.person, 'zh-CN'));
  creditors.sort((a, b) => b.amount - a.amount || a.person.localeCompare(b.person, 'zh-CN'));

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) {
      transfers.push({
        from: debtors[i].person,
        to: creditors[j].person,
        amountCents: pay,
        amount: centsToNumber(pay),
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i += 1;
    if (creditors[j].amount === 0) j += 1;
  }

  const balancesOut = {};
  for (const [person, value] of [...balances.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) {
    balancesOut[person] = {
      cents: value,
      amount: centsToNumber(value),
      label: value === 0 ? '已结清' : value > 0 ? '应收' : '应付',
    };
  }

  return {
    currency: defaultCurrency,
    totalCents,
    total: centsToNumber(totalCents),
    byCategory: Object.fromEntries(
      [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => [
        key,
        { cents: value, amount: centsToNumber(value), label: CATEGORY_LABELS[key] ?? key },
      ]),
    ),
    byPayer: Object.fromEntries(
      [...byPayer.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => [
        key,
        { cents: value, amount: centsToNumber(value) },
      ]),
    ),
    balances: balancesOut,
    transfers,
  };
}

export function summarizeBudget(budget, fallbackCurrency = 'CNY') {
  const items = Array.isArray(budget) ? budget : [];
  const currency = items[0]?.currency ?? fallbackCurrency;
  let minCents = 0;
  let maxCents = 0;
  const categories = items.map((entry) => {
    const min = parseAmountToCents(entry.min ?? 0);
    const max = parseAmountToCents(entry.max ?? entry.min ?? 0);
    if (min > max) throw new Error(`预算分类 ${entry.key ?? entry.label} 的 min 大于 max`);
    minCents += min;
    maxCents += max;
    return {
      key: entry.key ?? entry.label,
      label: entry.label ?? entry.key,
      minCents: min,
      maxCents: max,
      currency: entry.currency ?? currency,
      sourceIds: entry.sourceIds ?? [],
    };
  });
  return { currency, minCents, maxCents, categories };
}

export function convertCents(cents, rate) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`汇率必须为正数：${rate}`);
  return Math.round(cents * rate);
}

export function formatTransfer(transfer, currency = 'CNY') {
  return `${transfer.from} → ${transfer.to} ${formatCents(transfer.amountCents, currency)}`;
}
