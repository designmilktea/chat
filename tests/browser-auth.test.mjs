// Optional real-browser check. Install Playwright outside the repository, then
// set PLAYWRIGHT_MODULE to its index.mjs and BROWSER_EXECUTABLE to Chrome.
// Uses an isolated temporary browser profile, synthetic Google credentials and
// mocked Auth Emulator responses. Production Auth/Firestore requests are blocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const sdk='https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
const fixture=`<!doctype html><title>Isolated auth persistence test</title><script type="module">
 import {connectCloud} from '/firebase-cloud.mjs';
 import {getAuth,connectAuthEmulator,GoogleAuthProvider,signInWithCredential,setPersistence,browserSessionPersistence} from '${sdk}';
 const auth=getAuth();
 connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 window.users=[];
 window.cloud=await connectCloud(user=>window.users.push(user?.uid??null));
 window.testLogin=uid=>signInWithCredential(auth,GoogleAuthProvider.credential(JSON.stringify({sub:uid,email:uid+'@example.test'})));
 window.testSession=()=>setPersistence(auth,browserSessionPersistence);
 window.currentUid=()=>auth.currentUser?.uid??null;
 await auth.authStateReady();window.ready=true;
 </script>`;
const config=`export const firebaseConfig={apiKey:'demo-chat-tests',projectId:'demo-chat-tests',authDomain:'demo-chat-tests.firebaseapp.com',appId:'demo-chat-tests'};`;
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end(fixture);return}
  res.setHeader('Content-Type','text/javascript');
  if(name==='/firebase-config.js'){res.end(config);return}
  if(!['/firebase-cloud.mjs','/cloud-codec.mjs'].includes(name)){res.writeHead(404);res.end();return}
  res.end(await readFile(new URL('../dist'+name,import.meta.url)));
 }catch{res.writeHead(500);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp(join(tmpdir(),'chat-auth-browser-'));
let context;const blocked=[],errors=[];
const debug=message=>{if(process.env.DEBUG_AUTH_TEST)console.error(message)};
function token(uid){const now=Math.floor(Date.now()/1000);return [
 {alg:'none',typ:'JWT'},
 {iss:'https://securetoken.google.com/demo-chat-tests',aud:'demo-chat-tests',sub:uid,user_id:uid,iat:now,exp:now+3600,auth_time:now,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{'google.com':[uid]}}}
].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.'}
async function launch(){
 debug('Launching isolated browser');
 context=await chromium.launchPersistentContext(profile,{headless:true,timeout:20000,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 debug('Browser launched');
 context.setDefaultTimeout(20000);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());debug(request.method()+' '+url.origin+url.pathname);
  if(url.origin===origin||url.origin==='https://www.gstatic.com')return route.continue();
  if(url.origin==='http://127.0.0.1:9099'){
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   let body;try{body=request.postDataJSON()}catch{body={}}
   let result;
   if(url.pathname.endsWith('/accounts:signInWithIdp')){
    const credential=JSON.parse(new URLSearchParams(body.postBody).get('id_token'));
    const uid=credential.sub;
    result={localId:uid,email:uid+'@example.test',emailVerified:true,providerId:'google.com',idToken:token(uid),refreshToken:'fake-refresh-'+uid,expiresIn:'3600'};
   }else if(url.pathname.endsWith('/accounts:lookup')){
    const uid=JSON.parse(Buffer.from(body.idToken.split('.')[1],'base64url')).sub;
    result={users:[{localId:uid,email:uid+'@example.test',emailVerified:true,providerUserInfo:[{providerId:'google.com',rawId:uid,email:uid+'@example.test'}],createdAt:'1794000000000',lastLoginAt:'1794000000000'}]};
   }else{blocked.push(url.href);return route.abort()}
   return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(result)});
  }
  blocked.push(url.href);return route.abort();
 });
 context.on('page',page=>{page.on('pageerror',error=>{errors.push(error.message);debug(error.message)});page.on('requestfailed',request=>debug('Request failed: '+request.url()+' '+request.failure()?.errorText))});
}
async function open(){const page=await context.newPage();await page.goto(origin);try{await page.waitForFunction(()=>window.ready===true)}catch(error){throw Error('Auth fixture failed: '+JSON.stringify({errors,blocked})+'; '+error.message)}return page}
try{
 await launch();let page=await open();
 assert.equal(await page.evaluate(()=>currentUid()),null);
 await page.evaluate(()=>testLogin('test-user-a'));
 await page.reload();await page.waitForFunction(()=>window.ready);
 assert.equal(await page.evaluate(()=>currentUid()),'test-user-a');
 await context.close();await launch();page=await open();
 assert.equal(await page.evaluate(()=>currentUid()),'test-user-a','full browser restart must restore local auth');
 const second=await open();
 await page.evaluate(()=>testLogin('test-user-b'));
 await second.waitForFunction(()=>currentUid()==='test-user-b');
 await second.evaluate(()=>cloud.logout());
 await page.waitForFunction(()=>currentUid()===null);
 await context.close();await launch();page=await open();
 assert.equal(await page.evaluate(()=>currentUid()),null,'explicit sign-out must survive restart');
 // Legacy session-only logins require one sign-in after this release. Their
 // session storage is not read by the new local-only initializer.
 await page.evaluate(()=>testSession());await page.evaluate(()=>testLogin('test-user-a'));
 await page.reload();await page.waitForFunction(()=>window.ready);
 assert.equal(await page.evaluate(()=>currentUid()),null,'legacy session may require one new sign-in');
 await page.evaluate(()=>testLogin('test-user-a'));
 await context.close();await launch();page=await open();
 assert.equal(await page.evaluate(()=>currentUid()),'test-user-a','new sign-in after a legacy session must be durable');
 await page.evaluate(()=>cloud.logout());
 assert.deepEqual(blocked,[],'no production Auth/Firestore or unexpected network requests');
 assert.deepEqual(errors,[]);
 console.log('PASS: real Firebase 13.1.0 in Chrome; reload, full browser restart, cross-tab account replacement/sign-out, sign-out after restart, and durable sign-in after a legacy session. Production Auth/Firestore untouched.');
}finally{await context?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true})}
