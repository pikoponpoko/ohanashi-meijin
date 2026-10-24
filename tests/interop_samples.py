"""Validate proposal documents only; this is not an importer/exporter or diff engine."""
import copy,json,pathlib
from jsonschema import Draft202012Validator,ValidationError
ROOT=pathlib.Path(__file__).resolve().parents[1]/'docs/interop'
load=lambda name:json.loads((ROOT/name).read_text())
schema=load('ohanashi-prepro.schema.json');Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema)
before=load('samples/baseline.json');after=load('samples/revised.json');expected=load('samples/expected-diff.json')
for doc in [before,after]:
 validator.validate(doc)
 chapter_ids=[c['id'] for c in doc['chapters']]
 cuts=[cut for chapter in doc['chapters'] for cut in chapter['cuts']]
 assert len(chapter_ids)==len(set(chapter_ids))
 assert len(cuts)==len({c['id'] for c in cuts})
 assert [c['displayNumber'] for c in cuts]==list(range(1,len(cuts)+1))
print('PASS schema and both samples; unique IDs and consecutive display numbers')
for field,value in [('schemaVersion','99'),('format','other'),('chapters',[])]:
 invalid=copy.deepcopy(before);invalid[field]=value
 try:validator.validate(invalid)
 except ValidationError:pass
 else:raise AssertionError('Invalid proposal sample accepted: '+field)
print('PASS unknown version, wrong format, empty chapter list rejected')
invalid=copy.deepcopy(before);del invalid['chapters'][0]['cuts'][0]['blocks'][3]['speaker']
try:validator.validate(invalid)
except ValidationError:pass
else:raise AssertionError('Dialogue without speaker accepted')
print('PASS dialogue requires explicit speaker field (which may be empty if unresolved)')
# Assert the intentionally-authored fixture changes, not a general-purpose merge algorithm.
lookup=lambda doc:{cut['id']:(chapter['id'],cut) for chapter in doc['chapters'] for cut in chapter['cuts']}
a,b=lookup(before),lookup(after)
assert set(expected['added'])==set(b)-set(a)
assert set(expected['deletionCandidates'])==set(a)-set(b)
assert expected['chapterMoves']==[{'cutId':'cut-b','from':a['cut-b'][0],'to':b['cut-b'][0]}]
assert a['cut-c'][1]['blocks']!=b['cut-c'][1]['blocks'] and expected['bodyChanged']==['cut-c']
assert a['cut-b'][1]['blocks']==b['cut-b'][1]['blocks'] and a['cut-b'][1]['displayNumber']!=b['cut-b'][1]['displayNumber']
assert expected['displayNumberChanged']==['cut-b']
assert a['cut-a']==b['cut-a'] and expected['unchanged']==['cut-a']
print('PASS expected fixture: addition, deletion candidate, chapter move, body and number changes')
blocks=before['chapters'][0]['cuts'][0]['blocks']
assert sum(x['kind']=='action' for x in blocks)==2
assert sum(x['kind']=='sceneHeading' for x in blocks)==1
assert sum(x['kind']=='dialogue' for x in blocks)==1 and '\n' in blocks[-1]['text']
print('PASS two action units, one scene heading, one wrapped dialogue preserved')
print('Proposal samples valid; no application integration implemented or tested')
