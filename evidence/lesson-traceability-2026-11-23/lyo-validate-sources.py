import json,pathlib,sqlite3,hashlib,re,collections
s=json.load(open('/tmp/lyo-traceability-snapshot.json'));out={'historical_transcripts':[],'generic_source':{},'local_hook_evidence':[]}
def sha(t):return hashlib.sha256(t.encode()).hexdigest()
p=pathlib.Path.home()/'.zeroshot/azure-beacon-8.db';c=sqlite3.connect(f'file:{p}?mode=ro',uri=True);c.row_factory=sqlite3.Row
out['generic_source']['path']=str(p);out['generic_source']['topics']=[list(r) for r in c.execute('select topic,count(*) from messages group by topic')];out['generic_source']['messages']=[]
for r in c.execute('select id,timestamp,topic,sender,content_text,content_data from messages order by timestamp,id'):
 text=r['content_text'] or '';data=r['content_data'] or '';combined=text+'\n'+data
 if not re.search(r'AC[123]|Hello, Ada|Hi, Ada|greet\.js|stateless|stateful|alternat|conflict',combined,re.I):continue
 lines=[x[:700] for x in combined.splitlines() if re.search(r'AC[123]|Hello, Ada|Hi, Ada|greet\.js|stateless|stateful|alternat|conflict',x,re.I)]
 out['generic_source']['messages'].append({k:r[k] for k in ['id','timestamp','topic','sender']}|{'content_sha256':sha(combined),'excerpts':lines[:12]})
c.close()
requests=collections.defaultdict(list)
for l in s['lessons']:
 e=l['explanation']
 if not isinstance(e,dict):continue
 for pair in e.get('evidence',[]):
  for phase in ['failure','recovery']:
   ev=pair[phase];requests[ev['transcriptPath']].append((l['lesson_id'],pair['sessionId'],phase,ev,e['command']))
for path,rs in requests.items():
 p=pathlib.Path(path);calls={};outputs={}
 if p.exists():
  for n,line in enumerate(p.open(),1):
   try:r=json.loads(line)
   except:continue
   q=r.get('payload',{});cid=q.get('call_id')
   if not cid or cid not in {t[3]['callId'] for t in rs}:continue
   if q.get('type') in ['function_call','custom_tool_call']:calls[cid]=(n,q)
   if q.get('type') in ['function_call_output','custom_tool_call_output']:outputs[cid]=(n,q)
 for lid,sid,phase,ev,cmd in rs:
  call=calls.get(ev['callId']);output=outputs.get(ev['callId']);v=output[1].get('output') if output else None
  args=call[1].get('arguments') if call else None
  try:args=json.loads(args) if isinstance(args,str) else args
  except:args=None
  actualcmd=args.get('cmd',args.get('command')) if isinstance(args,dict) else None
  workdir=args.get('workdir') if isinstance(args,dict) else None
  prefix=v.split('Output:',1)[0].split('Final output:',1)[0] if isinstance(v,str) else ''
  match=re.search(r'^(?:Exit code:|Process exited with code)\s*(-?\d+)\s*$',prefix,re.M)
  out['historical_transcripts'].append({'lesson_id':lid,'sessionId':sid,'phase':phase,'path':path,'callId':ev['callId'],'eventId':ev['eventId'],'exists':p.exists(),'call_line':call[0] if call else None,'output_line':output[0] if output else None,'declared_line':ev['line'],'command_matches':actualcmd==cmd if isinstance(actualcmd,str) else None,'workdir_matches':workdir==ev.get('explicitWorkdir') if call else None,'output_hash_matches':sha(v)==ev['outputSha256'] if isinstance(v,str) else None,'header_exit':int(match[1]) if match else None,'declared_exit':ev['exitCode'],'output_type':type(v).__name__})
p=pathlib.Path('.claude/worktrees/account-ban-chat-backup-4cf3f3/.agent-learning/learning.sqlite').resolve();c=sqlite3.connect(f'file:{p}?mode=ro',uri=True);c.row_factory=sqlite3.Row
for ref in s['unresolved_hook_refs']:
 for r in c.execute('select * from hook_events where event_id=?',(ref.removeprefix('hook:'),)):
  r=dict(r);q=json.loads(r['payload_json']);resp=q.get('tool_response');err=q.get('error')
  def safe(v):return {k:v[k] for k in ['exit_code','test_summary','success','recorded','status'] if k in v} if isinstance(v,dict) else None
  out['local_hook_evidence'].append({k:r[k] for k in ['event_id','session_id','event_name','cwd','created_at','lyo_version']}|{'ledger_path':str(p),'payload_sha256':sha(r['payload_json']),'command':q.get('tool_input',{}).get('command'),'response_signals':safe(resp),'error_signals':safe(err)})
c.close();pathlib.Path('/tmp/lyo-traceability-source-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'transcript_checks':len(out['historical_transcripts']),'hash_matches':sum(r['output_hash_matches'] is True for r in out['historical_transcripts']),'command_matches':sum(r['command_matches'] is True for r in out['historical_transcripts']),'header_matches':sum(r['header_exit']==r['declared_exit'] for r in out['historical_transcripts']),'local_hooks':len(out['local_hook_evidence']),'generic_messages':len(out['generic_source']['messages'])}))
