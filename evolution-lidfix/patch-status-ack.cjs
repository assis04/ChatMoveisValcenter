// patch-status-ack.cjs - Baileys 7.0.0-rc.9: confirma (ack) as stanzas <status> do WhatsApp.
// Sem o ack o servidor derruba o socket ~50 min depois ("stream errored out" com
// <ack class="status">) e a instancia fica "open" enviando, mas sem receber.
// Mesmo patch do PR evolution-foundation/evolution-api#2788. Roda no build e aborta
// se o fonte nao for exatamente o esperado.
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = process.argv[2] || '/evolution';
const fail = msg => { console.error('PATCH STATUS-ACK ABORTADO: ' + msg); process.exit(1); };

const bundle = ROOT + '/dist/main.js';
if (fs.existsSync(bundle) && fs.readFileSync(bundle, 'utf8').includes('makeMessagesRecvSocket')) {
  fail('Baileys esta embutido no main.js; patch no node_modules nao teria efeito');
}

// Toda copia do baileys (inclusive aninhada em node_modules de outro pacote).
const files = [];
const pkgDirs = nm => fs.readdirSync(nm, { withFileTypes: true }).flatMap(e => {
  if (!e.isDirectory()) return [];
  const p = nm + '/' + e.name;
  return e.name.startsWith('@') ? pkgDirs(p) : [p];
});
(function walk(nm) {
  for (const p of pkgDirs(nm)) {
    if (p.endsWith('/baileys') && fs.existsSync(p + '/lib/Socket/messages-recv.js')) files.push(p + '/lib/Socket/messages-recv.js');
    if (fs.existsSync(p + '/node_modules')) walk(p + '/node_modules');
  }
})(ROOT + '/node_modules');
if (!files.length) fail('messages-recv.js do baileys nao encontrado');

const EDITS = [
  ['    const handleNotification = async (node) => {\n',
   '    const handleStatus = async (node) => {\n' +
   '        await sendMessageAck(node);\n' +
   '    };\n' +
   '    const handleNotification = async (node) => {\n'],
  ["            ['notification', handleNotification]\n        ]);",
   "            ['notification', handleNotification],\n" +
   "            ['status', handleStatus]\n" +
   '        ]);'],
  ["    ws.on('CB:ack,class:message', (node) => {",
   "    ws.on('CB:status', async (node) => {\n" +
   "        await processNode('status', node, 'handling status', handleStatus);\n" +
   '    });\n' +
   "    ws.on('CB:ack,class:message', (node) => {"],
];

for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(file.replace(/lib\/Socket\/messages-recv\.js$/, 'package.json'), 'utf8'));
  if (pkg.name !== 'baileys') fail(file + ': pacote ' + pkg.name);
  if (pkg.version !== '7.0.0-rc.9') fail(file + ': baileys ' + pkg.version + ' (esperado 7.0.0-rc.9)');
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('CB:status') || src.includes('handleStatus')) fail(file + ': ja tem handler de status');
  for (const [from, to] of EDITS) {
    const n = src.split(from).length - 1;
    if (n !== 1) fail(file + ': ancora encontrada ' + n + 'x (esperado 1): ' + JSON.stringify(from.slice(0, 50)));
    src = src.replace(from, () => to);
  }
  fs.writeFileSync(file, src);
  execFileSync(process.execPath, ['--check', file]);
  const ok = (src.match(/handleStatus/g) || []).length === 3 && (src.match(/CB:status/g) || []).length === 1;
  if (!ok) fail(file + ': verificacao final falhou');
  console.log('PATCH STATUS-ACK OK: ' + file);
}
