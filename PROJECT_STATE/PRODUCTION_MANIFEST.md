# SkillEdge AI - Production Manifest Summary

Updated: 2026-07-15T20:32:18+03:00

Local repository:
- C:\Users\milli\OneDrive\Рабочий стол\tradermind\tradermind-ai

Local backend mirror:
- services/stock-engine

Production VPS:
- 178.104.184.138

Production engine:
- /opt/skilledge/stock-engine

Production FastAPI:
- /opt/skilledge/stock-engine/app/api/app.py

Production API service:
- skilledge-stock-engine-api.service

Historical learning lake:
- /opt/skilledge/stock-engine/data/historical_learning

Deployment rule:
Never perform a blind full local-tree overwrite of production.

Every deployment must:
- identify exact changed files;
- create rollback material;
- run static checks first;
- deploy only scoped files;
- restart only required services;
- run health/runtime smoke;
- update PROJECT_STATE;
- record the milestone.