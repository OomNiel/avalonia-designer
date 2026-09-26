// Bump the 18 bundled-copy stamps (line 1 of every resources/*.cs|.vb). A t2 test compares each stamp with
// package.json, so this is the one bulk edit that is easy to get wrong by hand.
// Usage: node tools/bump-stamps.js 0.12.13
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
    console.error('usage: node tools/bump-stamps.js <major.minor.patch>');
    process.exit(1);
}

const dir = path.join(__dirname, '..', 'resources');
const files = fs.readdirSync(dir).filter((f) => /\.(cs|vb)$/.test(f));
let changed = 0;
for (const f of files) {
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, 'utf8');
    const next = text.replace(/BUNDLED-COPY: \d+\.\d+\.\d+/, `BUNDLED-COPY: ${version}`);
    if (next !== text) {
        fs.writeFileSync(p, next);
        changed++;
    }
}
console.log(`stamped ${changed} of ${files.length} files with ${version}`);
