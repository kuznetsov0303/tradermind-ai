
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json, os, sys, time, traceback, urllib.parse, urllib.request
VERSION="s9_08b_universe_v1_overnight_backfill_runner_v1"
ENGINE=Path('/opt/skilledge/stock-engine')
DATA=ENGINE/'data'
CSV=DATA/'universe/skilledge_universe_v1_liquid_stocks_symbols.csv'
OUT=DATA/'historical_learning/universe_v1_overnight_backfill'
OUT.mkdir(parents=True, exist_ok=True)
QUEUE=OUT/'jobs_s908b_universe_v1_overnight_backfill.jsonl'
PROGRESS=OUT/'progress_s908b_universe_v1_overnight_backfill.json'
LATEST=OUT/'latest_s908b_universe_v1_overnight_backfill.json'
START=os.getenv('S908B_START_DATE','2021-07-12')
END=os.getenv('S908B_END_DATE','2026-07-10')
MAX_SYMBOLS=int(os.getenv('S908B_MAX_SYMBOLS','150'))
SYMS_PER_JOB=int(os.getenv('S908B_SYMBOLS_PER_JOB','10'))
DAYS_PER_JOB=int(os.getenv('S908B_DAYS_PER_JOB','5'))
MAX_JOBS=int(os.getenv('S908B_MAX_JOBS_PER_RUN','80'))
SLEEP=int(os.getenv('S908B_SLEEP_SECONDS','2'))
REBUILD=os.getenv('S908B_REBUILD_QUEUE','false').lower()=='true'
BASE='http://127.0.0.1:8000'
CORE={"TSLA","NVDA","AAPL","MSFT","META","GOOGL","AMZN","AMD","SMCI","PLTR","NOW","NFLX","MSTR","CRWD","CRM","COIN","AVGO","XOS","RGNT","PAVS","OLOX","NTAP","JZXN","HPE","HPAI"}

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
def d(s): return datetime.strptime(s,'%Y-%m-%d').date()
def weekdays(a,b):
    cur=d(a); end=d(b)
    while cur<=end:
        if cur.weekday()<5: yield cur
        cur += timedelta(days=1)
def chunks(xs,n):
    for i in range(0,len(xs),max(1,n)): yield xs[i:i+n]
def symbols():
    if not CSV.exists(): raise RuntimeError(f'Missing universe CSV: {CSV}. Run S9.07 first.')
    raw=CSV.read_text(encoding='utf-8').replace('\n',',')
    out=[]; seen=set()
    for x in raw.split(','):
        s=x.strip().upper()
        if s and s not in seen:
            seen.add(s); out.append(s)
    return out[:MAX_SYMBOLS]
def read_jobs():
    if not QUEUE.exists(): return []
    jobs=[]
    for line in QUEUE.read_text(encoding='utf-8').splitlines():
        try:
            if line.strip(): jobs.append(json.loads(line))
        except Exception: pass
    return jobs
def save_jobs(jobs):
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE.write_text('\n'.join(json.dumps(j,ensure_ascii=False,default=str) for j in jobs)+'\n',encoding='utf-8')
def write(path,payload): path.write_text(json.dumps(payload,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
def build_queue(force=False):
    if QUEUE.exists() and not force:
        jobs=read_jobs()
        if jobs: return jobs, False
    syms=symbols(); days=list(weekdays(START,END)); jobs=[]; i=0
    for dg in chunks(days,DAYS_PER_JOB):
        for sg in chunks(syms,SYMS_PER_JOB):
            i+=1; jobs.append({'jobId':f's908b_job_{i:06d}','status':'READY','symbols':sg,'startDate':dg[0].isoformat(),'endDate':dg[-1].isoformat(),'interval':'5min','maxCandidates':25000,'researchOnly':True,'syncSupabase':False,'clientReleaseAllowed':False,'telegramAllowed':False,'productionEligible':False})
    if QUEUE.exists(): QUEUE.rename(QUEUE.with_name(QUEUE.name+'.bak_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')))
    save_jobs(jobs)
    report={'ok':True,'storageVersion':VERSION,'createdAt':now(),'mode':'research_only','summary':{'symbolCount':len(syms),'core25Included':all(s in syms for s in CORE),'weekdayCount':len(days),'symbolsPerJob':SYMS_PER_JOB,'daysPerJob':DAYS_PER_JOB,'jobCount':len(jobs),'maxJobsPerRun':MAX_JOBS,'estimatedSymbolDays':len(syms)*len(days)},'queueFile':str(QUEUE),'progressFile':str(PROGRESS),'policy':policy()}
    write(LATEST,report); return jobs, True
def policy(): return {'researchOnly':True,'syncSupabase':False,'clientReleaseAllowed':False,'telegramAllowed':False,'productionEligible':False,'note':'Research-only controlled backfill for strategy/rule learning, not client ticker recommendations.'}
def progress(stage,jobs,started,last=None,ran=0):
    p={'ok':True,'storageVersion':VERSION,'stage':stage,'totalJobs':len(jobs),'completedJobs':sum(j.get('status')=='COMPLETED' for j in jobs),'failedJobs':sum(j.get('status')=='FAILED' for j in jobs),'runningJobs':sum(j.get('status')=='RUNNING' for j in jobs),'remainingJobs':sum(j.get('status') not in ('COMPLETED','FAILED') for j in jobs),'jobsRanThisSession':ran,'maxJobsPerRun':MAX_JOBS,'startedAt':started,'updatedAt':now(),'lastJob':last,'policy':policy()}
    write(PROGRESS,p); return p
def post(path,params,timeout=1800):
    url=BASE+path+'?'+urllib.parse.urlencode(params,doseq=True)
    req=urllib.request.Request(url,method='POST')
    with urllib.request.urlopen(req,timeout=timeout) as r: txt=r.read().decode('utf-8','replace')
    try: return json.loads(txt)
    except Exception: return {'ok':False,'raw':txt[:3000]}
def step(name,path,params):
    try:
        p=post(path,params); return {'name':name,'ok':bool(p.get('ok')),'summary':p.get('summary'),'errorCount':len(p.get('errors') or [])}
    except Exception as e: return {'name':name,'ok':False,'error':repr(e),'traceback':traceback.format_exc()[-2500:]}
def run_job(job):
    base={'symbols':','.join(job['symbols']),'start_date':job['startDate'],'end_date':job['endDate'],'intervals':job['interval'],'publish':'true'}
    steps=[]
    steps.append(step('ingestion_robust_fmp','/engine/research/historical-learning/ingestion/run-robust-fmp',base))
    steps.append(step('features_robust','/engine/research/historical-learning/features/build-robust',base))
    rp=dict(base); rp['max_candidates']=job.get('maxCandidates',25000)
    steps.append(step('setup_replay_robust','/engine/research/historical-learning/setup-replay/run-robust',rp))
    op=dict(rp); op['sync_supabase']='false'
    steps.append(step('outcomes_robust','/engine/research/historical-learning/outcomes/run-robust',op))
    return {'ok':all(s.get('ok') for s in steps),'steps':steps}
def main():
    jobs,created=build_queue(REBUILD); started=now(); ran=0
    for j in jobs:
        if j.get('status')=='RUNNING': j['status']='READY'; j['recoveredFromRunningAt']=now()
    save_jobs(jobs); progress('running',jobs,started,ran=0)
    for job in jobs:
        if ran>=MAX_JOBS: break
        if job.get('status')=='COMPLETED': continue
        job['status']='RUNNING'; job['startedAt']=now(); save_jobs(jobs)
        progress('running',jobs,started,{'jobId':job['jobId'],'symbols':job['symbols'],'startDate':job['startDate'],'endDate':job['endDate'],'status':'RUNNING'},ran)
        res=run_job(job); job['result']=res; job['completedAt']=now(); job['status']='COMPLETED' if res.get('ok') else 'FAILED'; ran+=1; save_jobs(jobs)
        progress('running',jobs,started,{'jobId':job['jobId'],'symbols':job['symbols'],'startDate':job['startDate'],'endDate':job['endDate'],'status':job['status'],'result':res},ran)
        time.sleep(max(0,SLEEP))
    jobs=read_jobs(); rem=sum(j.get('status') not in ('COMPLETED','FAILED') for j in jobs); final=progress('completed' if rem==0 else 'paused_after_limit',jobs,started,ran=ran); final['completedAt']=now(); write(PROGRESS,final)
    print(json.dumps({'ok':True,'storageVersion':VERSION,'queueCreated':created,'stage':final['stage'],'completedJobs':final['completedJobs'],'failedJobs':final['failedJobs'],'remainingJobs':final['remainingJobs'],'jobsRanThisSession':ran,'progressFile':str(PROGRESS),'queueFile':str(QUEUE),'policy':policy()},ensure_ascii=False,indent=2,default=str))
if __name__=='__main__': main()
