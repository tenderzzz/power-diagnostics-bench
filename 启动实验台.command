#!/bin/zsh
cd "${0:A:h}" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print "需要 Node.js 20 或更新版本。安装后重新打开此文件。"
  read -r "?按回车关闭…"
  exit 1
fi
node scripts/serve.mjs --open
