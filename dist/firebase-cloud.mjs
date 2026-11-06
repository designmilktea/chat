import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {initializeAuth,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {encodeRecords,decodeRecords,recordChanges} from './cloud-codec.mjs';
// Start with local persistence so cross-tab auth listeners use the same storage
// as sign-in. Keep the popup resolver required by Google signInWithPopup.
const app=initializeApp(firebaseConfig),auth=initializeAuth(app,{persistence:browserLocalPersistence,popupRedirectResolver:browserPopupRedirectResolver}),store=getFirestore(app);
// Keep the current and future Google sessions across browser restarts.
// Explicit signOut and the UID guards below still control account access.
export async function connectCloud(onUser){await setPersistence(auth,browserLocalPersistence);onAuthStateChanged(auth,onUser);return{
 login:()=>signInWithPopup(auth,new GoogleAuthProvider()),logout:()=>signOut(auth),
 async load(){const user=auth.currentUser;if(!user)throw Error('請先登入');const uid=user.uid,head=doc(store,'users',uid,'sync','state');const first=await getDocFromServer(head);if(!first.exists()){if(auth.currentUser?.uid!==uid)throw Error('登入帳號已改變');return{uid,data:null,revision:0,records:new Map()}};const rows=await getDocsFromServer(collection(store,'users',uid,'records'));const second=await getDocFromServer(head);if(!second.exists()||first.data().revision!==second.data().revision)throw Error('雲端資料正在更新，請重試載入');if(auth.currentUser?.uid!==uid)throw Error('登入帳號已改變');const records=new Map(rows.docs.map(x=>[x.id,x.data()]));return{uid,data:decodeRecords(records),revision:second.data().revision,records}},
 async save(data,base){if(auth.currentUser?.uid!==base.uid)throw Error('請先登入相同帳號');const next=encodeRecords(data),changes=recordChanges(base.records,next);if(!changes.length)return base;if(changes.length>450)throw Error('單次變更超過 450 筆，請分批匯入聊天；本機紀錄仍保留。');const head=doc(store,'users',base.uid,'sync','state');await runTransaction(store,async tx=>{const existing=await tx.get(head);const revision=existing.exists()?existing.data().revision:0;if(revision!==base.revision)throw Error('其他裝置已更新雲端紀錄，請先匯出本機備份，再重新載入雲端。');if(auth.currentUser?.uid!==base.uid)throw Error('登入帳號已改變');for(const {id,value} of changes){const target=doc(store,'users',base.uid,'records',id);value===null?tx.delete(target):tx.set(target,value)}tx.set(head,{revision:revision+1,updatedAt:serverTimestamp()})},{maxAttempts:1});return{uid:base.uid,data:structuredClone(data),revision:base.revision+1,records:next}}
}}
