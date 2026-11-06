import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as codec from '../dist/cloud-codec.mjs';

// Link the unchanged production module to SDK doubles: no credentials, network,
// real sign-ins or Firestore writes are used by these regression tests.
const source=await readFile(new URL('../dist/firebase-cloud.mjs',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const empty={version:1,categories:[{id:'category',name:'朋友'}],chats:[],trash:[],seededAt:'2026-11-07T00:00:00.000Z'};
async function boot({persistence=Promise.resolve()}={}){
 const context=vm.createContext({structuredClone,Map,Error});
 const auth={currentUser:null},calls=[],writes=[];
 let listener;
 const state={
  auth,calls,writes,
  head:async()=>({exists:()=>false}),
  rows:async()=>({docs:[]}),
  transactionGet:async()=>({exists:()=>false}),
  emit(user){auth.currentUser=user;listener?.(user)}
 };
 const sdk={
  initializeApp:()=>({}),
  initializeAuth(app,options){assert.equal(options.persistence,sdk.browserLocalPersistence);assert.equal(options.popupRedirectResolver,sdk.browserPopupRedirectResolver);return auth},
  browserPopupRedirectResolver:{},getFirestore:()=>({}),
  browserLocalPersistence:{type:'LOCAL'},browserSessionPersistence:{type:'SESSION'},
  async setPersistence(instance,mode){assert.equal(instance,auth);calls.push(['persistence',mode.type]);await persistence},
  onAuthStateChanged(instance,onUser){assert.equal(instance,auth);calls.push(['observe']);listener=onUser;onUser(auth.currentUser)},
  GoogleAuthProvider:class GoogleAuthProvider {},
  async signInWithPopup(instance,provider){assert.equal(instance,auth);assert.ok(provider instanceof sdk.GoogleAuthProvider);calls.push(['login'])},
  async signOut(instance){assert.equal(instance,auth);calls.push(['logout']);state.emit(null)},
  doc:(store,...path)=>path.join('/'),collection:(store,...path)=>path.join('/'),
  getDocFromServer:async path=>{calls.push(['head',path]);return state.head(path)},
  getDocsFromServer:async path=>{calls.push(['rows',path]);return state.rows(path)},
  async runTransaction(store,callback,options){assert.equal(options.maxAttempts,1);calls.push(['transaction']);await callback({get:path=>state.transactionGet(path),set:(...args)=>writes.push(['set',...args]),delete:path=>writes.push(['delete',path])})},
  serverTimestamp:()=> 'server-time'
 };
 function exportsModule(values){return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value)},{context})}
 const module=new vm.SourceTextModule(source,{context});
 await module.link(specifier=>{
  if(specifier.startsWith('https://www.gstatic.com/firebasejs/'))return exportsModule(sdk);
  if(specifier==='./firebase-config.js')return exportsModule({firebaseConfig:{projectId:'demo-chat-tests'}});
  if(specifier==='./cloud-codec.mjs')return exportsModule(codec);
  throw Error('Unexpected import: '+specifier);
 });
 await module.evaluate();
 return Object.assign(state,{connect:callback=>module.namespace.connectCloud(callback)});
}

// Initialization must finish durable persistence before exposing login or
// subscribing to restored auth state (including an already signed-in user).
{
 const barrier=deferred(),test=await boot({persistence:barrier.promise});
 test.auth.currentUser={uid:'user-a'};
 const users=[];let ready=false;
 const connecting=test.connect(user=>users.push(user?.uid??null)).then(service=>{ready=true;return service});
 await Promise.resolve();
 assert.equal(ready,false);
 assert.deepEqual(test.calls,[['persistence','LOCAL']]);
 assert.deepEqual(users,[]);
 barrier.resolve();
 const service=await connecting;
 assert.deepEqual(users,['user-a']);
 await service.login();await service.logout();
 assert.deepEqual(users,['user-a',null]);
 assert.deepEqual(test.calls.map(call=>call[0]),['persistence','observe','login','logout']);
}
{
 const test=await boot({persistence:Promise.reject(Error('storage denied'))});
 await assert.rejects(test.connect(()=>assert.fail('must not observe auth before persistence succeeds')),/storage denied/);
 assert.deepEqual(test.calls,[['persistence','LOCAL']],'storage failures must not silently downgrade to session persistence');
}

// Restored accounts retain the existing UID guards and server-only reads.
{
 const test=await boot(),service=await test.connect(()=>{});
 await assert.rejects(service.load(),/請先登入/);
 test.emit({uid:'user-a'});
 const result=await service.load();
 assert.equal(result.uid,'user-a');assert.equal(result.data,null);
 assert.deepEqual(test.calls.filter(call=>call[0]==='head'),[['head','users/user-a/sync/state']]);
}
// Start loading A, then deliver a different account or sign-out before the read
// resolves. No data from A may be returned for the new auth state.
for(const next of [null,{uid:'user-b'}]){
 const test=await boot(),service=await test.connect(()=>{});
 test.emit({uid:'user-a'});
 const barrier=deferred();test.head=()=>barrier.promise;
 const read=service.load();test.emit(next);barrier.resolve({exists:()=>false});
 await assert.rejects(read,/帳號已改變/);
}
{
 const test=await boot(),service=await test.connect(()=>{});
 test.emit({uid:'user-a'});
 const records=codec.encodeRecords(empty);
 test.head=async()=>({exists:()=>true,data:()=>({revision:3})});
 test.rows=async()=>({docs:[...records].map(([id,value])=>({id,data:()=>value}))});
 const loaded=await service.load();
 assert.deepEqual(loaded.data,empty);assert.equal(loaded.revision,3);
 assert.ok(test.calls.filter(call=>['head','rows'].includes(call[0])).every(call=>call[1].startsWith('users/user-a/')));
 const barrier=deferred();test.rows=()=>barrier.promise;
 const reading=service.load();await Promise.resolve();test.emit({uid:'user-b'});
 barrier.resolve({docs:[]});await assert.rejects(reading,/帳號已改變/);
}
{
 const test=await boot(),service=await test.connect(()=>{});
 test.emit({uid:'user-b'});
 await assert.rejects(service.save(empty,{uid:'user-a',revision:0,records:new Map()}),/相同帳號/);
 assert.equal(test.writes.length,0);
 test.emit({uid:'user-a'});
 const saving=service.save(empty,{uid:'user-a',revision:0,records:new Map()});
 test.emit({uid:'user-b'});
 await assert.rejects(saving,/帳號已改變/);
 assert.equal(test.writes.length,0,'account changes inside a transaction cannot write stale records');
}
{
 const test=await boot(),service=await test.connect(()=>{});
 test.emit({uid:'user-a'});
 test.transactionGet=async()=>({exists:()=>true,data:()=>({revision:2})});
 await assert.rejects(service.save(empty,{uid:'user-a',revision:1,records:new Map()}),/其他裝置已更新/);
 assert.equal(test.writes.length,0,'restored sign-in must not bypass revision conflicts');
}
{
 const test=await boot(),service=await test.connect(()=>{});
 test.emit({uid:'user-b'});
 const saved=await service.save(empty,{uid:'user-b',revision:0,records:new Map()});
 assert.equal(saved.uid,'user-b');assert.equal(saved.revision,1);
 assert.ok(test.writes.length>1);
 assert.ok(test.writes.every(write=>write[1].startsWith('users/user-b/')));
}
console.log('PASS: awaited local auth persistence, restored auth, Google-only login, explicit logout, storage failure and UID read/write guards.');
