const fs = require('fs');
const path = require('path');

function scan(dir) {
  const results = [];
  for (const f of fs.readdirSync(dir, {withFileTypes: true})) {
    if (!f.isDirectory()) continue;
    const p = path.join(dir, f.name);
    const files = fs.readdirSync(p).filter(x => x.endsWith('.js'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(p, file), 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (/[^.a-zA-Z0-9_]window[^a-zA-Z0-9_]/.test(line)) {
          if (/\bvscode_\d*\.window\b/.test(line)) continue;
          if (/windowCapabilit/.test(line)) continue;
          if (/window\/[a-zA-Z]/.test(line)) continue;
          if (/remoteWindow/.test(line)) continue;
          if (/getWindow/.test(line)) continue;
          if (/activeWindow/.test(line)) continue;
          if (/this\.window/.test(line)) continue;
          if (/outputChannel/.test(line)) continue;
          results.push(path.join(dir, f.name, file) + ':' + (i+1) + ': ' + line.trim().substring(0, 120));
        }
      }
    }
  }
  return results;
}

// Client deps
const clientResults = scan(path.join('node_modules', 'vscode-languageclient', 'lib'));
if (clientResults.length) {
  console.log('=== vscode-languageclient ===');
  clientResults.forEach(r => console.log(r));
}

// Server deps
const serverDeps = ['vscode-languageserver', 'vscode-languageserver-protocol', 'vscode-languageserver-textdocument'];
for (const dep of serverDeps) {
  const depPath = path.join('server', 'node_modules', dep, 'lib');
  if (!fs.existsSync(depPath)) continue;
  const serverResults = scan(depPath);
  if (serverResults.length) {
    console.log('\n=== ' + dep + ' ===');
    serverResults.forEach(r => console.log(r));
  }
}

console.log('\nDone.');
