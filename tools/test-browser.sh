#!/bin/zsh
# Invisible test browser for KSV: a separate Helium with its own profile and no window
# (headless), driven by tools/cdp.mjs. It never opens, moves or focuses your own windows.
# Serve site/ first (the dev server on :8124), then open it with cdp.mjs.
#   test-browser.sh start    headless, in the background
#   test-browser.sh stop
#   test-browser.sh status
set -e

PROFILE="$HOME/Library/Application Support/KSV Test"
PORT=9334
HELIUM=/Applications/Helium.app/Contents/MacOS/Helium
FLAGS=(
  --user-data-dir="$PROFILE"
  --remote-debugging-port=$PORT
  # No macOS keychain prompt: this profile's cookies use a stand-in key
  --use-mock-keychain
  --mute-audio
  --no-first-run
  --no-default-browser-check
)

running() { pgrep -f -- "--user-data-dir=$PROFILE" >/dev/null; }
stop() {
  pkill -f -- "--user-data-dir=$PROFILE" 2>/dev/null || true
  while running; do sleep 0.2; done
}
wait_ready() {
  for i in {1..50}; do
    curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null && return 0
    sleep 0.2
  done
  echo "Test browser didn't start" >&2
  return 1
}

case "$1" in
  start)
    stop
    nohup "$HELIUM" $FLAGS --headless=new --window-size=1440,900 about:blank >/dev/null 2>&1 &
    wait_ready && echo "Test browser running (headless) on port $PORT"
    ;;
  stop)
    stop && echo "Stopped"
    ;;
  status)
    running && echo "Running" || echo "Not running"
    ;;
  *)
    echo "usage: test-browser.sh start|stop|status" >&2
    exit 1
    ;;
esac
