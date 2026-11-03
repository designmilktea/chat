import assert from 'node:assert/strict';
import {encodeRecords,decodeRecords,recordChanges} from '../dist/cloud-codec.mjs';
const source={version:1,seededAt:'2026-11-04T00:00:00.000Z',categories:[{id:'cat',name:'朋友',color:'#123456'}],chats:[{id:'chat',categoryId:'cat',name:'',createdAt:'2026-11-04T00:00:00.000Z',messages:[{id:'m',role:'other',text:'對方的現實行動',createdAt:'2026-11-04T00:00:00.000Z',eventDate:'',thoughts:[{id:'t',text:'我的思緒',hypotheses:[{id:'h',text:'待驗證'}]}]}]}],trash:[{id:'deleted',type:'thought',payload:{text:'長內容'.repeat(50000)},deletedAt:'2026-11-04T00:00:00.000Z'}]};
const encoded=encodeRecords(source);assert.deepEqual(decodeRecords(encoded),source);assert.deepEqual(decodeRecords(new Map([...encoded].reverse())),source,'reading order does not change timeline order');assert.equal(recordChanges(encoded,encodeRecords(source)).length,0);
const changed=structuredClone(source);changed.chats[0].messages[0].thoughts[0].text='修改思緒';assert.equal(recordChanges(encoded,encodeRecords(changed)).length,1,'only edited entity is written');
const deleted=structuredClone(source);deleted.chats[0].messages[0].thoughts=[];assert.equal(recordChanges(encoded,encodeRecords(deleted)).filter(x=>x.value===null).length,2,'child records included in deletion');
const incomplete=new Map(encoded);incomplete.delete('trash:deleted:0');assert.throws(()=>decodeRecords(incomplete),/不完整/);
const missingParent=new Map(encoded);missingParent.delete('message:m');assert.throws(()=>decodeRecords(missingParent),/缺少現實行動/);
console.log('PASS: cloud entity roundtrip, ordering, large recycle-bin chunks, minimal diffs, cascade changes and missing-parent protection.');
