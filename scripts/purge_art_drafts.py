# Limpeza diária das artes salvas do Editor de Posts (Firestore de produção). Usado por limpar-artes-salvas.yml (disparado pelo Worker do
# Cloudflare, depois do backup do dia). Faz três coisas, nesta ordem:
#   1. apaga de vez as artes que estão na lixeira há mais de TRASH_DAYS dias;
#   2. apaga as fotos (coleção artPhotos) que nenhuma arte "viva" usa mais - arte viva = fora da lixeira e dentro do prazo de retenção,
#      que conta a partir da última edição da arte ou, se o card do calendário foi publicado, da data da publicação (vale o que for mais
#      recente). A receita da arte fica: depois do prazo ela reabre com "Reenviar a foto", sem perder textos e enquadramento;
#      Na mesma ocasião a miniatura (campo thumb, pode mostrar pessoas) das artes vencidas é esvaziada;
#   3. grava o total de bytes de fotos em portalStore/art-stats-v1, que o editor lê para parar de subir fotos novas se o teto passar.
# As decisões ficam em funções puras (plan, expires_at_ms), testadas em tests/purge_art_drafts.test.py sem Firebase.
import datetime
import json
import os
import sys

DAY_MS = 86400000
PHOTO_RETENTION_DAYS = 30  # ponytail: um prazo só para todas as marcas; se uma marca precisar de outro, vira parâmetro por marca
TRASH_DAYS = 7
GRACE_MS = DAY_MS  # foto criada há menos de 1 dia fica: o upload vem antes do documento da arte e a arte pode ainda não ter sido gravada
PUBLISHED_STATUS = 'Publicado'


def date_to_ms(value):
    """'2026-10-12' -> milissegundos (UTC); None se não for uma data válida."""
    try:
        d = datetime.date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None
    return int(datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def expires_at_ms(draft, card, retention_days=PHOTO_RETENTION_DAYS):
    """Quando as fotos desta arte deixam de ser guardadas."""
    base = int(draft.get('updatedAt') or 0)
    if card and card.get('status') == PUBLISHED_STATUS:
        published = date_to_ms(card.get('date'))
        if published:
            base = max(base, published)
    return base + retention_days * DAY_MS


def plan(arts, cards, photos, now_ms, retention_days=PHOTO_RETENTION_DAYS, trash_days=TRASH_DAYS, grace_ms=GRACE_MS):
    """arts: [{'id', 'draft'}]; cards: {cardId: card}; photos: [{'hash', 'createdAtMs'}].
    Devolve {'delete_arts': [ids], 'keep_hashes': set, 'delete_photos': [hashes], 'strip_thumbs': [ids]}."""
    delete_arts, keep, strip_thumbs = [], set(), []
    for art in arts:
        draft = art['draft'] or {}
        deleted_at = draft.get('deletedAt')
        if deleted_at:
            if now_ms - int(deleted_at) > trash_days * DAY_MS:
                delete_arts.append(art['id'])
            continue  # na lixeira (ainda no prazo ou já apagada): não segura foto
        if expires_at_ms(draft, cards.get(draft.get('cardId')), retention_days) <= now_ms:
            if draft.get('thumb'):
                strip_thumbs.append(art['id'])
            continue
        for photo in draft.get('photos') or []:
            if photo.get('hash'):
                keep.add(photo['hash'])
    delete_photos = [p['hash'] for p in photos if p['hash'] not in keep and now_ms - int(p.get('createdAtMs') or 0) > grace_ms]
    return {'delete_arts': delete_arts, 'keep_hashes': keep, 'delete_photos': delete_photos, 'strip_thumbs': strip_thumbs}


def _delete_all(db, refs):
    for start in range(0, len(refs), 400):
        batch = db.batch()
        for ref in refs[start:start + 400]:
            batch.delete(ref)
        batch.commit()


def run(service_account_key_json):
    import firebase_admin
    from firebase_admin import credentials, firestore

    app = firebase_admin.initialize_app(credentials.Certificate(json.loads(service_account_key_json)))
    db = firestore.client(app)
    now_ms = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)

    art_docs = list(db.collection('portalStore').where('kind', '==', 'artDraft').stream())
    arts = [{'id': d.id, 'draft': (d.to_dict() or {}).get('v') or {}} for d in art_docs]
    cards = {}
    for card_id in {a['draft'].get('cardId') for a in arts if a['draft'].get('cardId')}:
        found = list(db.collection('portalStore').where('postId', '==', card_id).limit(1).stream())
        if found:
            cards[card_id] = (found[0].to_dict() or {}).get('v') or {}

    photos = []
    for d in db.collection('artPhotos').select(['size', 'createdAt']).stream():
        created = (d.to_dict() or {}).get('createdAt')
        photos.append({'hash': d.id, 'size': int((d.to_dict() or {}).get('size') or 0),
                       'createdAtMs': int(created.timestamp() * 1000) if created else 0})

    result = plan(arts, cards, photos, now_ms)
    refs_by_id = {d.id: d.reference for d in art_docs}
    _delete_all(db, [refs_by_id[i] for i in result['delete_arts']])
    _delete_all(db, [db.collection('artPhotos').document(h) for h in result['delete_photos']])
    for art_id in result['strip_thumbs']:
        refs_by_id[art_id].update({'v.thumb': ''})

    gone = set(result['delete_photos'])
    left = [p for p in photos if p['hash'] not in gone]
    db.collection('portalStore').document('art-stats-v1').set({
        'v': {'photoBytes': sum(p['size'] for p in left), 'photoCount': len(left), 'updatedAt': now_ms},
        'updatedAt': firestore.SERVER_TIMESTAMP,
    })
    print(f'Artes apagadas da lixeira: {len(result["delete_arts"])}; miniaturas esvaziadas: {len(result["strip_thumbs"])}; fotos apagadas: {len(gone)}; fotos restantes: {len(left)} '
          f'({sum(p["size"] for p in left)} bytes).')


if __name__ == '__main__':
    run(os.environ['FIREBASE_SERVICE_ACCOUNT_KEY'])
    sys.exit(0)
