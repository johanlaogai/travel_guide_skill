import path from 'node:path';
import { loadTrip, saveTrip } from '../core/trip.mjs';
import { addDays, diffDays, todayInZone } from '../core/dates.mjs';
import { makeSource, dedupeSources } from '../core/provenance.mjs';
import { sha256 } from '../core/ids.mjs';
import { createContext } from './context.mjs';
import * as openMeteo from './providers/open-meteo.mjs';
import * as nominatim from './providers/nominatim.mjs';
import * as overpass from './providers/overpass.mjs';
import * as wikimedia from './providers/wikimedia.mjs';
import * as frankfurter from './providers/frankfurter.mjs';
import * as nager from './providers/nager.mjs';

export async function enrichTrip(tripPath, options = {}) {
  const trip = await loadTrip(tripPath);
  const ctx = createContext(options);
  const warnings = [];
  const added = { sources: 0, discoveries: 0, weatherDays: 0 };

  const destination = trip.meta.destination;
  if (!destination.name) throw new Error('trip.meta.destination.name 为空');

  let center = { lat: destination.lat, lon: destination.lon };

  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    try {
      const geo = await openMeteo.geocode(destination.name, {
        ...ctx,
        countryCode: destination.country === 'CN' ? 'CN' : undefined,
        count: 5,
      });
      const match = geo.results.find((entry) => !destination.country || entry.countryCode === destination.country)
        ?? geo.results[0];
      if (match) {
        center = { lat: match.lat, lon: match.lon };
        destination.lat = match.lat;
        destination.lon = match.lon;
        destination.admin1 = destination.admin1 || match.admin1 || '';
        destination.timezone = destination.timezone || match.timezone || 'Asia/Shanghai';
        destination.country = destination.country || match.countryCode || 'CN';
        const source = makeSource({
          provider: 'open-meteo',
          kind: 'geocode',
          title: `Open-Meteo 地理编码：${destination.name}`,
          url: match.sourceUrl,
          transport: geo.transport,
          confidence: 'verified',
          rawHash: sha256(match.raw),
        });
        added.sources += addSource(trip, source);
      }
    } catch (error) {
      warnings.push(`Open-Meteo 地理编码失败：${error.message}`);
    }
  }

  if ((!Number.isFinite(center.lat) || !Number.isFinite(center.lon)) && destination.name) {
    try {
      const result = await nominatim.search(destination.name, {
        ...ctx,
        countryCode: destination.country === 'CN' ? 'cn' : undefined,
        limit: 5,
      });
      const match = result.results[0];
      if (match) {
        center = { lat: match.lat, lon: match.lon };
        destination.lat = match.lat;
        destination.lon = match.lon;
        destination.country = destination.country || match.address?.country_code?.toUpperCase() || 'CN';
        const source = makeSource({
          provider: 'nominatim',
          kind: 'geocode',
          title: `Nominatim 地理编码：${destination.name}`,
          url: result.url,
          transport: result.transport,
          confidence: 'verified',
          rawHash: sha256(match.raw),
        });
        added.sources += addSource(trip, source);
      }
    } catch (error) {
      warnings.push(`Nominatim 地理编码失败：${error.message}`);
    }
  }

  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    warnings.push('没有拿到目的地坐标；地图、天气、POI 查询将跳过。请手动补 meta.destination.lat/lon。');
  }

  const timezone = destination.timezone || 'Asia/Shanghai';
  const today = options.today ?? todayInZone(timezone, options.now ?? new Date());
  const startOffset = diffDays(today, trip.meta.startDate);
  if (Number.isFinite(center.lat) && Number.isFinite(center.lon) && startOffset <= 16) {
    try {
      const weather = await openMeteo.forecast({
        lat: center.lat,
        lon: center.lon,
        startDate: trip.meta.startDate,
        endDate: trip.meta.endDate,
        timezone,
      }, ctx);
      const source = makeSource({
        provider: 'open-meteo',
        kind: 'weather',
        title: `Open-Meteo 预报：${destination.name} ${trip.meta.startDate}–${trip.meta.endDate}`,
        url: weather.url,
        transport: weather.transport,
        confidence: 'forecast',
        rawHash: weather.rawHash,
        note: '天气预报会变化；出行前请刷新。',
      });
      added.sources += addSource(trip, source);
      for (const day of trip.days) {
        const forecast = weather.days.find((entry) => entry.date === day.date);
        if (!forecast) continue;
        const label = openMeteo.weatherLabel(forecast.weatherCode);
        day.weather = {
          sourceId: source.id,
          summary: label,
          weatherCode: forecast.weatherCode,
          high: forecast.tempMax,
          low: forecast.tempMin,
          precipitationProbability: forecast.precipitationProbability,
          precipitationSum: forecast.precipitationSum,
          sunrise: forecast.sunrise,
          sunset: forecast.sunset,
          updatedAt: source.retrievedAt,
        };
        added.weatherDays += 1;
      }
    } catch (error) {
      warnings.push(`Open-Meteo 天气失败：${error.message}`);
    }
  } else if (startOffset > 16) {
    warnings.push('行程超过 16 天，Open-Meteo 预报不可用；请只写气候估算，不要写当天预报。');
    if (Number.isFinite(center.lat) && Number.isFinite(center.lon)) {
      try {
        const lastYearStart = addDays(trip.meta.startDate, -365);
        const lastYearEnd = addDays(trip.meta.endDate, -365);
        const climate = await openMeteo.archive({
          lat: center.lat,
          lon: center.lon,
          startDate: lastYearStart,
          endDate: lastYearEnd,
          timezone,
        }, ctx);
        const source = makeSource({
          provider: 'open-meteo',
          kind: 'weather',
          title: `Open-Meteo 历史气候（${lastYearStart}–${lastYearEnd}）`,
          url: climate.url,
          transport: climate.transport,
          confidence: 'estimate',
          rawHash: climate.rawHash,
          note: '不是当天预报，仅作气候参考。',
        });
        added.sources += addSource(trip, source);
        for (const [index, day] of trip.days.entries()) {
          const record = climate.days[index];
          if (!record) continue;
          day.weather = {
            sourceId: source.id,
            summary: `${openMeteo.weatherLabel(record.weatherCode)}（历史气候）`,
            high: record.tempMax,
            low: record.tempMin,
            precipitationProbability: null,
            climate: true,
            updatedAt: source.retrievedAt,
          };
          added.weatherDays += 1;
        }
      } catch (error) {
        warnings.push(`Open-Meteo 历史气候失败：${error.message}`);
      }
    }
  }

  if (Number.isFinite(center.lat) && Number.isFinite(center.lon) && options.pois !== false) {
    try {
      const result = await overpass.around(center.lat, center.lon, {
        ...ctx,
        radius: options.radius ?? 5000,
        limit: options.maxPois ?? 30,
      });
      const source = makeSource({
        provider: 'overpass',
        kind: 'poi',
        title: `Overpass 周边 POI：${destination.name}`,
        url: result.url,
        transport: result.transport,
        confidence: 'community',
        rawHash: result.rawHash,
        note: 'OSM 标签，开放时间/票价请以官方为准。',
      });
      added.sources += addSource(trip, source);
      const existing = new Set((trip.discoveries ?? []).map((poi) => poi.osmId ? `${poi.osmType}/${poi.osmId}` : poi.name));
      for (const poi of result.pois) {
        const key = poi.osmId ? `${poi.osmType}/${poi.osmId}` : poi.name;
        if (existing.has(key)) continue;
        existing.add(key);
        trip.discoveries.push({
          id: `poi-${poi.osmType ?? 'node'}-${poi.osmId ?? added.discoveries}`,
          name: poi.name,
          category: poi.category,
          lat: poi.lat,
          lon: poi.lon,
          osmType: poi.osmType,
          osmId: poi.osmId,
          address: poi.address,
          openingHours: poi.openingHours,
          fee: poi.fee,
          website: poi.website,
          wikidata: poi.wikidata,
          sourceIds: [source.id],
          confidence: 'community',
        });
        added.discoveries += 1;
      }
    } catch (error) {
      warnings.push(`Overpass POI 失败：${error.message}`);
    }
  }

  try {
    const wiki = await wikimedia.extract(destination.name, { ...ctx, site: 'wikipedia' });
    if (wiki.page?.extract) {
      const source = makeSource({
        provider: 'wikimedia',
        kind: 'wiki',
        title: `维基百科：${wiki.page.title}`,
        url: wiki.page.fullUrl ?? wiki.url,
        transport: wiki.transport,
        confidence: 'community',
        rawHash: wiki.rawHash,
        note: '背景资料，不作为票价/开放时间依据。',
      });
      added.sources += addSource(trip, source);
      if (!trip.overview.background) trip.overview.background = wiki.page.extract;
      if (!trip.overview.summary) trip.overview.summary = wiki.page.extract.slice(0, 280);
      const coords = wiki.page.coordinates;
      if (coords && (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lon))) {
        destination.lat = coords.lat;
        destination.lon = coords.lon;
        center = { lat: coords.lat, lon: coords.lon };
      }
    }
  } catch (error) {
    warnings.push(`Wikimedia 背景失败：${error.message}`);
  }

  if (trip.meta.budget.currency && trip.meta.budget.currency !== 'CNY') {
    try {
      const fx = await frankfurter.rate('CNY', trip.meta.budget.currency, ctx);
      trip.meta.fx = {
        base: 'CNY',
        quote: trip.meta.budget.currency,
        rate: fx.rate,
        date: fx.date,
        sourceId: null,
      };
      const source = makeSource({
        provider: 'frankfurter',
        kind: 'fx',
        title: `Frankfurter 汇率：CNY→${trip.meta.budget.currency}`,
        url: fx.url,
        transport: fx.transport,
        confidence: 'estimate',
        rawHash: fx.rawHash,
      });
      added.sources += addSource(trip, source);
      trip.meta.fx.sourceId = source.id;
    } catch (error) {
      warnings.push(`Frankfurter 汇率失败：${error.message}`);
    }
  }

  if (trip.meta.destination.country) {
    try {
      const year = Number(trip.meta.startDate.slice(0, 4));
      const result = await nager.publicHolidays(year, trip.meta.destination.country, ctx);
      const inRange = result.holidays.filter((holiday) => holiday.date >= trip.meta.startDate && holiday.date <= trip.meta.endDate);
      if (inRange.length) {
        const source = makeSource({
          provider: 'nager',
          kind: 'holiday',
          title: `公共假期：${trip.meta.destination.country} ${year}`,
          url: result.url,
          transport: result.transport,
          confidence: 'official',
          rawHash: result.rawHash,
        });
        added.sources += addSource(trip, source);
        trip.meta.holidays = inRange.map((holiday) => ({
          date: holiday.date,
          name: holiday.localName ?? holiday.name,
          sourceId: source.id,
        }));
      }
    } catch (error) {
      warnings.push(`Nager 假期失败：${error.message}`);
    }
  }

  trip.sources = dedupeSources(trip.sources);
  trip.provenance.lastCheckedAt = new Date().toISOString();
  await saveTrip(tripPath, trip);
  return { trip, warnings, added, cacheDir: path.resolve(ctx.cacheDir) };
}

function addSource(trip, source) {
  if (!trip.sources.some((entry) => entry.id === source.id)) {
    trip.sources.push(source);
    return 1;
  }
  return 0;
}
