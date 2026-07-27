#!/bin/bash
# Installs the launchd agent that runs Jarvis's daily pass at 8:00 AM.
# Re-run any time to update; remove with:
#   launchctl unload ~/Library/LaunchAgents/com.jarvis.daily.plist && rm ~/Library/LaunchAgents/com.jarvis.daily.plist
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$HOME/.local/node/bin"
PLIST="$HOME/Library/LaunchAgents/com.jarvis.daily.plist"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jarvis.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN/npm</string>
    <string>run</string>
    <string>daily</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_BIN:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/daily.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/daily.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed: Jarvis daily job runs at 8:00 AM. Logs: $LOG_DIR/daily.log"
