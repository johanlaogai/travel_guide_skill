const COMMANDS = new Map([
  ['init', '创建 trip.json / expenses.csv 骨架'],
  ['dates', '计算日期、星期、假期与请假天数'],
  ['enrich', '拉取地理编码、POI、天气、Wiki、假期、汇率'],
  ['import', '导入小红书/文字/截图攻略'],
  ['check', '校验行程、来源、交通、预算'],
  ['build', '生成交互 HTML、Markdown、ICS、来源台账'],
  ['expenses', '记账汇总与多人结算'],
  ['doctor', '环境与数据源体检'],
  ['demo', '离线构建广州示例'],
]);

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (!COMMANDS.has(command)) {
    console.error(`未知命令：${command}\n`);
    printHelp();
    process.exitCode = 2;
    return;
  }
  const mod = await import(`./commands/${command}.mjs`);
  const result = await mod.run(rest);
  if (typeof result === 'number') process.exitCode = result;
}

function printHelp() {
  console.log(`travel-guide v0.1.0

用法：node bin/travel-guide.mjs <command> [options]

命令：`);
  for (const [name, description] of COMMANDS) {
    console.log(`  ${name.padEnd(10)} ${description}`);
  }
  console.log(`
示例：
  node bin/travel-guide.mjs init --destination 广州 --start 2026-11-28 --days 3 --out trips/guangzhou
  node bin/travel-guide.mjs enrich --trip trips/guangzhou/trip.json
  node bin/travel-guide.mjs check --trip trips/guangzhou/trip.json --strict
  node bin/travel-guide.mjs build --trip trips/guangzhou/trip.json --out trips/guangzhou/dist
  node bin/travel-guide.mjs demo --out .tmp/demo

数据来源：Open-Meteo / Nominatim / Overpass / Wikimedia / 官方页面；
TikHub 为可选付费导入，默认关闭。详见 README.md 与 docs/data-sources.md。`);
}
