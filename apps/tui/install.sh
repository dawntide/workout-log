#!/bin/sh
# ironlog installer — downloads the matching release binary into your PATH.
#
#   curl -fsSL https://raw.githubusercontent.com/sharru0701/workout-log/main/apps/tui/install.sh | sh
#
# Env overrides:
#   IRONLOG_VERSION=0.1.0          pin a version (default: latest release)
#   IRONLOG_INSTALL_DIR=~/.local/bin   install location (default: /usr/local/bin if writable, else ~/.local/bin)
set -eu

REPO="sharru0701/workout-log"
BIN="ironlog"

# --- detect OS ---
os=$(uname -s)
case "$os" in
  Linux) goos=linux ;;
  Darwin) goos=macos ;;
  *)
    echo "ironlog: 지원하지 않는 OS: $os" >&2
    echo "Windows는 Releases에서 .zip을 받으세요: https://github.com/$REPO/releases" >&2
    exit 1
    ;;
esac

# --- detect arch ---
arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) goarch=amd64 ;;
  aarch64 | arm64) goarch=arm64 ;;
  *)
    echo "ironlog: 지원하지 않는 아키텍처: $arch" >&2
    exit 1
    ;;
esac

# --- resolve version ---
ver="${IRONLOG_VERSION:-}"
if [ -z "$ver" ]; then
  ver=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | head -1 | sed -E 's/.*"v?([^"]+)".*/\1/')
fi
if [ -z "$ver" ]; then
  echo "ironlog: 최신 릴리스 버전을 확인하지 못했습니다. IRONLOG_VERSION을 지정하세요." >&2
  exit 1
fi
ver="${ver#v}"

tag="v$ver"
file="${BIN}_${ver}_${goos}_${goarch}.tar.gz"
url="https://github.com/$REPO/releases/download/$tag/$file"

# --- download + extract ---
echo "ironlog $ver ($goos/$goarch) 설치 중…"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if ! curl -fsSL "$url" -o "$tmp/$file"; then
  echo "ironlog: 다운로드 실패 — $url" >&2
  echo "버전/플랫폼을 확인하세요: https://github.com/$REPO/releases" >&2
  exit 1
fi
tar -xzf "$tmp/$file" -C "$tmp"

# --- install ---
dir="${IRONLOG_INSTALL_DIR:-}"
if [ -z "$dir" ]; then
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
    dir=/usr/local/bin
  else
    dir="$HOME/.local/bin"
  fi
fi
mkdir -p "$dir"
if command -v install >/dev/null 2>&1; then
  install -m 0755 "$tmp/$BIN" "$dir/$BIN"
else
  mv "$tmp/$BIN" "$dir/$BIN"
  chmod 0755 "$dir/$BIN"
fi

echo "설치 완료: $dir/$BIN"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "주의: $dir 가 PATH에 없습니다 →  export PATH=\"$dir:\$PATH\"" ;;
esac
echo "실행:  IRONLOG_API_URL=https://your-app.example.com $BIN"
