const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
function boot(){const storage=new Map(),nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:'',open:false,classList:{add(){},remove(){}},addEventListener(){},append(){},querySelector(){return{focus(){}}},focus(){},close(){this.open=false},showModal(){this.open=true}});return nodes.get(id)}const context=vm.createContext({document:{getElementById:node,querySelector(){return null},addEventListener(){},createElement(){return{click(){}}}},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:{randomUUID},Date,Intl,console,AbortController,structuredClone,setTimeout(){},clearTimeout(){},Blob,URL});for(const name of ['cloud-ui.js','app.js']){vm.runInContext(fs.readFileSync('dist/'+name,'utf8'),context);if(name==='cloud-ui.js')vm.runInContext('cloudGate=false',context)}return{storage,nodes,run:code=>vm.runInContext(code,context)}}
(async()=>{const a=boot(),original=a.storage.get('minerva-room-v1');a.run("cloudState.user={uid:'user-a',email:'a@example.com'};cloudState.paused=true;adoptCloudData(structuredClone(db),'user-a',{uid:'user-a',revision:0,records:new Map()},{dirty:true})");assert.equal(a.run('KEY'),'minerva-room-v1:user-a');assert.equal(a.storage.get('minerva-room-v1'),original,'migration does not overwrite legacy');a.run("addRecord({chatId:state.active,role:'me',text:'user-a-only'})");assert.ok(a.storage.get('minerva-room-v1:user-a').includes('user-a-only'));assert.ok(!a.storage.get('minerva-room-v1').includes('user-a-only'));
assert.throws(()=>a.run("adoptCloudData(structuredClone(db),'user-b',{uid:'user-b',revision:0,records:new Map()})"),/帳號已改變/);
a.run('handleCloudUser(null)');assert.equal(a.run('cloudState.ready'),false);assert.equal(a.run('cloudGate'),true);assert.ok(!a.nodes.get('app').innerHTML.includes('user-a-only'));assert.throws(()=>a.run("addRecord({chatId:state.active,role:'me',text:'signed-out'})"));assert.ok(a.storage.get('minerva-room-v1:user-a').includes('user-a-only'),'sign-out preserves unsynced cache');
const b=boot(),before=b.run('current().messages.length');b.run("handleCloudUser({uid:'user-a',email:'a@example.com'});handleCloudUser(null)");assert.equal(b.run('current().messages.length'),before,'sign out before cloud activation preserves local view');
const c=boot();c.run("cloudState.user={uid:'user-a'};cloudService={async save(snapshot,base){return{uid:base.uid,revision:base.revision+1,records:new Map(),data:structuredClone(snapshot)}}};adoptCloudData(structuredClone(db),'user-a',{uid:'user-a',revision:0,records:new Map()});cloudState.paused=true;addRecord({chatId:state.active,role:'me',text:'persist-and-sync'});cloudState.paused=false");await c.run('flushCloud()');assert.equal(c.run('cloudState.status'),'已同步至雲端');assert.equal(c.run('db._cloud.dirty'),false);assert.equal(c.run('cloudState.base.revision'),1);
const d=boot();d.run("cloudState.user={uid:'user-a'};cloudService={async save(){throw Error('offline')}};adoptCloudData(structuredClone(db),'user-a',{uid:'user-a',revision:0,records:new Map()});cloudState.paused=true;addRecord({chatId:state.active,role:'me',text:'offline-retained'});cloudState.paused=false");await assert.rejects(()=>d.run('flushCloud()'),/offline/);assert.equal(d.run('db._cloud.dirty'),true);assert.equal(d.run('cloudState.paused'),true);assert.ok(d.storage.get('minerva-room-v1:user-a').includes('offline-retained'));
// Local persistence synchronizes account changes across tabs. A delayed load
// from A must release the loading gate and automatically load B, even on error.
for(const failOldLoad of [false,true]){
const next=boot();
next.run("globalThis.cloudA=structuredClone(db);cloudA.chats[0].messages[0].text='a-private';globalThis.cloudB=structuredClone(db);cloudB.chats[0].messages[0].text='b-private';globalThis.loaded=[];cloudService={load(){const uid=cloudState.user.uid;loaded.push(uid);if(uid==='user-a')return new Promise((resolve,reject)=>{globalThis.finishOldLoad=()=>"+(failOldLoad?"reject(Error('old account offline'))":"resolve({uid,data:cloudA,revision:0,records:new Map()})")+"});return Promise.resolve({uid,data:cloudB,revision:0,records:new Map()})}};cloudGate=true;handleCloudUser({uid:'user-a'})");
assert.equal(next.run('cloudState.loading'),true);
await Promise.resolve();
next.run("handleCloudUser({uid:'user-b'});finishOldLoad()");
await new Promise(setImmediate);
assert.deepEqual(Array.from(next.run('loaded')),['user-a','user-b']);
assert.equal(next.run('cloudState.ready'),true);
assert.equal(next.run('KEY'),'minerva-room-v1:user-b');
assert.ok(next.nodes.get('app').innerHTML.includes('b-private'));
assert.ok(!next.nodes.get('app').innerHTML.includes('a-private'));
assert.equal(next.run('cloudState.error'),'');
assert.equal(next.storage.has('minerva-room-v1:user-a'),false,'stale load must not adopt A');
}
// A failing save from an old account cannot put A's snapshot into B's queue,
// pause B, or overwrite B's sync state. B's pending work must resume afterward.
for(const failOldSave of [false,true]){
const next=boot();
next.run("globalThis.saved=[];cloudService={save(snapshot,base){saved.push({uid:base.uid,text:snapshot.chats[0].messages[0].text});if(base.uid==='user-a')return new Promise((resolve,reject)=>{globalThis.finishOldSave=()=>"+(failOldSave?"reject(Error('old account offline'))":"resolve({...base,revision:1})")+"});return Promise.resolve({...base,revision:base.revision+1})}};cloudState.user={uid:'user-a'};adoptCloudData(structuredClone(db),'user-a',{uid:'user-a',revision:0,records:new Map()});db.chats[0].messages[0].text='a-private';cloudState.pending=structuredClone(db);globalThis.oldSaving=flushCloud()");
next.run("cloudGate=false;handleCloudUser({uid:'user-b'});globalThis.b=JSON.parse(localStorage.getItem('minerva-room-v1'));b.chats[0].messages[0].text='b-private';adoptCloudData(b,'user-b',{uid:'user-b',revision:0,records:new Map()},{dirty:true});queueCloudSave(db);finishOldSave()");
await next.run('oldSaving');await new Promise(setImmediate);
assert.deepEqual(Array.from(next.run('saved'),item=>[item.uid,item.text]),[['user-a','a-private'],['user-b','b-private']]);
assert.equal(next.run('cloudState.paused'),false);
assert.equal(next.run('cloudState.pending'),null);
assert.equal(next.run('cloudState.base.uid'),'user-b');
assert.equal(next.run('db._cloud.dirty'),false);
assert.ok(!next.storage.get('minerva-room-v1:user-b').includes('a-private'));
}
// Popup must open synchronously in the original click handler on Safari.
const safari=boot();
safari.run("globalThis.popupStarts=0;cloudService={login(){popupStarts++;return Promise.resolve({user:{uid:'test'}})}};startGooglePopup()");
assert.equal(safari.run('popupStarts'),1,'Google popup starts immediately without an await');
await new Promise(setImmediate);
assert.equal(safari.run('cloudState.busy'),false,'login busy state resets');
const blocked=boot();
blocked.run("cloudService={login(){return Promise.reject({code:'auth/popup-blocked'})}};startGooglePopup()");
await new Promise(setImmediate);
assert.match(blocked.run('cloudState.error'),/Safari 阻擋/);
const appSource=fs.readFileSync('dist/app.js','utf8');
assert.ok(appSource.includes("if(a==='cloud-login'){startGooglePopup();return}"),'click handler invokes popup directly');
console.log('PASS: UID-specific caches, explicit migration, signout gating, legacy preservation, confirmed cloud status, offline retention and stale-account load/save isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
