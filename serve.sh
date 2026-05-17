#!/bin/bash
PORT="${PORT:-3456}"
cd /Users/teppei/Desktop/shift-calendar
exec python3 -m http.server "$PORT"
