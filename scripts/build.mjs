import fs from 'node:fs';
fs.mkdirSync('dist/server', { recursive: true });
fs.mkdirSync('dist/.openai', { recursive: true });
const assetTypes = {
  'live-model.js': 'text/javascript;charset=utf-8',
  'calendar-export.js': 'text/javascript;charset=utf-8',
  'calendar.js': 'text/javascript;charset=utf-8',
  'settings.js': 'text/javascript;charset=utf-8',
  'index.html': 'text/html;charset=utf-8',
  'app.js': 'text/javascript;charset=utf-8',
  'model.js': 'text/javascript;charset=utf-8',
  'navigation.js': 'text/javascript;charset=utf-8',
  'postseason.js': 'text/javascript;charset=utf-8',
  'styles.css': 'text/css;charset=utf-8',
  'icon.svg': 'image/svg+xml',
  'manifest.webmanifest': 'application/manifest+json',
  'sw.js': 'text/javascript;charset=utf-8'
};
const assets = Object.fromEntries(
  Object.entries(assetTypes).map(([file, type]) => [
    file === 'index.html' ? '/' : '/' + file,
    { body: fs.readFileSync('public/' + file, 'utf8'), type }
  ])
);
assets['/robots.txt'] = { body: 'User-agent: *\nDisallow: /', type: 'text/plain' };
const helpers = ['pregame', 'clips', 'api', 'relay', 'standings', 'news', 'videos', 'postseason', 'recap']
  .map((n) => fs.readFileSync('worker/' + n + '.js', 'utf8').replaceAll('export ', '').replace(/^import .*;\n/gm, ''))
  .join('\n');
const videosSnapshot = JSON.parse(fs.readFileSync('worker/videos-snapshot.json', 'utf8'));
const newsSnapshot = JSON.parse(fs.readFileSync('worker/news-snapshot.json', 'utf8'));
const server = fs.readFileSync('worker/server.js', 'utf8').replace(/^import .*;\n/gm, '');
const snapshot = JSON.parse(fs.readFileSync('worker/snapshot.json', 'utf8')),
  rankSnapshot = JSON.parse(fs.readFileSync('worker/standings-snapshot.json', 'utf8'));
fs.writeFileSync(
  'dist/server/index.js',
  'const recapModel = (() => {\n' + fs.readFileSync('public/model.js', 'utf8').replaceAll('export ', '') + '\nreturn {summarizeGame};})();\n' + helpers +
    '\nconst assets=' +
    JSON.stringify(assets) +
    ';\nconst snapshot=' +
    JSON.stringify(snapshot) +
    ';\nconst rankSnapshot=' +
    JSON.stringify(rankSnapshot) +
    ';\nconst newsSnapshot=' +
    JSON.stringify(newsSnapshot) +
    ';\nconst videosSnapshot=' +
    JSON.stringify(videosSnapshot) +
    ';\n' +
    server
);
fs.copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built KIA Diamond worker and 7 assets');
