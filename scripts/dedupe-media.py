#!/usr/bin/env python3
# dedupe-media.py - Fork Valcenter (2026-11-05). Roda NO HOST, como root.
#
# Junta arquivos de midia IDENTICOS do Chatwoot (ActiveStorage em disco) num so inode via
# hardlink. Cada blob continua com o seu caminho, entao o Chatwoot nao percebe diferenca;
# o disco guarda o conteudo uma vez. Seguro porque o ActiveStorage nunca altera um arquivo
# depois de gravado, e apagar um anexo (purge) remove so o link dele.
#
# Candidatos: blobs com o mesmo checksum+tamanho no banco. Antes de ligar, compara os
# arquivos byte a byte, e o mesmo dono/permissao/disco. Na duvida, nao liga.
#
# Uso:  python3 dedupe-media.py            -> SIMULACAO (so le e soma; nao altera nada)
#       COMMIT=1 python3 dedupe-media.py   -> aplica; log em /root/chatcenter/dedupe-media-AAAAMMDD-HHMM.log
import filecmp
import json
import os
import subprocess
import sys
import time

COMMIT = os.environ.get('COMMIT') == '1'
WEB = 'chatcenter_chatwoot_web'
DEST = '/app/storage'  # root do servico "local" (config/storage.yml: Rails.root.join("storage"))

mounts = json.loads(subprocess.check_output(['docker', 'inspect', '-f', '{{json .Mounts}}', WEB]))
src = [m['Source'] for m in mounts if m.get('Destination') == DEST]
if len(src) != 1:
    sys.exit('ABORTADO: nao achei o volume montado em %s no %s' % (DEST, WEB))
ROOT = src[0]

SQL = ("SELECT checksum, byte_size, string_agg(key, ' ' ORDER BY id) FROM active_storage_blobs "
       "WHERE service_name = 'local' GROUP BY 1, 2 HAVING count(*) > 1")
out = subprocess.check_output(['docker', 'exec', 'chatcenter_postgres', 'psql', '-U', 'chatcenter',
                               '-d', 'chatwoot_production', '-At', '-F', '\t', '-c', SQL], text=True)
groups = [line.split('\t') for line in out.splitlines() if line.strip()]


def path_of(key):
    return os.path.join(ROOT, key[0:2], key[2:4], key)


st = dict(grupos=len(groups), arquivos=0, ja_ligados=0, ligar=0, diferente=0,
          faltando=0, dono_diferente=0, ligados=0, erro=0)
saving = 0
log = None
if COMMIT:
    log = open('/root/chatcenter/dedupe-media-%s.log' % time.strftime('%Y%m%d-%H%M'), 'w')

for _checksum, size, keys in groups:
    size = int(size)
    paths = [path_of(k) for k in keys.split()]
    st['arquivos'] += len(paths)
    present = []
    for p in paths:
        try:
            present.append((p, os.stat(p)))
        except FileNotFoundError:
            st['faltando'] += 1
    if len(present) < 2:
        continue
    ref, rst = present[0]
    for p, pst in present[1:]:
        if pst.st_ino == rst.st_ino and pst.st_dev == rst.st_dev:
            st['ja_ligados'] += 1
            continue
        if (pst.st_dev != rst.st_dev or pst.st_uid != rst.st_uid or pst.st_gid != rst.st_gid
                or (pst.st_mode & 0o7777) != (rst.st_mode & 0o7777)):
            st['dono_diferente'] += 1
            continue
        if pst.st_size != size or rst.st_size != size or not filecmp.cmp(ref, p, shallow=False):
            st['diferente'] += 1
            continue
        st['ligar'] += 1
        saving += size
        if not COMMIT:
            continue
        tmp = p + '.dedupe-tmp'
        try:
            os.link(ref, tmp)
            os.replace(tmp, p)  # troca atomica: o caminho nunca fica sem arquivo
            st['ligados'] += 1
            log.write('%s -> %s\n' % (p, ref))
        except OSError as e:
            st['erro'] += 1
            if os.path.exists(tmp):
                os.remove(tmp)
            print('ERRO %s: %s' % (p, e))

if log:
    log.close()
print('%s | raiz=%s' % ('COMMIT' if COMMIT else 'SIMULACAO', ROOT))
print('  ' + ' '.join('%s=%d' % kv for kv in st.items()))
print('  economia%s: %.2f GB' % ('' if COMMIT else ' possivel', saving / 1024 ** 3))
