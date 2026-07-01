const fs = require('fs');
const path = require('path');

function checkDir(dir) {
  for (const f of fs.readdirSync(dir, {withFileTypes: true})) {
    const fp = path.join(dir, f.name);
    if (f.isDirectory()) { checkDir(fp); continue; }
    if (!f.name.endsWith('.js')) continue;
    const content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/\bwindow\b/.test(lines[i]) && !/\.window\b/.test(lines[i]) && !/windowCapabilit/.test(lines[i]) && !/windows/.test(lines[i].toLowerCase())) {
        console.log(`${fp}:${i+1}: ${lines[i].trim()}`);
      }
    }
  }
}

// Check server deps
console.log('=== server/node_modules ===');
checkDir('server/node_modules');

// Check client deps  
console.log('\n=== node_modules ===');
checkDir('node_modules');
