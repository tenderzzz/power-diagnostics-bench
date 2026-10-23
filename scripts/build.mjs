import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(import.meta.dirname), out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'src'), out, { recursive: true });
console.log('Built offline static application in dist/.');
