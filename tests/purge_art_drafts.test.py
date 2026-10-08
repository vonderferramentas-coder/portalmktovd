# Teste da limpeza das artes salvas (scripts/purge_art_drafts.py), sem Firebase: só as decisões (funções puras).
# Roda com: python3 tests/purge_art_drafts.test.py
import importlib.util
import os

spec = importlib.util.spec_from_file_location('purge', os.path.join(os.path.dirname(__file__), '..', 'scripts', 'purge_art_drafts.py'))
purge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(purge)

DAY = purge.DAY_MS
NOW = purge.date_to_ms('2026-11-15') + 12 * 3600 * 1000


def art(art_id, updated_days_ago, photos=(), card_id=None, deleted_days_ago=None):
    draft = {'updatedAt': NOW - updated_days_ago * DAY, 'photos': [{'hash': h} for h in photos], 'cardId': card_id}
    if deleted_days_ago is not None:
        draft['deletedAt'] = NOW - deleted_days_ago * DAY
    return {'id': art_id, 'draft': draft}


def photo(h, age_days=5):
    return {'hash': h, 'createdAtMs': NOW - age_days * DAY}


# datas
assert purge.date_to_ms('2026-10-12') == purge.date_to_ms('2026-10-12T10:00:00')
assert purge.date_to_ms('lixo') is None and purge.date_to_ms(None) is None

# prazo: última edição + 30 dias; card publicado conta a partir da data de publicação, se for mais recente
d = {'updatedAt': NOW - 40 * DAY}
assert purge.expires_at_ms(d, None) == NOW - 10 * DAY
assert purge.expires_at_ms(d, {'status': 'Rascunho', 'date': '2026-11-14'}) == NOW - 10 * DAY, 'card não publicado não conta'
assert purge.expires_at_ms(d, {'status': 'Publicado', 'date': '2026-11-14'}) == purge.date_to_ms('2026-11-14') + 30 * DAY, 'publicação mais recente que a edição'
assert purge.expires_at_ms(d, {'status': 'Publicado', 'date': '2020-01-01'}) == NOW - 10 * DAY, 'publicação antiga não encurta o prazo'
assert purge.expires_at_ms(d, {'status': 'Publicado', 'date': 'sem data'}) == NOW - 10 * DAY, 'data inválida é ignorada'

# plano
arts = [
    art('viva', 3, ['aaa', 'bbb']),
    art('vencida', 45, ['ccc']),
    art('lixeira-recente', 1, ['ddd'], deleted_days_ago=2),
    art('lixeira-velha', 1, ['eee'], deleted_days_ago=8),
    art('publicada-recente', 60, ['fff'], card_id='card1'),
]
cards = {'card1': {'status': 'Publicado', 'date': '2026-11-10'}}
photos = [photo('aaa'), photo('bbb'), photo('ccc'), photo('ddd'), photo('eee'), photo('fff'), photo('orfa'), photo('nova', age_days=0)]
result = purge.plan(arts, cards, photos, NOW)
assert result['delete_arts'] == ['lixeira-velha'], result['delete_arts']
assert result['keep_hashes'] == {'aaa', 'bbb', 'fff'}, result['keep_hashes']
# ccc (arte vencida), ddd (lixeira), eee (lixeira apagada) e orfa (ninguém usa) saem; nova (menos de 1 dia) fica
assert sorted(result['delete_photos']) == ['ccc', 'ddd', 'eee', 'orfa'], result['delete_photos']

# foto compartilhada por uma arte viva e uma vencida fica
shared = purge.plan([art('v', 1, ['x']), art('old', 90, ['x'])], {}, [photo('x')], NOW)
assert shared['delete_photos'] == [], shared

# nada a fazer
assert purge.plan([], {}, [], NOW) == {'delete_arts': [], 'keep_hashes': set(), 'delete_photos': [], 'strip_thumbs': []}

# miniatura: some junto com as fotos (arte vencida), fica nas vivas e nas que já não têm miniatura
with_thumb = art('vencida-thumb', 45, ['t1']); with_thumb['draft']['thumb'] = 'data:image/jpeg;base64,AAAA'
live_thumb = art('viva-thumb', 2, ['t2']); live_thumb['draft']['thumb'] = 'data:image/jpeg;base64,BBBB'
no_thumb = art('vencida-sem', 50, ['t3'])
assert purge.plan([with_thumb, live_thumb, no_thumb], {}, [], NOW)['strip_thumbs'] == ['vencida-thumb']

print('PASS: prazo de retenção, lixeira de 7 dias, fotos compartilhadas e fotos recém-enviadas')
