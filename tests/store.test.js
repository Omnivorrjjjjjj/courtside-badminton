import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as model from '../dist/model.js';

// Execute the production store with a controllable server/listener boundary.
// Transactions acknowledge immediately; listener delivery is deliberately delayed.
async function fixture() {
  let cloud=model.createState(),listener,rejectNext=false;
  const snapshot=(state=cloud)=>({exists:()=>true,data:()=>model.encodeFirestore(structuredClone(state)),metadata:{hasPendingWrites:false,fromCache:false}});
  const fakeApi={
    getFirestore:()=>({}),doc:()=>({}),serverTimestamp:()=>Date.now(),
    onSnapshot:(_ref,_options,callback)=>{listener=callback;callback(snapshot());},
    runTransaction:async(_db,callback)=>{
      let written;const result=await callback({get:async()=>snapshot(),set:(_ref,data)=>{written=model.decodeFirestore(data);}});
      if(rejectNext){rejectNext=false;throw new Error('Network failed before commit');}
      if(written)cloud=written;return result;
    }
  };
  const fakeAuth={getAuth:()=>({}),setPersistence:async()=>{},browserSessionPersistence:{},onAuthStateChanged:(_auth,callback)=>callback({uid:'test-owner'})};
  let source=fs.readFileSync(new URL('../dist/store.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace(/export function /g,'function ')
    .replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+\/firebase-app.js'\)/g,'Promise.resolve(fakeApp)')
    .replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+\/firebase-firestore.js'\)/g,'Promise.resolve(fakeApi)')
    .replace(/import\('https:\/\/www.gstatic.com\/firebasejs\/[^']+\/firebase-auth.js'\)/g,'Promise.resolve(fakeAuth)');
  const keys=['createState','reduce','normalizeState','encodeFirestore','decodeFirestore'];
  const factory=new Function(...keys,'cloudConfig','tournamentId','adminUid','fakeApp','fakeApi','fakeAuth','navigator','addEventListener',source+';return createStore;')(
    ...keys.map(key=>model[key]),{apiKey:'test',appId:'test',projectId:'test'},'test-event','test-owner',{initializeApp:()=>({})},fakeApi,fakeAuth,{onLine:true},()=>{}
  );
  const store=factory(()=>{});await new Promise(resolve=>setTimeout(resolve,0));
  return {store,emit:(state=cloud)=>listener(snapshot(state)),getCloud:()=>structuredClone(cloud),external:action=>{cloud=model.reduce(cloud,action);},fail:()=>{rejectNext=true;}};
}
const scoreAction=(score,expectedScore)=>({type:'set-score',matchId:'AB-1',score,expectedScore,expectedStatus:'live'});

test('confirmed writes support consecutive manual updates before listener delivery',async()=>{
  const f=await fixture();
  await f.store.dispatch(scoreAction([23,25],[18,21]));
  assert.deepEqual(f.store.state.matches[1].score,[23,25]);
  assert.equal(f.store.state.revision,f.getCloud().revision);
  assert.equal(f.store.pending,false);
  await f.store.dispatch(scoreAction([26,28],[23,25]));
  assert.deepEqual(f.getCloud().matches[1].score,[26,28]);
  await f.store.dispatch({type:'undo',matchId:'AB-1'});
  assert.deepEqual(f.store.state.matches[1].score,[23,25]);
});
test('late old snapshots cannot roll back confirmed state; equal revisions update server time',async()=>{
  const f=await fixture(),old=f.getCloud();
  await f.store.dispatch(scoreAction([23,25],[18,21]));
  f.emit(old);assert.deepEqual(f.store.state.matches[1].score,[23,25]);
  const confirmed=f.getCloud();confirmed.updatedAt=123456;f.emit(confirmed);
  assert.equal(f.store.state.updatedAt,123456);
});
test('real revision conflict refreshes client without overwriting server or requiring a page reload',async()=>{
  const f=await fixture();f.external({type:'commentary',text:'Another operator message'});
  await assert.rejects(f.store.dispatch({type:'pause',matchId:'AB-1'}),/另一位管理者/);
  assert.equal(f.store.state.revision,f.getCloud().revision);
  assert.equal(f.getCloud().matches[1].status,'live');assert.equal(f.store.pending,false);
  await f.store.dispatch({type:'pause',matchId:'AB-1'});
  assert.equal(f.getCloud().matches[1].status,'paused');
});
test('manual scores tolerate unrelated updates but reject changed same-match scores',async()=>{
  const f=await fixture();f.external({type:'commentary',text:'New broadcast'});
  await f.store.dispatch(scoreAction([23,25],[18,21]));
  assert.equal(f.getCloud().feed[0].text,'New broadcast');
  f.external(scoreAction([24,25],[23,25]));
  await assert.rejects(f.store.dispatch(scoreAction([26,27],[23,25])),/已被更新/);
  assert.deepEqual(f.store.state.matches[1].score,[24,25]);assert.equal(f.store.pending,false);
});
test('failed commit leaves score unmodified and allows a retry without refresh',async()=>{
  const f=await fixture();f.fail();
  await assert.rejects(f.store.dispatch(scoreAction([23,25],[18,21])),/Network/);
  assert.deepEqual(f.store.state.matches[1].score,[18,21]);assert.equal(f.store.pending,false);
  await f.store.dispatch(scoreAction([23,25],[18,21]));
  assert.deepEqual(f.store.state.matches[1].score,[23,25]);
});
