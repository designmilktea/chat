// Start Vite separately, then BASE_URL=http://127.0.0.1:5173/chat/ node tests/react-browser.test.mjs.
// Optional PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs and BROWSER_EXECUTABLE.
// Real browser + application code; Firebase SDK boundary is replaced by synthetic
// modules backed by same-origin, route-fulfilled REST fixtures. This does NOT test
// real OAuth, Firebase SDK, deployed Rules, or production data. All external
// requests are blocked. No application-only test hooks or real credentials.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
await mkdir('.test-artifacts', {recursive:true});

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5173/chat/';
const origin = new URL(baseURL).origin;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw Error('BASE_URL must be a local test server. Production URLs are refused.');
}
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const fixture = {
  version: 1,
  categories: [{id: 'cat-friends', name: '朋友', color: '#83a999'}, {id: 'cat-work', name: '公事', color: '#91a2b2'}],
  chats: [
    {id: 'chat-coffee', categoryId: 'cat-friends', name: '測試朋友', createdAt: '2026-11-15T03:00:00.000Z', messages: [
      {id: 'message-coffee', role: 'other', text: '週末一起喝咖啡嗎？', eventDate: '', createdAt: '2026-11-15T03:00:00.000Z', thoughts: []},
      {id: 'message-answer', role: 'me', text: '好，下午三點見。', eventDate: '', createdAt: '2026-11-15T03:01:00.000Z', thoughts: []},
    ]},
    {id: 'chat-work', categoryId: 'cat-work', name: '測試同事', createdAt: '2026-10-12T03:00:00.000Z', messages: [
      {id: 'message-work', role: 'other', text: '下週一起確認需求。', eventDate: '', createdAt: '2026-10-12T03:00:00.000Z', thoughts: []},
    ]},
  ], trash: [],
};
// Equivalent wire records to the production codec, independent of React/UI state.
const records = new Map();
const put = (id, kind, body) => records.set(id, {kind, body: JSON.stringify(body)});
put('meta', 'meta', {version: 1});
fixture.categories.forEach((value, index) => put('category:' + value.id, 'category', {...value, index}));
fixture.chats.forEach(({messages, ...chat}, index) => {
  put('chat:' + chat.id, 'chat', {...chat, index});
  messages.forEach(({thoughts, ...message}, index) => put('message:' + message.id, 'message', {...message, chatId: chat.id, index}));
});
let revision = 1, saves = 0, holdCommit = false, releaseCommit;
const blocked = [], pageErrors = [];
const authModule = `
const auth={currentUser:null}, listeners=new Set();
export const browserLocalPersistence={},browserPopupRedirectResolver={};
export class GoogleAuthProvider{}
export const initializeAuth=()=>auth,getAuth=()=>auth;
export const setPersistence=async()=>{};
export function onAuthStateChanged(a,fn){listeners.add(fn);queueMicrotask(()=>fn(auth.currentUser));return()=>listeners.delete(fn)}
export async function signInWithPopup(){const r=await fetch('/__test__/auth',{method:'POST'});auth.currentUser=await r.json();for(const fn of listeners)fn(auth.currentUser);return{user:auth.currentUser}}
export async function signOut(){auth.currentUser=null;for(const fn of listeners)fn(null)}
`;
const firestoreModule = `
export const getFirestore=()=>({});
export const doc=(s,...p)=>({path:p.join('/')}),collection=doc,serverTimestamp=()=>({__testTimestamp:true});
const snap=(value)=>({exists:()=>value!==null,data:()=>value});
export async function getDocFromServer(ref){const r=await fetch('/__test__/document?path='+encodeURIComponent(ref.path));return snap(await r.json())}
export async function getDocsFromServer(ref){const r=await fetch('/__test__/records?path='+encodeURIComponent(ref.path));return{docs:(await r.json()).map(([id,value])=>({id,data:()=>value}))}}
export async function runTransaction(store,fn){const changes=[];const tx={get:getDocFromServer,set:(ref,value)=>changes.push({path:ref.path,value}),delete:ref=>changes.push({path:ref.path,value:null})};await fn(tx);const r=await fetch('/__test__/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(changes)});if(!r.ok)throw Error('Synthetic transaction failed')}
`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers: 'block'});
context.setDefaultTimeout(10000);
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname === 'www.gstatic.com' && /\/firebasejs\/[^/]+\/firebase-(app|auth|firestore)\.js$/.test(url.pathname)) {
    const body = url.pathname.endsWith('firebase-app.js') ? 'export const initializeApp=()=>({});'
      : url.pathname.endsWith('firebase-auth.js') ? authModule : firestoreModule;
    return route.fulfill({contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin': '*'}, body});
  }
  if (url.origin !== origin) {blocked.push(url.href); return route.abort();}
  if (!url.pathname.startsWith('/__test__/')) return route.continue();
  const respond = body => route.fulfill({contentType: 'application/json', body: JSON.stringify(body)});
  const path = url.searchParams.get('path') || '';
  if (url.pathname === '/__test__/auth') return respond({uid: 'synthetic-user', email: 'browser@example.test'});
  // Catch accidental cross-user path access in the actual cloud adapter.
  if (path && !path.startsWith('users/synthetic-user/')) throw Error('Unexpected UID access: ' + path);
  if (url.pathname === '/__test__/document') return respond({revision, updatedAt: null});
  if (url.pathname === '/__test__/records') return respond([...records]);
  if (url.pathname === '/__test__/commit') {
    if (holdCommit) await new Promise(resolve => {releaseCommit = resolve;});
    for (const change of route.request().postDataJSON()) {
      if (!change.path.startsWith('users/synthetic-user/')) throw Error('Unexpected commit UID');
      if (change.path.endsWith('/sync/state')) revision = change.value.revision;
      else {const id = change.path.split('/').at(-1); change.value === null ? records.delete(id) : records.set(id, change.value);}
    }
    saves++; return respond({ok: true});
  }
  throw Error('Unexpected fixture request: ' + url.href);
});
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
const action = name => page.locator(`[data-action="${name}"]:visible`);
const click = name => action(name).first().click();
const message = page.locator('[data-message-id="message-coffee"]');
const waitCount = async (locator, expected) => {
  const until = Date.now() + 10000;
  while (await locator.count() !== expected && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await locator.count(), expected);
  if (expected) await locator.first().waitFor({state: 'visible'});
};
const waitSaved = async before => {
  await page.waitForFunction(() => [...document.querySelectorAll('.rail-foot, #cloud-panel')].some(el => el.textContent.includes('已同步至雲端')));
  assert.ok(saves > before, 'UI reports confirmed save only after fixture commit');
};
try {
  await page.goto(baseURL);
  await page.locator('.cloud-gate').waitFor();
  assert.equal(await page.locator('[data-message-id]').count(), 0, 'login gate hides private records');
  await click('cloud-settings');
  await action('cloud-login').waitFor({state: 'visible'});
  await page.waitForFunction(() => !document.querySelector('[data-action="cloud-login"]')?.disabled);
  await click('cloud-login');
  await message.waitFor();
  if (await page.locator('#modal[open]').count()) await click('modal-cancel');
  for (const selector of ['.rail', '.chat-panel', '.conversation']) assert.equal(await page.locator(selector).isVisible(), true, selector + ' visible on desktop');
  const railBox = await page.locator('.rail').boundingBox(), listBox = await page.locator('.chat-panel').boundingBox(), chatBox = await page.locator('.conversation').boundingBox();
  assert.ok(railBox.x + railBox.width <= listBox.x + 2 && listBox.x + listBox.width <= chatBox.x + 2, 'desktop three columns do not overlap');

  await page.locator('#global-search').fill('測試同事');
  await waitCount(page.locator('.chat-item'), 1);
  assert.ok((await page.locator('.chat-list').innerText()).includes('測試同事'));
  await page.locator('#global-search').fill('');
  await waitCount(page.locator('.chat-item'), 2);
  await page.locator('#category-filter').selectOption('cat-work');
  await waitCount(page.locator('.chat-item'), 1);
  await page.locator('#category-filter').selectOption('');
  await page.locator('#date-filter').fill('2026-10');
  await waitCount(page.locator('.chat-item'), 1);
  await page.locator('#date-filter').fill('');

  await message.locator('[data-action="add-thought"]').click();
  await message.locator('form[data-create-kind="thought"] textarea').fill('合成測試：很期待這次見面。');
  let before = saves;
  await message.locator('form[data-create-kind="thought"] button[type="submit"]').click();
  const thought = message.locator('[data-thought-id]').first();
  await thought.waitFor();
  await waitSaved(before);
  const thoughtBox = await thought.boundingBox(), parentBox = await message.boundingBox();
  assert.ok(Math.abs(parentBox.x + parentBox.width - thoughtBox.x - thoughtBox.width) < 4, 'attached thought is aligned right');
  await thought.locator('[data-action="edit-thought"]').click();
  await thought.locator('form[data-edit-type="thought"] textarea').fill('合成測試：期待，也有一點緊張。');
  await thought.locator('form[data-edit-type="thought"] button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('[data-action="edit-thought"]')?.textContent.includes('也有一點緊張'));
  await thought.locator('[data-action="add-hypothesis"]').click();
  await page.locator('#hyp-new').fill('合成測試：她可能也想分享近況。');
  await page.locator('#modal-form button[type="submit"]').click();
  await thought.locator('[data-hypothesis-id]').waitFor();

  await page.screenshot({path:'.test-artifacts/desktop.png',fullPage:true});
  await thought.locator('[data-action="delete-hypothesis"]').click();
  await page.locator('#modal[open]').waitFor();
  await page.screenshot({path:'.test-artifacts/delete-confirm.png'});
  assert.equal(await thought.locator('[data-hypothesis-id]').count(), 1, 'opening confirmation does not delete');
  await click('modal-cancel');
  assert.equal(await thought.locator('[data-hypothesis-id]').count(), 1, 'cancel preserves hypothesis');
  await thought.locator('[data-action="delete-hypothesis"]').click();
  await page.locator('#modal-form button[type="submit"]').click();
  await waitCount(thought.locator('[data-hypothesis-id]'), 0);
  await click('page-trash');
  await page.locator('.trash-card').waitFor();
  await click('restore');
  await click('page-chats');
  await message.locator('[data-hypothesis-id]').waitFor();

  // Hold one real adapter transaction at its REST boundary. Type while the
  // application is saving, then release it and verify the resulting rerender.
  before = saves; holdCommit = true;
  await page.locator('#draft').fill('合成測試：已提交的現實行動。');
  await page.locator('#composer button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#draft')?.value === '');
  await page.locator('#draft').fill('合成測試：尚未送出的草稿。');
  const until = Date.now() + 10000;
  while (!releaseCommit && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(releaseCommit, 'save reaches held synthetic transaction');
  holdCommit = false; releaseCommit(); releaseCommit = undefined;
  await waitSaved(before);
  assert.equal(await page.locator('#draft').inputValue(), '合成測試：尚未送出的草稿。', 'sync completion preserves composer draft');

  await click('msg-batch');
  await message.locator('[data-select-message]').check();
  await click('batch-role-me');
  assert.ok((await message.getAttribute('class')).split(' ').includes('mine'), 'batch changes selected role');
  assert.equal(await page.locator('#draft').isDisabled(), true, 'batch mode disables composer');
  await click('msg-batch');
  assert.equal(await page.locator('#draft').isDisabled(), false);
  await click('chat-batch');
  await page.locator('[data-select-chat="chat-work"]').check();
  await click('batch-chat-edit');
  await page.locator('#batch-category').selectOption('cat-friends');
  await page.locator('#modal-form button[type="submit"]').click();
  assert.ok((await page.locator('[data-chat-id="chat-work"] .chat-category').innerText()).includes('朋友'));
  await click('chat-batch');

  await page.setViewportSize({width: 390, height: 844});
  await click('back');
  assert.equal(await page.locator('.chat-panel').isVisible(), true);
  assert.equal(await page.locator('.conversation').isVisible(), false);
  await page.locator('[data-action="open-chat"][data-id="chat-coffee"]').click();
  assert.equal(await page.locator('.conversation').isVisible(), true);
  assert.equal(await page.locator('.chat-panel').isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile viewport has no horizontal document overflow');
  await page.screenshot({path:'.test-artifacts/mobile-chat.png',fullPage:true});
  await click('back');
  assert.equal(await page.locator('.chat-panel').isVisible(), true);
  await page.screenshot({path:'.test-artifacts/mobile-list.png',fullPage:true});
  assert.deepEqual(blocked, [], 'no requests leave local server or mocked SDK modules');
  assert.deepEqual(pageErrors, [], 'no uncaught browser errors');
  console.log('PASS: React browser regression: synthetic sign-in/load, desktop columns, search/category/month, attached thought edit/hypothesis, delete cancel/confirm/restore, sync draft retention, batch roles/category, mobile back. Production untouched.');
} finally {
  await page.screenshot({path:'.test-artifacts/last-state.png',fullPage:true}).catch(()=>{});
  holdCommit = false; releaseCommit?.();
  await context.close(); await browser.close();
}
