# Backup diário de portalStore/users do Firestore de produção (mkt-ovd) pro repositório
# PRIVADO vonderferramentas-coder/portalmktovd-backups — não pro repo público do site (dados
# internos/pessoais não podem ir pra lá) e não pro Cloud Storage do Firebase (esse produto
# passou a exigir plano Blaze pra ser ativado, mesmo no uso gratuito; Spark não serve mais).
# Usado por backup-portalstore.yml (agendado + manual), que já deixou o repo de backup
# clonado no diretório que este script recebe como argumento.
#
# Guarda a coleção portalStore inteira (calendário, config, permissões e dados coletados) e
# users — é o estado que precisaria ser restaurado manualmente em caso de exclusão/regra
# quebrada. securityAudit fica de fora de propósito: é log append-only, não estado a restaurar.
import datetime
import gzip
import json
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

RETENTION_DAYS = 30  # ponytail: retenção fixa por contagem de dias, sem poda por tamanho —
# se o repositório de backup crescer rápido demais, revisar antes de simplesmente aumentar isso.


def _dump_collection(db, name):
    return {doc.id: doc.to_dict() for doc in db.collection(name).stream()}


def _json_default(value):
    # Campos Timestamp do Firestore voltam como datetime (DatetimeWithNanoseconds), que o
    # json padrão não serializa — praticamente todo documento aqui tem updated_at/updatedAt.
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    raise TypeError(f'Tipo não serializável no backup: {type(value)!r}')


def _prune_old_backups(out_dir):
    cutoff = datetime.date.today() - datetime.timedelta(days=RETENTION_DAYS)
    removed = 0
    for filename in os.listdir(out_dir):
        if not filename.endswith('.json.gz'):
            continue
        try:
            file_date = datetime.date.fromisoformat(filename.removesuffix('.json.gz'))
        except ValueError:
            continue
        if file_date < cutoff:
            os.remove(os.path.join(out_dir, filename))
            removed += 1
    print(f'Backups com mais de {RETENTION_DAYS} dias removidos: {removed}.')


def run(service_account_key_json, out_dir):
    cred = credentials.Certificate(json.loads(service_account_key_json))
    app = firebase_admin.initialize_app(cred)
    db = firestore.client(app)

    snapshot = {
        'backedUpAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'portalStore': _dump_collection(db, 'portalStore'),
        'users': _dump_collection(db, 'users'),
    }
    payload = gzip.compress(
        json.dumps(snapshot, ensure_ascii=False, default=_json_default).encode('utf-8')
    )

    os.makedirs(out_dir, exist_ok=True)
    today = datetime.date.today().isoformat()
    out_path = os.path.join(out_dir, f'{today}.json.gz')
    with open(out_path, 'wb') as f:
        f.write(payload)
    print(f'Backup gravado em {out_path} ({len(payload)} bytes).')

    _prune_old_backups(out_dir)


if __name__ == '__main__':
    key = os.environ['FIREBASE_SERVICE_ACCOUNT_KEY']
    destination = sys.argv[1]
    run(key, destination)
    sys.exit(0)
