// Post-build: serve a static copy of the SPA at /app so plain static servers
// (and nginx) return 200 for both "/" (landing) and "/app" (dashboard).
// The app seeds its hash route (#/app) from the pathname on load.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/app', { recursive: true });
cpSync('dist/index.html', 'dist/app/index.html');
console.log('postbuild: dist/app/index.html written');
