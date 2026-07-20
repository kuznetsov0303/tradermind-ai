# SkillEdge AI - API Map Summary

Updated: 2026-07-15T20:32:18+03:00

Known important routes:
- GET /health
- GET /engine/status
- POST /engine/discovery/refresh
- GET /debug/candles/{SYMBOL}
- GET /engine/paper/status
- GET /engine/paper/trades
- GET /engine/paper/equity
- POST /engine/paper/evaluate-open
- POST /engine/paper/run-once
- POST /engine/paper/reset?confirm=RESET_50K

Safety:
- do not call paper run-once manually during realtime migration;
- do not reset the clean paper account.