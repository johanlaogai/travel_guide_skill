#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="${DSH_SKILLS_DIR:-$HOME/.dsh/skills}"
TARGET="$SKILLS_DIR/travel-guide"
MODE="symlink"
FORCE="0"

for arg in "$@"; do
  case "$arg" in
    --copy) MODE="copy" ;;
    --force) FORCE="1" ;;
    -h|--help)
      echo "用法: $0 [--copy] [--force]"
      echo "  --copy   复制到目标目录（默认 symlink）"
      echo "  --force  目标已存在且不是 symlink 时，先备份再安装"
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$ROOT/SKILL.md" ]; then
  echo "找不到 $ROOT/SKILL.md；请在仓库根目录运行。" >&2
  exit 1
fi

mkdir -p "$SKILLS_DIR"

if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  if [ "$MODE" = "symlink" ]; then
    # 替换已有 symlink；如果目标是非 symlink 目录，需要 --force 并备份。
    if [ ! -L "$TARGET" ]; then
      if [ "$FORCE" != "1" ]; then
        echo "目标已存在且不是 symlink：$TARGET" >&2
        echo "确认要备份并替换时加 --force。" >&2
        exit 1
      fi
      BACKUP="$TARGET.bak.$(date +%Y%m%d%H%M%S)"
      mv "$TARGET" "$BACKUP"
      echo "已备份旧目录到 $BACKUP"
    fi
  else
    if [ "$FORCE" != "1" ]; then
      echo "目标已存在：$TARGET；加 --force 备份并覆盖。" >&2
      exit 1
    fi
    BACKUP="$TARGET.bak.$(date +%Y%m%d%H%M%S)"
    mv "$TARGET" "$BACKUP"
    echo "已备份旧目录到 $BACKUP"
  fi
fi

if [ "$MODE" = "symlink" ]; then
  ln -sfn "$ROOT" "$TARGET"
  echo "✓ 已 symlink: $TARGET -> $ROOT"
else
  cp -R "$ROOT" "$TARGET"
  echo "✓ 已复制: $ROOT -> $TARGET"
fi

echo
echo "验证："
echo "  node \"$TARGET/bin/travel-guide.mjs\" doctor"
