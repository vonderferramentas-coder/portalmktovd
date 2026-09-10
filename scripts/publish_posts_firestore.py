# Publica um snapshot de posts (formato {version, updatedAt, posts:[...]}) em
# portalStore/<store_key> no Firestore. Usado por sync-meta-posts.yml e
# reconstruir-historico-posts.yml — extraído pra um lugar só porque os dois faziam a mesma
# coisa e o limite de 1 MiB por documento do Firestore precisa do mesmo tratamento nos dois.
#
# Antes disso, quando o histórico passava do limite, o publicador truncava e só os posts
# mais recentes que coubessem chegavam ao painel (ver git blame). Em vez de truncar, divide
# em documentos sequenciais (store_key, store_key__2, store_key__3, ...) — o painel lê e
# junta todos de volta (ver protectedStoreChunked em followers-dashboard.js). Continua
# "gratuito" porque a cota grátis do Firestore é milhares de leituras/dia; ler 2-4
# documentos pequenos em paralelo em vez de 1 não muda isso na prática.
import json
import time

import firebase_admin
from firebase_admin import credentials, firestore

# Não o 1_048_576 real: deixa margem para o overhead dos campos updated_at/updatedAt/
# chunkCount e da própria estrutura do documento.
FIRESTORE_MAX_BYTES = 900_000
# Quantos documentos extras além do necessário hoje tentamos apagar a cada publicação —
# cobre o histórico encolher (post apagado no Instagram) e sobrar chunk órfão que o painel
# ficaria lendo para sempre sem nunca mais ser atualizado.
CLEANUP_MARGIN = 3


def _chunk(posts):
    chunks, current, size = [], [], 2
    for post in posts:
        entry_size = len(json.dumps(post, ensure_ascii=False).encode('utf-8')) + 1
        if current and size + entry_size > FIRESTORE_MAX_BYTES:
            chunks.append(current)
            current, size = [], 2
        current.append(post)
        size += entry_size
    if current or not chunks:
        chunks.append(current)
    return chunks


def publish(store_key, published, service_account_key_json):
    cred = credentials.Certificate(json.loads(service_account_key_json))
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    posts = published['posts']
    chunks = _chunk(posts)
    now_ms = int(time.time() * 1000)

    for index, chunk in enumerate(chunks):
        doc_id = store_key if index == 0 else f'{store_key}__{index + 1}'
        payload = dict(published, posts=chunk)
        if index == 0:
            payload['chunkCount'] = len(chunks)
        db.collection('portalStore').document(doc_id).set({
            'v': payload,
            'updated_at': now_ms,
            'updatedAt': firestore.SERVER_TIMESTAMP,
        })

    for index in range(len(chunks) + 1, len(chunks) + 1 + CLEANUP_MARGIN):
        db.collection('portalStore').document(f'{store_key}__{index}').delete()

    print(f'Firestore atualizado: {len(posts)} posts em {len(chunks)} documento(s) ({store_key}).')
