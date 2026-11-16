import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { Chat, Message, Thought, Runtime, RuntimeSnapshot } from '../core/types';
export type ViewSnapshot = RuntimeSnapshot;
export type ViewHelpers = Runtime;
export interface AppProps { snapshot: ViewSnapshot; helpers: ViewHelpers }
const ViewContext = createContext<AppProps | null>(null);
function useView() { const view = useContext(ViewContext); if (!view) throw Error('Missing view context'); return view; }
// Native delegated handlers own mutations. Keep React from restoring stale
// controlled values before those handlers receive the browser's input/change.
function StateInput({ value, checked, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    if (value !== undefined && input.value !== String(value)) input.value = String(value);
    if (checked !== undefined && input.checked !== checked) input.checked = checked;
  });
  return <input {...props} ref={ref} defaultValue={value} defaultChecked={checked} />;
}
function StateSelect({ value, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => { if (ref.current && value !== undefined && ref.current.value !== String(value)) ref.current.value = String(value); });
  return <select {...props} ref={ref} defaultValue={value}>{children}</select>;
}

function Icon({ name }: { name: string }) {
  const { helpers } = useView();
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d={helpers.icons[name] || helpers.icons.chat} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  action: string; children?: ReactNode; 'data-id'?: string; 'data-mid'?: string; 'data-tid'?: string; 'data-role'?: string;
};
function Action({ action, children, ...props }: ActionProps) { return <button type="button" data-action={action} {...props}>{children}</button>; }
function IconAction({ action, icon, label, ...props }: Omit<ActionProps, 'children'> & { icon: string; label: string }) {
  return <Action action={action} className="icon" aria-label={label} title={label} {...props}><Icon name={icon} /></Action>;
}
function Avatar({ chat }: { chat: Chat }) {
  const { helpers } = useView(); const color = helpers.categoryColor(chat.categoryId);
  return <span className="avatar" data-cat={helpers.categoryName(chat.categoryId)} style={{ background: `${color}22`, color }}>{helpers.chatTitle(chat).slice(0, 1)}</span>;
}
function cloudLabel(snapshot: ViewSnapshot) { return snapshot.cloudGate && !snapshot.cloudState.ready ? '登入雲端紀錄' : snapshot.cloudState.ready ? snapshot.cloudState.status : '雲端儲存'; }

function CloudGate() {
  const { snapshot } = useView(); const { cloudState } = snapshot;
  return <main className="cloud-gate"><div><h1>雲端紀錄</h1><p>{cloudState.loading ? '正在載入你的紀錄…' : cloudState.user ? '登入完成，準備載入紀錄。' : '登入 Google 帳號，開啟你的紀錄。'}</p><p className="small">此瀏覽器會保持登入；共用裝置使用完請登出。</p>{cloudState.error && <p role="alert" className="danger">{cloudState.error}</p>}<Action action="cloud-settings" className="btn primary">{cloudState.user ? '開啟雲端儲存設定' : 'Google 登入'}</Action></div></main>;
}
function Rail() {
  const { snapshot, helpers } = useView(); const { db, state, cloudState, agentAccess } = snapshot;
  return <aside className="rail" aria-label="主要導覽">
    <nav><Action action="page-chats" className={`nav-btn ${state.page === 'chats' ? 'active' : ''}`}><Icon name="chat" />聊天紀錄 <span className="count">{db.chats.length}</span></Action><Action action="page-trash" className={`nav-btn ${state.page === 'trash' ? 'active' : ''}`}><Icon name="trash" />回收桶 <span className="count">{db.trash.length}</span></Action></nav>
    <div className="cat-heading"><span className="eyebrow">我的分類</span><IconAction action="categories" icon="settings" label="管理分類" /></div>
    <nav aria-label="聊天分類"><Action action="filter-category" className={`category ${!state.category ? 'active' : ''}`} data-id=""><span className="dot" style={{ background: '#a2a68f' }} />全部紀錄</Action>{db.categories.map(category => <Action key={category.id} action="filter-category" className={`category ${state.category === category.id ? 'active' : ''}`} data-id={category.id}><span className="dot" style={{ background: helpers.categoryColor(category.id) }} />{category.name}</Action>)}</nav>
    <div className="rail-foot"><Action action="cloud-settings" className="text-btn">{cloudLabel(snapshot)}</Action><Action action="ai-settings" className="text-btn">{agentAccess.enabled ? 'AI 存取：已啟用' : 'AI 存取：關閉'}</Action><p>{cloudState.ready ? cloudState.status : '僅儲存在此瀏覽器'}</p><Action action="export" className="text-btn">匯出紀錄 JSON</Action></div>
  </aside>;
}
function ChatListItem({ chat }: { chat: Chat }) {
  const { snapshot: { state }, helpers } = useView(); const title = helpers.chatTitle(chat);
  return <article className={`chat-item ${chat.id === state.active ? 'active' : ''}`} data-chat-id={chat.id}>
    {state.chatBatch && <StateInput type="checkbox" data-select-chat={chat.id} aria-label={`選取聊天 ${title}`} checked={state.selectedChats.has(chat.id)} />}
    <button className="chat-open" data-action="open-chat" data-id={chat.id} aria-label={`開啟聊天 ${title}`} aria-current={chat.id === state.active ? 'true' : undefined}><Avatar chat={chat} /><div className="chat-copy"><div className="chat-top"><strong>{title}</strong><time dateTime={chat.createdAt}>{helpers.month(chat.createdAt)}</time></div><p className="preview">{chat.messages.at(-1)?.text || '留一個空間，開始記錄'}</p><p className="chat-category">{helpers.categoryName(chat.categoryId)}</p></div></button>
  </article>;
}
function ChatList() {
  const { snapshot, helpers } = useView(); const { db, state } = snapshot; const chats = helpers.filteredChats();
  return <section className="chat-panel" aria-label="聊天列表">
    <header className="list-head"><div className="title-row"><h2>聊天</h2><IconAction action="new-chat" icon="plus" label="新增聊天" /></div>
      <div className="search"><Icon name="search" /><label htmlFor="global-search" hidden>搜尋分類、人物或紀錄</label><StateInput id="global-search" type="search" placeholder="搜尋分類、人物或紀錄…" value={state.query} /></div>
      <div className="filter-row"><label htmlFor="category-filter" hidden>依分類篩選聊天</label><StateSelect id="category-filter" value={state.category}><option value="">全部分類</option>{db.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</StateSelect><label htmlFor="date-filter" hidden>依聊天建立年月篩選</label><StateInput id="date-filter" type="month" aria-label="依聊天建立年月篩選" title="依聊天建立年月篩選" value={state.date} /></div>
    </header>
    <div className="list-meta"><span>{chats.length} 個聊天{state.date ? ' · 建立年月' : ''}</span><div>{Boolean(state.category || state.date || state.query) && <Action action="clear-filters" className="text-btn">清除篩選</Action>}<Action action="chat-batch" className="text-btn">{state.chatBatch ? '完成' : '批次管理'}</Action></div></div>
    {state.chatBatch && <div className="batchbar"><span>已選 {state.selectedChats.size} 個</span><Action action="select-chats" className="text-btn">全選</Action><Action action="batch-chat-edit" className="btn" disabled={!state.selectedChats.size}>更改分類</Action><Action action="batch-chat-delete" className="btn danger" disabled={!state.selectedChats.size}>刪除</Action></div>}
    <div className="mobile-bar"><Action action="page-chats" className="text-btn">聊天</Action><Action action="page-trash" className="text-btn">回收桶</Action><Action action="categories" className="text-btn">管理分類</Action><Action action="ai-settings" className="text-btn">AI 存取</Action><Action action="cloud-settings" className="text-btn">{cloudLabel(snapshot)}</Action></div>
    <div className="chat-list">{chats.length ? chats.map(chat => <ChatListItem key={chat.id} chat={chat} />) : <div className="empty">沒有符合的聊天紀錄</div>}</div><footer className="list-bottom"><span className="mobile-only"><Action action="export" className="text-btn">匯出</Action></span></footer>
  </section>;
}
function StorageAlert({ empty = false }: { empty?: boolean }) {
  const { snapshot: { storageIssue } } = useView(); if (!storageIssue) return null;
  return empty ? <><p role="alert">{storageIssue}</p><Action action="export-original" className="btn">下載原始儲存資料</Action></> : <div className="storage-alert" role="alert"><p>{storageIssue}</p><Action action="export-original" className="text-btn">下載原始儲存資料</Action></div>;
}
function EditForm({ type, id, text, message, thoughtId = '' }: { type: 'message' | 'thought' | 'hypothesis'; id: string; text: string; message: Message; thoughtId?: string }) {
  return <form className="inline-form" data-edit-type={type} data-id={id} data-mid={type === 'message' ? '' : message.id} data-tid={thoughtId}>
    <label className="small" htmlFor={`inline-${id}`}>編輯{{ message: '現實行動', thought: '思緒', hypothesis: '待驗證假設' }[type]}</label><textarea id={`inline-${id}`} name="text" required rows={3} maxLength={20000} defaultValue={text} />
    {type === 'message' && <><label className="small" htmlFor="edit-role">記錄對象</label><select id="edit-role" name="role" defaultValue={message.role}><option value="other">對方</option><option value="me">我</option></select><label className="small" htmlFor="edit-date">事件日期（選填）</label><input id="edit-date" name="eventDate" type="date" defaultValue={message.eventDate} /></>}
    <div className="edit-actions"><Action action="cancel-edit" className="btn">取消</Action><button className="btn primary" type="submit">儲存</button></div>
  </form>;
}
function InlineCreate({ message, kind }: { message: Message; kind: string }) {
  const { snapshot: { state } } = useView(); const draft = state.inlineCreate!; const thought = kind === 'thought';
  return <section className={thought ? 'thought thought-draft' : `inline-reality ${draft.role === 'me' ? 'mine' : ''}`} data-parent-message-id={message.id} aria-label={thought ? '新增附著思緒' : '在此插入現實行動'}><form data-create-kind={kind} data-mid={message.id}>
    <div className={thought ? 'thought-head' : 'inline-create-title'}>{thought ? '新增思緒' : '插入現實行動'}</div>
    {!thought && <div className="composer-tabs" role="group" aria-label="插入行動的記錄對象">{['other', 'me'].map(role => <Action key={role} action="inline-role" className={`chip ${draft.role === role ? 'active' : ''}`} data-role={role} aria-pressed={draft.role === role}>{role === 'me' ? '我' : '對方'}</Action>)}</div>}
    <label htmlFor={`create-${message.id}`} hidden>{thought ? '思緒內容' : '現實行動內容'}</label><textarea id={`create-${message.id}`} name="text" required maxLength={20000} rows={3} placeholder={thought ? '此刻，你想到了什麼？' : '記下對方或自己的實際言語、行動…'} defaultValue={draft.text} />
    <div className="edit-actions"><Action action="cancel-create" className="btn">取消</Action><button type="submit" className="btn primary">{thought ? '新增思緒' : '插入紀錄'}</button></div>
  </form></section>;
}
function ThoughtCard({ message, thought, locked }: { message: Message; thought: Thought; locked: boolean }) {
  const { snapshot: { state } } = useView();
  return <section className="thought" data-thought-id={thought.id} data-parent-message-id={message.id} aria-label={`我的思緒，附著於${message.role === 'me' ? '我' : '對方'}的現實行動`}>
    <div className="thought-head"><span><Icon name="thought" /> 當時的思緒</span>{!locked && <IconAction action="delete-thought" icon="trash" label="刪除此思緒及待驗證假設" data-mid={message.id} data-id={thought.id} />}</div>
    {state.edit?.id === thought.id ? <EditForm key={thought.id} type="thought" id={thought.id} text={thought.text} message={message} /> : locked ? <p className="thought-text">{thought.text}</p> : <Action action="edit-thought" className="thought-text" data-mid={message.id} data-id={thought.id} aria-label={`編輯思緒：${thought.text.slice(0, 40)}`}>{thought.text}</Action>}
    <p className="anchor">↳ 回應{message.role === 'me' ? '我的' : '對方的'}現實行動</p>
    {thought.hypotheses.length > 0 && <div className="hypotheses"><div className="hyp-title">待驗證假設</div>{thought.hypotheses.map(hypothesis => <div className="hyp" data-hypothesis-id={hypothesis.id} key={hypothesis.id}>
      {state.edit?.id === hypothesis.id ? <EditForm key={hypothesis.id} type="hypothesis" id={hypothesis.id} text={hypothesis.text} message={message} thoughtId={thought.id} /> : locked ? <p className="hyp-text">{hypothesis.text}</p> : <Action action="edit-hypothesis" className="hyp-text" data-mid={message.id} data-tid={thought.id} data-id={hypothesis.id} aria-label={`編輯待驗證假設：${hypothesis.text.slice(0, 40)}`}>{hypothesis.text}</Action>}
      {!locked && <IconAction action="delete-hypothesis" icon="trash" label="刪除此待驗證假設" data-mid={message.id} data-tid={thought.id} data-id={hypothesis.id} />}
    </div>)}</div>}
    {!locked && <Action action="add-hypothesis" className="mini-btn" data-mid={message.id} data-id={thought.id}><Icon name="plus" />待驗證假設</Action>}
  </section>;
}
function MessageCard({ message }: { message: Message }) {
  const { snapshot: { state } } = useView(); const locked = state.msgBatch;
  return <article className={`message ${message.role === 'me' ? 'mine' : ''}`} data-message-id={message.id} aria-label={`${message.role === 'me' ? '我' : '對方'}的現實行動`}>
    <div className="message-heading">{locked && <StateInput type="checkbox" data-select-message={message.id} aria-label={`選取現實行動 ${message.text.slice(0, 30)}`} checked={state.selectedMessages.has(message.id)} />}<span>{message.role === 'me' ? '我' : '對方'} · 現實行動</span>{message.eventDate && <time dateTime={message.eventDate}>{message.eventDate}</time>}</div>
    {state.edit?.id === message.id ? <div className="inline-edit"><EditForm key={message.id} type="message" id={message.id} text={message.text} message={message} /></div> : locked ? <div className="bubble">{message.text}</div> : <Action action="edit-message" className="bubble" data-id={message.id} aria-label={`編輯現實行動：${message.text.slice(0, 40)}`}>{message.text}</Action>}
    {!locked && <div className="message-actions"><Action action="add-thought" className="mini-btn" data-id={message.id}><Icon name="plus" />新增思緒</Action><IconAction action="delete-message" icon="trash" label="刪除此現實行動及附著思緒" data-id={message.id} /></div>}
    {message.thoughts.map(thought => <ThoughtCard key={thought.id} message={message} thought={thought} locked={locked} />)}
    {!locked && state.inlineCreate?.messageId === message.id && state.inlineCreate.kind === 'thought' && <InlineCreate key={`thought-${message.id}`} message={message} kind="thought" />}
    {!locked && <div className="insertion-row"><Action action="insert" className="mini-btn" data-id={message.id}><Icon name="plus" />在此插入現實行動</Action></div>}
    {!locked && state.inlineCreate?.messageId === message.id && state.inlineCreate.kind === 'message' && <InlineCreate key={`message-${message.id}`} message={message} kind="message" />}
  </article>;
}
function Composer() {
  const { snapshot: { state, draft } } = useView();
  return <form id="composer" className="composer"><div className="composer-tabs" role="group" aria-label="新增現實行動的記錄對象">{['other', 'me'].map(role => <Action key={role} action="compose-role" className={`chip ${state.role === role ? 'active' : ''}`} data-role={role} aria-pressed={state.role === role} disabled={state.msgBatch}>{role === 'other' ? '對方' : '我'}</Action>)}</div><label htmlFor="draft" hidden>記錄現實中發生的互動</label><textarea id="draft" name="text" placeholder={state.msgBatch ? '批次選取中，完成後可繼續記錄' : '記下對方或自己的實際言語、行動…'} rows={2} maxLength={20000} required disabled={state.msgBatch} defaultValue={draft} /><div className="composer-foot"><span className="composer-label">Enter 換行 · Ctrl / ⌘ + Enter 加入紀錄</span><button type="submit" className="btn primary" disabled={state.msgBatch}>加入紀錄 <Icon name="arrow" /></button></div></form>;
}
function Conversation({ chat }: { chat: Chat }) {
  const { snapshot: { state }, helpers } = useView();
  const matches = chat.messages.filter(message => !state.inQuery || [message.text, ...message.thoughts.flatMap(thought => [thought.text, ...thought.hypotheses.map(h => h.text)])].join(' ').toLocaleLowerCase().includes(state.inQuery.toLocaleLowerCase()));
  return <main className="conversation" aria-label={`${helpers.chatTitle(chat)}的私人紀錄`}>
    <header className="conversation-head"><div className="person"><Action action="back" className="icon mobile-back" aria-label="返回聊天列表"><Icon name="back" /></Action><Avatar chat={chat} /><div><h2>{helpers.chatTitle(chat)}</h2><p>{helpers.categoryName(chat.categoryId)} <span aria-hidden="true">／</span> 私人互動紀錄</p></div></div><div className="head-actions"><IconAction action="in-search" icon="search" label="搜尋此聊天" /><IconAction action="msg-batch" icon="check" label={state.msgBatch ? '結束多選' : '批次編輯紀錄'} /><IconAction action="chat-settings" icon="settings" label="聊天設定" /></div></header>
    {state.showSearch && <div className="conversation-search"><label htmlFor="in-search" hidden>搜尋此聊天的紀錄</label><StateInput id="in-search" type="search" placeholder="搜尋此聊天的紀錄…" value={state.inQuery} /><span>{matches.length} 則現實行動</span><IconAction action="close-search" icon="close" label="關閉聊天搜尋" /></div>}
    {state.msgBatch && <div className="batchbar"><span>已選 {state.selectedMessages.size} 則現實行動</span><Action action="select-messages" className="text-btn">全選</Action><Action action="batch-role-me" className="btn" disabled={!state.selectedMessages.size}>改為「我」</Action><Action action="batch-role-other" className="btn" disabled={!state.selectedMessages.size}>改為「對方」</Action><Action action="batch-message-delete" className="btn danger" disabled={!state.selectedMessages.size}>刪除</Action><Action action="msg-batch" className="text-btn">完成</Action></div>}
    <section id="timeline" className="timeline" aria-label="現實互動時間軸" tabIndex={-1}><StorageAlert /><div className="month"><time dateTime={helpers.ym(chat.createdAt)}>{helpers.month(chat.createdAt)}</time></div><p className="intro">{chat.isDemo ? '這是一段示範紀錄，可自由編輯或刪除。' : '這裡的對話與思緒，都由你自由記錄。'}<br />每個想法，都可以先留在這裡。</p>{matches.length ? matches.map(message => <MessageCard key={message.id} message={message} />) : <div className="empty">{state.inQuery ? '沒有符合的紀錄' : '從一則現實互動開始。'}</div>}</section>
    <Composer key={chat.id} />
  </main>;
}
function Trash() {
  const { snapshot: { db }, helpers } = useView();
  return <main className="conversation"><header className="conversation-head"><div className="person"><Action action="back" className="icon mobile-back" aria-label="返回聊天列表"><Icon name="back" /></Action><div><h2>回收桶</h2><p>刪除後保留 30 天，可在這裡復原。</p></div></div></header><section id="timeline" className="timeline" aria-label="可復原的已刪除紀錄">{db.trash.length ? db.trash.map(item => <article className="trash-card" key={item.id}><div><h3>{item.label}</h3><p>{item.summary} · {helpers.month(item.deletedAt)}</p></div><Action action="restore" className="btn" data-id={item.id}><Icon name="restore" />復原</Action></article>) : <div className="empty">回收桶目前是空的。</div>}</section></main>;
}
function Workspace() {
  const { snapshot: { state }, helpers } = useView(); const chat = helpers.current();
  return <><Rail /><ChatList />{state.page === 'trash' ? <Trash /> : chat ? <Conversation key={chat.id} chat={chat} /> : <main className="conversation"><div className="empty"><StorageAlert empty /><h3>為一段互動留個位置</h3><p>建立聊天，記下現實中的互動與思緒。</p><Action action="new-chat" className="btn primary">新增聊天</Action></div></main>}</>;
}
export function App(props: AppProps) {
  return <ViewContext.Provider value={props}>{props.snapshot.cloudGate && !props.snapshot.cloudState.ready ? <CloudGate /> : <Workspace />}</ViewContext.Provider>;
}
export default App;
