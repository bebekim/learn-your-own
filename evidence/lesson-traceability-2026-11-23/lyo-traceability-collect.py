import sqlite3,json,pathlib,hashlib,datetime,sys
out=pathlib.Path(sys.argv[1]);out.parent.mkdir(parents=True,exist_ok=True)
def db(path):
 c=sqlite3.connect(f'file:{path}?mode=ro',uri=True);c.row_factory=sqlite3.Row;c.execute('pragma query_only=ON');c.execute('BEGIN');return c
def decode(v):
 try:return json.loads(v)
 except:return None
def digest(v):return hashlib.sha256(v.encode()).hexdigest()
s=db(pathlib.Path.home()/'.zeroshot/lyo-lessons.db'); c=db(pathlib.Path.home()/'.lyo/corpus.sqlite')
lessons=[];refs=set();runids=set()
for row in s.execute('select * from lesson order by created_at,lesson_id'):
 row=dict(row);exp=decode(row['explanation']);prov=decode(row['provenance']) or [];runids.update(prov)
 entry={k:row[k] for k in ['lesson_id','status','failure_class','trigger_cue','intervention','uses','created_at','updated_at','helpful_count','harmful_count','reflector_model','executor_model']}
 entry.update(explanation=exp if isinstance(exp,dict) else row['explanation'],provenance=prov,lesson_row_sha256=digest(json.dumps(row,sort_keys=True)))
 deltas=[]
 for dr in s.execute('select rowid,* from lesson_delta where lesson_id=? order by rowid',(row['lesson_id'],)):
  d=dict(dr);p=decode(d.get('payload','')) or {};e=decode(p.get('explanation',''))
  keep={k:d.get(k) for k in ['rowid','run_id','actor','delta_type','created_at'] if k in d}
  keep.update(payload_sha256=digest(d.get('payload','')),explanation=e if isinstance(e,dict) else p.get('explanation'),intervention=p.get('intervention'),reflector=p.get('reflector'),reflector_model=p.get('reflector_model'))
  deltas.append(keep)
  if d.get('run_id'):runids.add(d['run_id'])
  if isinstance(e,dict):refs.update(e[k] for k in ['failureRef','recoveryRef'] if e.get(k))
 if isinstance(exp,dict):
  refs.update(exp[k] for k in ['failureRef','recoveryRef'] if exp.get(k))
  for pair in exp.get('evidence',[]):
   refs.update('hook:'+pair[phase]['eventId'] for phase in ['failure','recovery'] if pair.get(phase,{}).get('eventId'))
 entry['deltas']=deltas
 entry['applications']=[{k:v for k,v in dict(r).items() if k in ['application_id','run_id','outcome','counted','applied_at','decision_id']} for r in s.execute('select * from lesson_application where lesson_id=? order by rowid',(row['lesson_id'],))]
 lessons.append(entry)
ids=[r.removeprefix('hook:') for r in refs if r.startswith('hook:')];events=[]
if ids:
 query='select e.*,l.db_path,l.workspace_root from corpus_events e join sync_ledgers l on l.ledger_id=e.source_ledger_id where e.event_id in ('+','.join('?' for _ in ids)+')'
 for r in c.execute(query,ids):
  r=dict(r);p=decode(r['payload_json']) or {};result=p.get('tool_response');err=p.get('error');command=p.get('tool_input',{})
  if isinstance(command,dict):command=command.get('command',command.get('cmd'))
  def signal(v):
   if not isinstance(v,dict):return None
   return {k:v[k] for k in ['exit_code','success','status','test_summary','shape','recorded','code','retryable'] if k in v}
  events.append({k:r[k] for k in ['source_ledger_id','event_id','session_id','turn_id','event_name','cwd','model','lyo_version','created_at','imported_at','db_path','workspace_root']} | {'command':command,'payload_sha256':digest(r['payload_json']),'runtime':p.get('_lyo',{}).get('runtime'),'response_signals':signal(result),'error_signals':signal(err),'tool_use_id':p.get('tool_use_id')})
source_runs=[];trace_meta=[]
if runids:
 args=list(runids);ph=','.join('?' for _ in args)
 source_runs=[dict(r) for r in c.execute('select source_ledger_id,run_id,task_shape,channel,status,created_at from corpus_runs where run_id in ('+ph+')',args)]
 for r in s.execute('select trace_id,run_id,kind,ref,payload_json,created_at from learning_trace where run_id in ('+ph+')',args):
  r=dict(r);p=decode(r.pop('payload_json')) or {};r['source']=p.get('source') if isinstance(p,dict) else None
  if r['source']=='native-session-observation':r.update(commands=p.get('commands'),createdLessonIds=p.get('createdLessonIds'),causalCredit=p.get('causalCredit'),closure=p.get('closure'))
  trace_meta.append(r)
result={'audited_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'all lesson rows in the personal store at read snapshot; evidence lookup in separately opened central-corpus snapshot','lesson_count':len(lessons),'lessons':lessons,'hook_evidence':events,'unresolved_hook_refs':sorted(refs-{'hook:'+e['event_id'] for e in events}),'source_runs':source_runs,'trace_metadata':trace_meta}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'out':str(out),'lessons':len(lessons),'hook_rows':len(events),'unresolved':result['unresolved_hook_refs'],'source_runs':len(source_runs),'trace_rows':len(trace_meta)}))
s.close();c.close()
