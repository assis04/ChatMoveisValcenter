// patch-lidnull.js - Fork Valcenter (2026-11-05). Roda no build da imagem evolution-lidfix.
//
// Evolution 2.3.7 (Baileys 7.0.0-rc.9): msg de GRUPO que falha ao descriptografar e
// reenviada pelo celular chega sem key.participant/participantAlt e com
// pushName = "<lid>@lid". O ChatwootService quebra em participant.split (eventWhatsapp e
// createConversation) DEPOIS de criar a conversa -> mensagem descartada (~3/dia).
//
// Fix: no inicio do eventWhatsapp (so messages.upsert de grupo sem participant) reconstitui
// a key: participant = LID; telefone pelo lidMapping da Baileys ou, se ela nao souber, por
// outra msg do mesmo LID no banco; nome pelo Contact. Com participantAlt + addressingMode
// "lid" a msg segue o caminho normal (o mesmo das msgs de grupo que ja funcionam).
// Sem telefone: entra como "Participante" em vez de sumir.
//
// Uso: node patch-lidnull.js /evolution/dist/main.js   (aborta se o codigo mudou)
'use strict';
const fs = require('fs');

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const count = (hay, needle) => hay.split(needle).length - 1;

const SIG = 'async eventWhatsapp(s,e,t){try{let o=this.waMonitor.waInstances[e.instanceName];';
const HEAD = 'if(s==="messages.upsert"||s==="send.message"){';
const ANCHOR = HEAD + 'if(this.logger.info(';

if (src.includes('lid-null-fix')) throw new Error('patch ja aplicado');
if (count(src, SIG) !== 1) throw new Error('assinatura do eventWhatsapp mudou (' + count(src, SIG) + 'x)');
if (count(src, ANCHOR) !== 1) throw new Error('ancora mudou (' + count(src, ANCHOR) + 'x)');
const gap = src.indexOf(ANCHOR) - src.indexOf(SIG);
if (gap < 0 || gap > 3000) throw new Error('ancora fora do eventWhatsapp (distancia ' + gap + ')');

const FIX = [
  'if(s==="messages.upsert"&&t?.key?.remoteJid?.endsWith("@g.us")&&!t.key.participant)try{',
  'if(t.key.fromMe){const w=o?.instance?.wuid||o?.client?.user?.id;',
  'w&&(t.key.participant=String(w).replace(/:\\d+@/,"@"))}',
  'else{const l=t.key.participantAlt||(/@lid$/.test(t.pushName||"")?t.pushName:null);',
  'if(l){t.key.participant=l;let p=null;',
  'try{p=await o?.client?.signalRepository?.lidMapping?.getPNForLID?.(l)}catch{}',
  'if(!p&&/@lid$/.test(l)){const r=await this.prismaRepository.message.findMany(',
  '{where:{key:{path:["participant"],equals:l}},select:{key:!0},take:30});',
  'p=r.find(x=>x?.key?.participantAlt)?.key?.participantAlt||null}',
  'if(p&&/@lid$/.test(l)){p=String(p).replace(/:\\d+@/,"@");t.key.participantAlt=p;t.key.addressingMode="lid"}',
  'if(/@lid$/.test(t.pushName||"")){let c=null;',
  'if(p)c=await this.prismaRepository.contact.findFirst(',
  '{where:{remoteJid:p,instanceId:e.instanceId},select:{pushName:!0}});',
  't.pushName=c?.pushName||"Participante"}',
  'this.logger.warn("lid-null-fix: participante reconstituido "+(p?"com telefone":"sem telefone"))}}',
  '}catch(x){this.logger.warn("lid-null-fix falhou: "+x?.message)}',
].join('');

fs.writeFileSync(file, src.replace(ANCHOR, () => HEAD + FIX + ANCHOR.slice(HEAD.length)));
console.log('lid-null-fix aplicado (' + FIX.length + ' bytes)');
