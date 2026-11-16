// Small per-entity documents preserve ordering and parent relationships.
export function encodeRecords(db) {
 const records=new Map();const put=(key,kind,value)=>{if(records.has(key))throw Error('紀錄識別碼重複，已停止同步');records.set(key,{kind,body:JSON.stringify(value)})};
 put('meta','meta',{version:db.version,...(db.seededAt?{seededAt:db.seededAt}:{})});
 db.categories.forEach((c,index)=>put('category:'+c.id,'category',{...c,index}));
 db.chats.forEach(({messages,...c},index)=>{put('chat:'+c.id,'chat',{...c,index});messages.forEach(({thoughts,...m},index)=>{put('message:'+m.id,'message',{...m,chatId:c.id,index});thoughts.forEach(({hypotheses,...t},index)=>{put('thought:'+t.id,'thought',{...t,messageId:m.id,index});hypotheses.forEach((h,index)=>put('hypothesis:'+h.id,'hypothesis',{...h,thoughtId:t.id,index}))})})});
 db.trash.forEach((item,index)=>{const text=JSON.stringify(item),total=Math.ceil(text.length/60000)||1;for(let part=0;part<total;part++)put('trash:'+item.id+':'+part,'trash',{id:item.id,index,part,total,text:text.slice(part*60000,(part+1)*60000)})});
 return records;
}
export function decodeRecords(records){
 const groups={meta:[],category:[],chat:[],message:[],thought:[],hypothesis:[],trash:[]};
 for(const [key,record] of records){if(!groups[record.kind]||typeof record.body!=='string')throw Error('雲端資料格式不符');const item=JSON.parse(record.body);if(record.kind!=='meta'&&(!Number.isInteger(item.index)||item.index<0))throw Error('雲端資料順序不符');groups[record.kind].push(item)}
 if(groups.meta.length!==1)throw Error('雲端資料缺少版本資訊');
 const ordered=rows=>rows.sort((a,b)=>a.index-b.index);const strip=(v,fields)=>Object.fromEntries(Object.entries(v).filter(([k])=>!fields.includes(k)));
 const chats=ordered(groups.chat).map(c=>({...strip(c,['index']),messages:[]})),messages=new Map(),thoughts=new Map();
 const chatMap=new Map(chats.map(c=>[c.id,c]));
 for(const m of ordered(groups.message)){const parent=chatMap.get(m.chatId);if(!parent)throw Error('雲端紀錄缺少聊天');const item={...strip(m,['chatId','index']),thoughts:[]};parent.messages.push(item);messages.set(m.id,item)}
 for(const t of ordered(groups.thought)){const parent=messages.get(t.messageId);if(!parent)throw Error('雲端思緒缺少現實行動');const item={...strip(t,['messageId','index']),hypotheses:[]};parent.thoughts.push(item);thoughts.set(t.id,item)}
 for(const h of ordered(groups.hypothesis)){const parent=thoughts.get(h.thoughtId);if(!parent)throw Error('雲端假設缺少思緒');parent.hypotheses.push(strip(h,['thoughtId','index']))}
 const trashGroups=new Map();for(const part of groups.trash){if(!Number.isInteger(part.part)||!Number.isInteger(part.total)||part.total<1||part.total>500||typeof part.text!=='string')throw Error('回收桶資料格式不符');if(!trashGroups.has(part.id))trashGroups.set(part.id,[]);trashGroups.get(part.id).push(part)}
 const trash=ordered([...trashGroups.values()].map(parts=>{parts.sort((a,b)=>a.part-b.part);if(parts.length!==parts[0].total||parts.some((p,i)=>p.part!==i||p.total!==parts[0].total))throw Error('雲端回收桶資料不完整');return{index:parts[0].index,item:JSON.parse(parts.map(p=>p.text).join(''))}})).map(x=>x.item);
 return{...groups.meta[0],categories:ordered(groups.category).map(c=>strip(c,['index'])),chats,trash};
}
export function recordChanges(previous,next){const changes=[];for(const [id,value] of next)if(JSON.stringify(previous.get(id))!==JSON.stringify(value))changes.push({id,value});for(const id of previous.keys())if(!next.has(id))changes.push({id,value:null});return changes}
