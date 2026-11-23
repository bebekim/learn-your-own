import sqlite3,json,pathlib,hashlib,collections
s=json.load(open('/tmp/lyo-traceability-snapshot.json'));out={'local_sources':[],'generic_followup':[],'historical_report':{}}
def safe(v):return {k:v[k] for k in ['exit_code','test_summary','success','recorded','status','code','retryable'] if k in v} if isinstance(v,dict) else None
by_path=collections.defaultdict(set)
for e in s['hook_evidence']:by_path[e['db_path']].add(e['event_id'])
for path,ids in by_path.items():
 p=pathlib.Path(path)
 if not p.exists():out['local_sources'].append({'path':path,'exists':False});continue
 try:
  c=sqlite3.connect(f'file:{p}?mode=ro',uri=True);c.row_factory=sqlite3.Row
  for eid in ids:
   for r in c.execute('select * from hook_events where event_id=?',(eid,)):
    q=json.loads(r['payload_json']);out['local_sources'].append({'path':path,'exists':True,'event_id':eid,'session_id':r['session_id'],'created_at':r['created_at'],'payload_sha256':hashlib.sha256(r['payload_json'].encode()).hexdigest(),'response_signals':safe(q.get('tool_response')),'error_signals':safe(q.get('error')),'event_name':r['event_name']})
  c.close()
 except Exception as e:out['local_sources'].append({'path':path,'error':str(e)})
p=pathlib.Path.home()/'.zeroshot/azure-beacon-8.db';c=sqlite3.connect(f'file:{p}?mode=ro',uri=True);c.row_factory=sqlite3.Row
for r in c.execute("select id,timestamp,topic,sender,content_text,content_data from messages where topic in ('LYO_FEEDBACK','LYO_INTERVENTION','USER_GUIDANCE_AGENT') order by timestamp,id"):
 d=dict(r);d['content_text']=(d['content_text'] or '')[:2200];d['content_data']=(d['content_data'] or '')[:2200];out['generic_followup'].append(d)
c.close()
path=s['lessons'][2]['explanation']['report'];raw=pathlib.Path(path).read_bytes();q=json.loads(raw);out['historical_report']={'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'type':type(q).__name__,'keys':list(q)[:20] if isinstance(q,dict) else None}
pathlib.Path('/tmp/lyo-traceability-local-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
