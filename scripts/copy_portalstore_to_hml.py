# Copia uma cópia pontual (não contínua) de documentos de leitura pública/agregada do Firestore
# de produção (mkt-ovd) para o Firestore de testes (mkt-ovd-hml) — só pra o painel de Redes
# Sociais e a Central de Inteligência não ficarem vazios ao testar no HML. Usado por
# copiar-dados-prd-para-hml.yml, disparado manualmente (workflow_dispatch), nunca agendado: HML
# não precisa de dado ao vivo, só de uma amostra pra testar a interface.
#
# Só copia os documentos abaixo — nunca a coleção portalStore inteira. Calendário
# (calendar-post-*), perfis/permissões (user-profiles-v1, page-permissions-v1) e notificações
# são estado interativo do próprio ambiente HML; sobrescrever isso destruiria testes em
# andamento e o isolamento que a separação HML/PRD existe pra garantir (ver
# docs/ARQUITETURA-E-INTEGRACOES.md, seção 17).
import json
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

# Documentos que não encadeiam em __2/__3/... (um documento só).
SINGLE_DOCS = [
    'followers-vonder-v1',
    'followers-ferramentas-gerais-v1',
    'youtube-videos-vonder-v1',
    'facebook-posts-vonder-v1',
    'facebook-posts-ferramentas-gerais-v1',
    'trends-v1',
]
# Documentos que podem vir divididos em vários (posts-vonder-v1, posts-vonder-v1__2, ...) —
# ver scripts/publish_posts_firestore.py, chunkCount no primeiro documento.
CHUNKED_DOCS = [
    'posts-vonder-v1',
    'posts-ferramentas-gerais-v1',
]


def _client(service_account_key_json, app_name):
    cred = credentials.Certificate(json.loads(service_account_key_json))
    app = firebase_admin.initialize_app(cred, name=app_name)
    return firestore.client(app)


def _copy_doc(source_db, target_db, doc_id):
    snapshot = source_db.collection('portalStore').document(doc_id).get()
    if not snapshot.exists:
        print(f'  {doc_id}: não existe em produção, pulando.')
        return None
    data = snapshot.to_dict()
    target_db.collection('portalStore').document(doc_id).set(data)
    print(f'  {doc_id}: copiado.')
    return data


def copy_all(prod_key_json, hml_key_json):
    prod_db = _client(prod_key_json, 'prod-source')
    hml_db = _client(hml_key_json, 'hml-target')

    print('Documentos únicos:')
    for doc_id in SINGLE_DOCS:
        _copy_doc(prod_db, hml_db, doc_id)

    print('Documentos possivelmente divididos em partes:')
    for base_id in CHUNKED_DOCS:
        first = _copy_doc(prod_db, hml_db, base_id)
        if not first:
            continue
        chunk_count = ((first.get('v') or {}).get('chunkCount')) or 1
        for index in range(2, chunk_count + 1):
            _copy_doc(prod_db, hml_db, f'{base_id}__{index}')


if __name__ == '__main__':
    prod_key = os.environ['FIREBASE_SERVICE_ACCOUNT_KEY']
    hml_key = os.environ['FIREBASE_SERVICE_ACCOUNT_KEY_HML']
    copy_all(prod_key, hml_key)
    print('Cópia concluída.')
    sys.exit(0)
