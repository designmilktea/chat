// Exercise the migrated runtime in the existing isolated VM tests. No legacy
// production implementation is kept just to satisfy the tests.
const fs = require('node:fs');
const {transformSync} = require('esbuild');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const Module = require('node:module');
const path = require('node:path');
let cached;
function renderer() {
  if (!cached) {
    const filename = path.resolve('src/ui/App.tsx');
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {loader:'tsx',format:'cjs',jsx:'automatic'}).code;
    const m = new Module(filename, module); m.filename=filename; m.paths=module.paths;
    m._compile(code,filename); cached=m.exports.default || m.exports.App;
  }
  return (snapshot,helpers)=>renderToStaticMarkup(React.createElement(cached,{snapshot,helpers}));
}
const source=fs.readFileSync('src/core/runtime.js','utf8');
const begin=source.indexOf("const LEGACY_KEY=");
const split=source.indexOf('const icons=');
const end=source.indexOf('\n function start()');
if(begin<0||split<0||end<0)throw Error('Runtime test fixture boundaries changed');
module.exports={
  cloudSource: `let disposed=false,started=true;function listen(target,type,handler){target.addEventListener(type,handler)}\n`+source.slice(begin,split),
  appSource: source.slice(split,end)+`\nfunction renderView(snapshot){app.innerHTML=__render(snapshot,{icons,categoryName,chatTitle,categoryColor,avatarStyle,current,filteredChats,ym,month,cloudLabel})}\nrender();if(!loadError&&!(cloudGate&&!cloudState.ready)){try{persist()}catch(error){render();notify(error.message)}}else notify(storageIssue);registerAgentTools();`,
  render:(...args)=>renderer()(...args),
};
