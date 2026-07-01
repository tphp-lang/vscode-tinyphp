// Test server loading to reproduce window error
process.argv = ['node', 'server.js', '--node-ipc', '0'];
try {
    require('../server/out/server.js');
    console.log('Server loaded OK');
} catch(e) {
    console.error('ERROR:', e.message);
    if (e.stack) console.error(e.stack);
}
