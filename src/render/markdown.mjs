import { formatRangeZh } from '../core/dates.mjs';
import { formatCents, formatRangeCents, summarizeBudget } from '../core/money.mjs';
import { CONFIDENCE_LABELS, PROVIDER_LABELS } from '../core/provenance.mjs';

const TYPE_LABELS = {
  anchor: '景点',
  meal: '餐饮',
  transit: '交通',
  rest: '休息',
  hotel: '住宿',
  buffer: '缓冲',
};

const BOOKING_STATUS_LABELS = {
  pending: '待预约',
  booked: '已预约',
  cancelled: '已取消',
  done: '已完成',
};

const TRANSIT_LABELS = {
  walk: '步行',
  metro: '地铁',
  bus: '公交',
  taxi: '打车',
  drive: '自驾',
  train: '火车',
  flight: '飞机',
  other: '其他',
};

export function buildMarkdown(trip) {
  const meta = trip.meta;
  const lines = [];
  const sourceById = new Map((trip.sources ?? []).map((source) => [source.id, source]));
  lines.push(`# ${meta.title}`, '');
  lines.push(`**${meta.destination.name}** · ${formatRangeZh(meta.startDate, meta.endDate)} · ${meta.days} 天 · ${meta.travelers} 人`, '');
  if (trip.overview?.summary) lines.push(`> ${trip.overview.summary}`, '');
  if (trip.overview?.background) lines.push(trip.overview.background, '');
  lines.push(`- 预算：${meta.budget.totalMin != null && meta.budget.totalMax != null ? formatRangeCents(meta.budget.totalMin * 100, meta.budget.totalMax * 100, meta.budget.currency) : '待补'}`);
  lines.push(`- 节奏：${meta.pace ?? 'balanced'}`);
  lines.push(`- 兴趣：${(meta.interests ?? []).join('、') || '未指定'}`);
  lines.push('');

  for (const [index, day] of (trip.days ?? []).entries()) {
    lines.push(`## Day ${index + 1} · ${day.date} ${day.weekday ?? ''}`, '');
    if (day.title) lines.push(`### ${day.title}`, '');
    if (day.area) lines.push(`区域：${day.area}`, '');
    if (day.weather?.summary) {
      const low = day.weather.low ?? day.weather.tempMin;
      const high = day.weather.high ?? day.weather.tempMax;
      lines.push(`天气：${day.weather.summary}${low != null && high != null ? `，${low}–${high}°C` : ''}${day.weather.climate ? '（气候估算）' : '（预报会变）'}`, '');
    }
    for (const item of day.items ?? []) {
      const time = item.start && item.end ? `${item.start}–${item.end}` : '';
      lines.push(`- **${time} ${item.title}**（${TYPE_LABELS[item.type] ?? item.type}）`);
      if (item.place?.name) {
        lines.push(`  - 地点：${item.place.name}${item.place.address ? `，${item.place.address}` : ''}`);
      }
      if (item.transit) {
        lines.push(`  - 交通：${TRANSIT_LABELS[item.transit.mode] ?? item.transit.mode} ${item.transit.durationMin ?? '?'} 分钟${item.transit.distanceKm ? `，约 ${item.transit.distanceKm} km` : ''}`);
      }
      if (item.cost?.amount != null) lines.push(`  - 费用：${formatCents(item.cost.amount * 100, item.cost.currency ?? meta.budget.currency)}`);
      if (item.booking?.required) lines.push(`  - 预约：${BOOKING_STATUS_LABELS[item.booking.status] ?? item.booking.status ?? '待确认'}${item.booking.url ? ` ${item.booking.url}` : ''}`);
      if (item.notes) lines.push(`  - 备注：${item.notes}`);
      if (item.sourceIds?.length) {
        const labels = item.sourceIds.map((id) => {
          const source = sourceById.get(id);
          if (!source) return id;
          return /^https?:\/\//.test(source.url ?? '') ? `[${source.title}](${source.url})` : source.title;
        });
        lines.push(`  - 来源：${labels.join('；')}`);
      }
    }
    lines.push('');
  }

  lines.push('## 预算', '');
  try {
    const summary = summarizeBudget(trip.budget, meta.budget.currency);
    lines.push(`合计：${formatRangeCents(summary.minCents, summary.maxCents, summary.currency)}`, '');
    lines.push('| 分类 | 下限 | 上限 |', '|---|---:|---:|');
    for (const category of summary.categories) {
      lines.push(`| ${category.label} | ${formatCents(category.minCents, summary.currency)} | ${formatCents(category.maxCents, summary.currency)} |`);
    }
  } catch (error) {
    lines.push(`预算数据有误：${error.message}`);
  }
  lines.push('');

  if (trip.packing?.length) {
    lines.push('## 行李清单', '');
    for (const item of trip.packing) lines.push(`- [ ] ${item.label}${item.essential ? '（必备）' : ''}`);
    lines.push('');
  }
  if (trip.bookingChecklist?.length) {
    lines.push('## 预约清单', '');
    for (const item of trip.bookingChecklist) {
      lines.push(`- [${item.status === 'done' ? 'x' : ' '}] ${item.label}${item.deadline ? `（截止 ${item.deadline}）` : ''}${item.url ? ` ${item.url}` : ''}`);
    }
    lines.push('');
  }
  if (trip.emergency?.contacts?.length) {
    lines.push('## 紧急联系', '');
    for (const contact of trip.emergency.contacts) lines.push(`- ${contact.label}：${contact.value}`);
    lines.push('');
  }
  lines.push('## 来源', '');
  for (const source of trip.sources ?? []) {
    lines.push(`- ${PROVIDER_LABELS[source.provider] ?? source.provider} · ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence}：${source.title || source.url}${source.url ? ` ${source.url}` : ''}（${source.retrievedAt}）`);
  }
  lines.push('', '---', '', '信息会变化；出行前以官方公告为准。');
  return lines.join('\n') + '\n';
}

export function buildSourcesMarkdown(trip) {
  const lines = ['# 数据来源与核验', '', `行程：${trip.meta.title}`, ''];
  lines.push('| 置信度 | 来源 | 内容 | 链接 | 抓取时间 | 许可 |', '|---|---|---|---|---|---|');
  for (const source of trip.sources ?? []) {
    lines.push(`| ${CONFIDENCE_LABELS[source.confidence] ?? source.confidence} | ${PROVIDER_LABELS[source.provider] ?? source.provider} | ${escapeCell(source.title)} | ${escapeCell(source.url)} | ${escapeCell(source.retrievedAt)} | ${escapeCell(source.license)} |`);
  }
  lines.push('', '## 未核实项', '');
  const unresolved = [];
  for (const day of trip.days ?? []) {
    for (const item of day.items ?? []) {
      if (!item.sourceIds?.length) unresolved.push(`${day.date} ${item.title}（无来源）`);
    }
  }
  if (!unresolved.length) lines.push('未发现无来源的锚点/餐饮。');
  else for (const line of unresolved) lines.push(`- ${line}`);
  lines.push('', '天气数据：Open-Meteo（CC BY 4.0）。地图数据：© OpenStreetMap contributors（ODbL）。背景资料：Wikimedia（CC BY-SA 4.0）。', '');
  return lines.join('\n');
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}
