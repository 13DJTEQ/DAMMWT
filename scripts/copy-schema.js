const { copyFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const src = join(__dirname, '..', 'src', 'database', 'schema.sql');
const destDir = join(__dirname, '..', 'dist', 'database');
const dest = join(destDir, 'schema.sql');

if (!existsSync(src)) {
  console.error('Missing src/database/schema.sql');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('Copied schema.sql → dist/database/schema.sql');
