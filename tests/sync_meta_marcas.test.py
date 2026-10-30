# Teste do coletor das marcas da Meta (scripts/sync_meta_marcas.py), sem rede e sem Firebase: só a mescla (função pura).
# Roda com: python3 tests/sync_meta_marcas.test.py
import importlib.util
import os
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('coletor', os.path.join(os.path.dirname(__file__), '..', 'scripts', 'sync_meta_marcas.py'))
coletor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coletor)

AGORA = datetime(2026, 11, 2, 2, 30, tzinfo=timezone.utc)  # 23:30 do dia 01 em São Paulo
IG = {'Instagram': {'accountId': '1', 'username': 'x', 'followers': 100, 'source': 'meta_graph_api'}}
FB = {'Facebook': {'accountId': '2', 'username': 'X', 'followers': 50, 'source': 'meta_graph_api'}}

# 1) documento vazio, coleta de rotina: só o snapshot ao vivo muda, sem histórico
novo = coletor.aplicar({}, {**IG, **FB}, False, AGORA)
assert novo['live']['platforms']['Instagram']['followers'] == 100
assert novo['live']['platforms']['Facebook']['followers'] == 50
assert novo['published']['history'] == []
assert novo['live']['updatedAt'] == '2026-11-02T02:30:00Z'

# 2) fechamento: grava o dia anterior (UTC-3) e preserva LinkedIn/TikTok já gravados por outras fontes
atual = {
    'live': {'platforms': {'LinkedIn': {'followers': 7}}},
    'published': {'history': [{'date': '2026-11-01', 'followers': {'LinkedIn': 7}}, {'date': '2026-10-31', 'followers': {'Instagram': 90}}]},
}
novo = coletor.aplicar(atual, IG, True, AGORA)
assert novo['live']['platforms']['LinkedIn']['followers'] == 7
dias = {item['date']: item['followers'] for item in novo['published']['history']}
assert dias['2026-11-01'] == {'LinkedIn': 7, 'Instagram': 100}
assert dias['2026-10-31'] == {'Instagram': 90}
assert [item['date'] for item in novo['published']['history']] == ['2026-10-31', '2026-11-01']

# 3) não altera o documento recebido
assert atual['published']['history'][0]['followers'] == {'LinkedIn': 7}

# 4) histórico nulo ou com item inválido não derruba o fechamento
novo = coletor.aplicar({'published': {'history': None}}, IG, True, AGORA)
assert [item['date'] for item in novo['published']['history']] == ['2026-11-01']
novo = coletor.aplicar({'published': {'history': ['lixo', {'date': '2026-10-31', 'followers': {}}]}}, IG, True, AGORA)
assert [item['date'] for item in novo['published']['history']] == ['2026-10-31', '2026-11-01']

# 5) coletar: uma rede que falha não derruba a outra; sem nenhuma rede, levanta erro
MARCA = {'marca': 'teste', 'instagramId': 'ig1', 'facebookPageId': 'fb1'}


def falso(respostas):
    def consultar(caminho, campos, token):
        resposta = respostas[caminho]
        if isinstance(resposta, Exception):
            raise resposta
        return resposta
    return consultar


coletor.consultar = falso({'ig1': {'followers_count': 10, 'username': 'ig'}, 'fb1': {'name': 'Pagina'}})  # Facebook sem followers_count
redes, erros = coletor.coletar(MARCA, 'token')
assert list(redes) == ['Instagram'] and redes['Instagram']['followers'] == 10 and len(erros) == 1

coletor.consultar = falso({'ig1': {'followers_count': 10, 'username': 'ig'}, 'fb1': {'followers_count': 5, 'name': 'Pagina'}})
redes, erros = coletor.coletar(MARCA, 'token')
assert sorted(redes) == ['Facebook', 'Instagram'] and erros == []

coletor.consultar = falso({'ig1': ValueError('x'), 'fb1': ValueError('y')})
try:
    coletor.coletar(MARCA, 'token')
    raise SystemExit('deveria ter levantado erro')
except RuntimeError:
    pass

# 6) erro HTTP da Meta: log traz só código e mensagem; segredo de tokens malformado é recusado; username é opcional
import io
import urllib.error
corpo = io.BytesIO(b'{"error":{"message":"Token invalido","code":190,"fbtrace_id":"SEGREDO"}}')
texto = coletor.descrever(urllib.error.HTTPError('u', 400, 'x', {}, corpo))
assert '190' in texto and 'Token invalido' in texto and 'SEGREDO' not in texto
assert coletor.ler_tokens('{"data":[{"id":"1","access_token":"a"},{"id":"2"}]}') == {'1': 'a'}
try:
    coletor.ler_tokens('{truncado')
    raise SystemExit('deveria ter recusado')
except SystemExit as erro:
    assert 'JSON' in str(erro)
coletor.consultar = falso({'ig1': {'followers_count': 10}, 'fb1': {'followers_count': 5, 'name': 'P'}})
redes, erros = coletor.coletar(MARCA, 'token')
assert redes['Instagram']['followers'] == 10 and erros == []

print('ok')
