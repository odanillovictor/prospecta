const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
fs.renameSync(path.join(dist, 'index.html'), path.join(dist, 'app.html'));
console.log('post-build: dist/index.html → dist/app.html');
