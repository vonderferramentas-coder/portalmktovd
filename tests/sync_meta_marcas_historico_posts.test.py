# Teste do histórico e das publicações das marcas da Meta (scripts/reconstruir_historico_marcas.py e
# scripts/sync_meta_marcas_posts.py), sem rede e sem Firebase: só as funções puras e a paginação.
# Roda com: python3 tests/sync_meta_marcas_historico_posts.test.py
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import reconstruir_historico_marcas as historico
import sync_meta_marcas_posts as posts

# 1) Instagram: total de agora 1000, hoje já entraram 10 -> o último dia fechou em 990; anda para trás pelos saldos
saldos = [
    {'date': '2026-10-28', 'entraram': 8, 'sairam': 3, 'saldo': 5},
    {'date': '2026-10-29', 'entraram': 6, 'sairam': 3, 'saldo': 3},
]
assert historico.totais_instagram(1000, saldos, {'saldo': 10}) == {'2026-10-29': 990, '2026-10-28': 987}
assert historico.totais_instagram(1000, saldos, None) == {'2026-10-29': 1000, '2026-10-28': 997}

# 2) mesclar: dia medido pela coleta diária mantém o total e ganha insights; dia novo vira reconstruído
existente = [{'date': '2026-10-29', 'followers': {'Instagram': 995, 'LinkedIn': 7}}]
dias = historico.mesclar(existente, {'2026-10-28': 50}, {'2026-10-29': 990, '2026-10-28': 987}, saldos, {'2026-10-29': 500})
por_dia = {item['date']: item for item in dias}
assert [item['date'] for item in dias] == ['2026-10-28', '2026-10-29']
assert por_dia['2026-10-29']['followers'] == {'Instagram': 995, 'LinkedIn': 7}  # medido: não sobrescreve
assert por_dia['2026-10-29']['insights']['Instagram'] == {'follows': 6, 'unfollows': 3, 'net': 3, 'reach': 500}
assert por_dia['2026-10-28']['followers'] == {'Facebook': 50, 'Instagram': 987}
assert por_dia['2026-10-28']['source'] == 'reconstruido'
assert existente == [{'date': '2026-10-29', 'followers': {'Instagram': 995, 'LinkedIn': 7}}]  # não altera a entrada
assert historico.mesclar(None, {}, {}, [], {}) == []

# 3) Facebook: anda em pedaços até a Meta devolver vazio
chamadas = []


def falso_facebook(url, token):
    chamadas.append(url)
    if len(chamadas) == 1:
        return {'data': [{'values': [{'end_time': '2026-10-28T07:00:00+0000', 'value': 50}, {'end_time': '2026-10-29T07:00:00+0000', 'value': 52}, {'value': 1}]}]}
    return {'data': [{'values': []}]}


historico.pegar = falso_facebook
assert historico.historico_facebook('pg', 'tk', 5) == {'2026-10-28': 50, '2026-10-29': 52}
assert len(chamadas) == 2  # parou no pedaço vazio, sem gastar os 5

# 4) mesclar posts: mesmo id é atualizado, o resto fica, ordem do mais novo ao mais antigo
mesclado = posts.mesclar(
    [{'id': 'a', 'timestamp': '2026-10-01', 'likeCount': 1}, {'id': 'b', 'timestamp': '2026-09-01'}],
    [{'id': 'a', 'timestamp': '2026-10-01', 'likeCount': 9}, {'id': 'c', 'timestamp': '2026-10-20'}],
)
assert [post['id'] for post in mesclado] == ['c', 'a', 'b'] and mesclado[1]['likeCount'] == 9

# 5) paginar: rotina só lê a primeira página; com corte segue as páginas, ignora item antigo no meio (fixado) e para
#    quando uma página inteira fica antes da data
paginas = {
    'u1': {'data': [{'timestamp': '2025-01-01'}, {'timestamp': '2026-10-02'}, {'timestamp': '2026-09-20'}], 'paging': {'next': 'u2'}},
    'u2': {'data': [{'timestamp': '2026-09-10'}, {'timestamp': '2026-08-01'}], 'paging': {'next': 'u3'}},
    'u3': {'data': [{'timestamp': '2026-07-01'}, {}], 'paging': {'next': 'u4'}},
}
posts.pegar = lambda url, token: paginas[url]
assert len(posts.paginar('u1', 'tk', None, 'timestamp')) == 3
assert [item['timestamp'] for item in posts.paginar('u1', 'tk', '2026-09-01', 'timestamp')] == ['2026-10-02', '2026-09-20', '2026-09-10']

# 6) mesclar posts: métrica que falhou hoje (None) não apaga o valor bom já guardado
mesclado = posts.mesclar([{'id': 'a', 'timestamp': '2026-10-01', 'views': 5000, 'saved': 40}], [{'id': 'a', 'timestamp': '2026-10-01', 'likeCount': 3, 'views': None, 'saved': None}])
assert mesclado[0]['views'] == 5000 and mesclado[0]['saved'] == 40 and mesclado[0]['likeCount'] == 3

# 7) métricas do Instagram: se a chamada junta falhar, tenta uma a uma e guarda as que responderam
def falso_insights(url, token):
    if 'metric=total_interactions,views,saved' in url:
        raise OSError('400')
    if 'metric=views' in url:
        raise OSError('400')
    nome = url.split('metric=')[1]
    return {'data': [{'name': nome, 'values': [{'value': 7}]}]}


posts.pegar = falso_insights
assert posts.metricas_instagram('1', 'tk') == {'total_interactions': 7, 'saved': 7}

# 8) histórico: dia sem saldo quebra a cadeia (totais anteriores ao buraco não saem deslocados)
saldos_buraco = [
    {'date': '2026-10-26', 'entraram': 5, 'sairam': 0, 'saldo': 5},
    {'date': '2026-10-28', 'entraram': 4, 'sairam': 0, 'saldo': 4},  # 10-27 sumiu
    {'date': '2026-10-29', 'entraram': 3, 'sairam': 0, 'saldo': 3},
]
assert historico.totais_instagram(100, saldos_buraco, None) == {'2026-10-29': 100, '2026-10-28': 97}

# 9) histórico: Facebook medido não é sobrescrito, e o dia que já existia não perde a origem
dias = historico.mesclar([{'date': '2026-10-25', 'source': 'medido', 'followers': {'Facebook': 1000, 'LinkedIn': 7}}], {'2026-10-25': 998}, {'2026-10-25': 500}, [{'date': '2026-10-25', 'entraram': 1, 'sairam': 0, 'saldo': 1}], {})
assert dias[0]['followers'] == {'Facebook': 1000, 'LinkedIn': 7, 'Instagram': 500} and dias[0]['source'] == 'medido'

print('ok')
