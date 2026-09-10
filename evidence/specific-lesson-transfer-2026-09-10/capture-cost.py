"""Record usage metadata only; no prompts, source text, or reasoning content."""
import json
from pathlib import Path

trace = Path('/Users/marcus.kim/.codex/sessions/2026/09/08/rollout-2026-09-08T18-40-31-01a0802d-0fb4-7fb1-b6f9-d0cbedd5c7d2.jsonl')
root_turn = '01a0868a-3bdf-7221-a52f-fea84d9bd58c'
responses = {}
with trace.open() as source:
    for line in source:
        row = json.loads(line)
        payload = row.get('payload', {})
        if row.get('type') == 'token_usage_record' and payload.get('root_turn_id') == root_turn:
            responses[payload['response_id']] = {
                'timestamp': row['timestamp'], 'responseId': payload['response_id'],
                'turnId': payload['turn_id'], 'usage': payload['usage'],
            }
assert responses
totals = {key: sum(r['usage'].get(key, 0) for r in responses.values())
          for key in ('input_tokens', 'cached_input_tokens', 'output_tokens', 'total_tokens')}
assert totals['total_tokens'] == totals['input_tokens'] + totals['output_tokens']
record = {
    'scope': 'Implementation, experiment setup and analysis for the approved 1/2/3 root task',
    'tracePath': str(trace), 'rootTurnId': root_turn,
    'through': max(r['timestamp'] for r in responses.values()), 'lowerBound': True,
    'excludes': 'Later reporting, earlier project development, separate coding hosts and earlier drafting/reflection',
    'cachedInputAlreadyIncluded': True, 'usage': totals,
    'candidateAndEvaluationTokens': 767184,
    'combinedRecordedLowerBound': totals['total_tokens'] + 767184,
    'responses': list(responses.values()),
}
Path(__file__).with_name('orchestration-checkpoint.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({k: v for k, v in record.items() if k != 'responses'}, indent=2))
