import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduce, standings, pairStats, winner, normalizeState, encodeFirestore, decodeFirestore } from '../dist/model.js';

test('three pairs, four disciplines, three men and one woman; rally scores include live match', () => {
  const s = createState();
  assert.equal(s.matches.length, 12);
  assert.deepEqual(s.matches.slice(0,4).map(m=>m.category), ['MD','WS','MD','XD']);
  assert.deepEqual(standings(s).map(t=>[t.id,t.points,t.won]), [['A',49,1],['B',47,0],['C',0,0]]);
  assert.deepEqual(pairStats(s,'AB').scores,[49,47]);
  assert.equal(Object.values(s.teams).every(t=>t.players.filter(p=>p.gender==='M').length===3),true);
});
test('score increment, undo, no mutation of original and no negative score', () => {
  const s=createState();const next=reduce(s,{type:'score',matchId:'AB-1',side:0,delta:1});
  assert.equal(s.matches[1].score[0],18);assert.equal(next.matches[1].score[0],19);
  assert.deepEqual(reduce(next,{type:'undo',matchId:'AB-1'}).matches[1].score,[18,21]);
  let fresh=reduce(createState(false),{type:'start',matchId:'AB-0'});
  assert.throws(()=>reduce(fresh,{type:'score',matchId:'AB-0',side:0,delta:-1}),/小於/);
});
test('31-point sudden-death requires result confirmation and stops further scoring', () => {
  let s=createState();s.matches[1].score=[30,30];
  s=reduce(s,{type:'score',matchId:'AB-1',side:1,delta:1});
  assert.equal(winner(s.matches[1],s.settings),1);
  assert.equal(standings(s).find(t=>t.id==='B').won,0);
  assert.throws(()=>reduce(s,{type:'score',matchId:'AB-1',side:0,delta:1}),/局末/);
  s=reduce(s,{type:'finish',matchId:'AB-1'});
  assert.equal(standings(s).find(t=>t.id==='B').won,1);
  assert.throws(()=>reduce(s,{type:'score',matchId:'AB-1',side:1,delta:-1}),/恢復/);
});
test('two-point lead and cap handle deuce correctly', () => {
  const cfg={target:21,winBy:2,cap:30};
  assert.equal(winner({score:[21,20]},cfg),null);
  assert.equal(winner({score:[22,20]},cfg),0);
  assert.equal(winner({score:[30,29]},cfg),0);
  assert.equal(winner({score:[29,29]},cfg),null);
});
test('enforce single active match, reject premature finish, pause and resume', () => {
  let s=createState();
  assert.throws(()=>reduce(s,{type:'start',matchId:'BC-0'}),/目前比賽/);
  assert.throws(()=>reduce(s,{type:'finish',matchId:'AB-1'}),/獲勝/);
  s=reduce(s,{type:'pause',matchId:'AB-1'});
  assert.throws(()=>reduce(s,{type:'score',matchId:'AB-1',side:1,delta:1}),/恢復/);
  assert.throws(()=>reduce(s,{type:'start',matchId:'BC-0'}),/目前比賽/);
  assert.equal(reduce(s,{type:'start',matchId:'AB-1'}).matches[1].status,'live');
});
test('lineups reject duplicates, wrong teams and invalid discipline combinations', () => {
  const s=createState(false);
  for(const lineup of [['A1','A1'],['A1','A4'],['B1','B2']]) assert.throws(()=>reduce(s,{type:'lineup',matchId:'AB-0',lineups:[lineup,['B1','B2']]}));
  const next=reduce(s,{type:'lineup',matchId:'AB-3',lineups:[['A2','A4'],['B3','B4']]});
  assert.deepEqual(next.matches[3].lineups[0],['A2','A4']);
});
test('format changes cannot rewrite completed scores, while broadcast and standings remain configurable', () => {
  const s=createState();
  assert.throws(()=>reduce(s,{type:'settings',settings:{...s.settings,target:21},title:s.title,venue:s.venue}),/已有比賽/);
  const next=reduce(s,{type:'settings',settings:{...s.settings,standingsMode:'match',matchWinPoints:2,broadcast:'manual'},title:s.title,venue:s.venue});
  assert.equal(standings(next).find(t=>t.id==='A').points,2);
  let fresh=reduce(s,{type:'reset'});
  fresh=reduce(fresh,{type:'settings',settings:{...fresh.settings,types:['MS','XD'],target:21,winBy:2,cap:30},title:'新賽事',venue:'球場 2'});
  assert.equal(fresh.matches.length,6); assert.equal(fresh.title,'新賽事');
});
test('tie points are awarded only after complete pair and a 2-2 draw is supported', () => {
  const s=createState(false);s.settings.standingsMode='tie';
  s.matches.slice(0,4).forEach((m,i)=>{m.score=i<2?[31,20]:[20,31];m.status='finished'});
  assert.deepEqual(standings(s).map(t=>[t.id,t.points,t.rank]),[['A',1,1],['B',1,1],['C',0,3]]);
  s.matches[3].status='live';assert.equal(standings(s).every(t=>t.points===0),true);
});
test('commentary bounded, backup normalization handles Firebase omitted arrays', () => {
  let s=createState(false);delete s.feed;s.matches.forEach(m=>delete m.history);
  s=normalizeState(s);assert.deepEqual(s.feed,[]);assert.deepEqual(s.matches[0].history,[]);
  s=reduce(s,{type:'commentary',text:'測試播報'});assert.equal(s.feed[0].text,'測試播報');
  assert.throws(()=>reduce(s,{type:'commentary',text:'   '}),/輸入/);
});
test('changing target preserves scheduled lineups; unsupported roster composition rejected early', () => {
  let s=reduce(createState(false),{type:'lineup',matchId:'AB-0',lineups:[['A2','A3'],['B2','B3']]});
  s=reduce(s,{type:'settings',settings:{...s.settings,target:21},title:s.title,venue:s.venue});
  assert.deepEqual(s.matches[0].lineups,[['A2','A3'],['B2','B3']]);
  assert.throws(()=>reduce(s,{type:'settings',settings:{...s.settings,types:['WD']},title:s.title,venue:s.venue}),/女雙/);
});
test('Firestore serialization roundtrip contains no directly nested arrays and preserves server timestamp', () => {
  const s=reduce(createState(),{type:'score',matchId:'AB-1',side:0,delta:1});
  const record=encodeFirestore(s);
  const check=value=>{ if(Array.isArray(value)){assert.equal(value.some(Array.isArray),false);value.forEach(check)}else if(value && typeof value==='object')Object.values(value).forEach(check) };
  check(record);assert.deepEqual(decodeFirestore(record),s);
  record.updatedAt={toMillis:()=>123456};assert.equal(decodeFirestore(record).updatedAt,123456);
});
test('starting a match atomically saves the currently selected lineup', () => {
  const initial=createState(false);
  const lineups=[['A2','A3'],['B2','B3']];
  const started=reduce(initial,{type:'start',matchId:'AB-0',lineups});
  assert.deepEqual(started.matches[0].lineups,lineups);assert.equal(started.matches[0].status,'live');
  assert.throws(()=>reduce(initial,{type:'start',matchId:'AB-0',lineups:[['A1','A4'],['B1','B2']]}),/組合/);
  assert.equal(initial.matches[0].status,'pending');
});

test('manual score entry jumps both scores atomically and one undo restores the whole update', () => {
  const initial=createState();
  const next=reduce(initial,{type:'set-score',matchId:'AB-1',score:[25,27],expectedScore:[18,21],expectedStatus:'live'});
  assert.deepEqual(next.matches[1].score,[25,27]);
  assert.deepEqual(standings(next).map(t=>[t.id,t.points]),[['A',56],['B',53],['C',0]]);
  assert.deepEqual(reduce(next,{type:'undo',matchId:'AB-1'}).matches[1].score,[18,21]);
  assert.deepEqual(initial.matches[1].score,[18,21]);
});
test('manual scores allow corrections while paused and require confirmation for finished results', () => {
  let state=reduce(createState(),{type:'pause',matchId:'AB-1'});
  state=reduce(state,{type:'set-score',matchId:'AB-1',score:[15,20],expectedScore:[18,21],expectedStatus:'paused'});
  state=reduce(state,{type:'set-score',matchId:'AB-1',score:[31,29],expectedScore:[15,20],expectedStatus:'paused'});
  assert.equal(state.matches[1].status,'paused');
  state=reduce(state,{type:'finish',matchId:'AB-1'});
  assert.throws(()=>reduce(state,{type:'set-score',matchId:'AB-1',score:[30,29],expectedScore:[31,29],expectedStatus:'finished'}),/重新開啟/);
});
test('manual score entry rejects invalid totals and stale same-match scores', () => {
  const state=createState(),base={type:'set-score',matchId:'AB-1',expectedScore:[18,21],expectedStatus:'live'};
  for(const score of [[-1,20],[1.5,20],[32,20],[31,31],['25',26],[25],null,[18,21]])assert.throws(()=>reduce(state,{...base,score}));
  assert.throws(()=>reduce(state,{...base,score:[25,26],expectedScore:[17,21]}),/已被更新/);
  assert.throws(()=>reduce(state,{...base,score:[25,26],expectedStatus:'paused'}),/已被更新/);
  assert.throws(()=>reduce(state,{...base,score:[25,26],expectedScore:undefined}),/已被更新/);
});
