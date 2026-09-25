#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if [[ ! -x .venv/bin/python ]]; then
  echo '请先按 README 安装语音环境。'
  read -r
  exit 1
fi
.venv/bin/python server.py
