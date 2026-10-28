#!/usr/bin/env python3
"""Verificação do coletor de avaliações com respostas falsas do Google (sem rede, sem Firebase): python scripts/test_sync_google_avaliacoes.py"""
import contextlib
import io
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
os.environ.update(GBP_CLIENT_ID='cid', GBP_CLIENT_SECRET='SEGREDO-DE-TESTE', GBP_REFRESH_TOKEN='REFRESH-DE-TESTE')
import sync_google_avaliacoes as coletor

coletor.time.sleep = lambda *_: None


def avaliacao(id_, estrelas, criada, atualizada=None, resposta=None, autor='Cliente Teste', anonimo=False):
    dados = {'reviewId': id_, 'starRating': estrelas, 'createTime': criada, 'updateTime': atualizada or criada,
             'reviewer': {'displayName': autor, 'isAnonymous': anonimo}, 'comment': 'texto ' + id_}
    if resposta:
        dados['reviewReply'] = {'comment': resposta, 'updateTime': atualizada or criada}
    return dados


# registro: forma compacta, anônimo some o nome, texto longo é cortado
rec = coletor.registro(avaliacao('a', 'FIVE', '2026-10-01T10:00:00Z', anonimo=True), '9')
assert rec['s'] == 5 and rec['n'] == '' and rec['l'] == '9' and rec['r'] == ''
assert len(coletor.registro({'reviewId': 'x', 'comment': 'a' * 5000}, '9')['t']) == 1500

# mesclar: agrupa por mês de criação e só marca como alterado o que mudou de fato
meses = {}
novos = {'a': coletor.registro(avaliacao('a', 'FIVE', '2026-10-01T10:00:00Z'), '9'),
         'b': coletor.registro(avaliacao('b', 'ONE', '2026-09-30T10:00:00Z'), '9')}
assert coletor.mesclar(meses, novos) == {'2026-10', '2026-09'}
assert coletor.mesclar(meses, novos) == set()  # repetir não altera nada
novos['a'] = coletor.registro(avaliacao('a', 'FIVE', '2026-10-01T10:00:00Z', '2026-10-05T10:00:00Z', 'Obrigado!'), '9')  # respondida depois
assert coletor.mesclar(meses, novos) == {'2026-10'}

# resumir: contagem por estrela, sem resposta e divergência com o total do Google
resumo = coletor.resumir([{'id': '9', 'title': 'Loja'}], meses, {'9': {'total': 3, 'media': 3.0}})[0]
assert resumo['coletadas'] == 2 and resumo['estrelas'] == [1, 0, 0, 0, 1] and resumo['semResposta'] == 1
assert resumo['googleTotal'] == 3 and resumo['ultima'] == '2026-10-01T10:00:00Z'

# fluxo completo em modo ensaio e modo incremental parando no corte, com o Google falso
paginas = {'': {'reviews': [avaliacao('n1', 'FOUR', '2026-10-20T10:00:00Z'), avaliacao('n2', 'TWO', '2026-10-10T10:00:00Z')], 'nextPageToken': 'p2', 'totalReviewCount': 4, 'averageRating': 3.5},
           'p2': {'reviews': [avaliacao('v1', 'FIVE', '2025-01-01T10:00:00Z'), avaliacao('v2', 'FIVE', '2024-01-01T10:00:00Z')], 'totalReviewCount': 4, 'averageRating': 3.5}}
pedidos = []


class Resposta:
    def __init__(self, corpo):
        self.corpo, self.status = json.dumps(corpo).encode(), 200

    def read(self):
        return self.corpo

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass


def google_falso(pedido, timeout=0):
    url = pedido.full_url
    pedidos.append(url)
    if 'oauth2' in url:
        return Resposta({'access_token': 'TOKEN-DE-ACESSO'})
    consulta = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    if 'mybusinessaccountmanagement' in url:
        return Resposta({'accounts': [{'name': 'accounts/1'}], 'nextPageToken': 'c2'} if 'pageToken' not in consulta else {'accounts': [{'name': 'accounts/2'}]})
    if 'businessinformation' in url:
        if 'accounts/2' in url:
            return Resposta({'locations': [{'name': 'locations/7', 'title': 'Loja da conta 2'}]})
        return Resposta({'locations': [{'name': 'locations/9', 'title': 'Loja'}], 'nextPageToken': 'f2'} if 'pageToken' not in consulta else {'locations': [{'name': 'locations/8', 'title': 'Loja B'}]})
    if '/locations/9/' not in url:  # só a ficha 9 tem avaliações no teste
        return Resposta({'totalReviewCount': 0})
    return Resposta(paginas[consulta.get('pageToken', [''])[0]])


urllib.request.urlopen = google_falso
saida = io.StringIO()
with contextlib.redirect_stdout(saida):
    coletor.main(['--ensaio'])
texto = saida.getvalue()
assert 'Fichas: 3' in texto  # 2 páginas de contas e 2 de fichas: nenhuma ficha fica de fora
assert 'Avaliações coletadas: 4 (Google informa 4)' in texto and 'Sem resposta: 4' in texto and 'Loja: 4 coletadas' in texto, texto
assert 'Cliente Teste' not in texto and 'accounts/1' not in texto and 'texto n1' not in texto  # o log é público

auth = {'Authorization': 'x'}
ficha = {'conta': 'accounts/1', 'id': '9', 'title': 'Loja'}
pedidos.clear()
lidos, _ = coletor.ler_ficha(auth, ficha, coletor.quando('2026-10-01T00:00:00Z'))  # a 1ª página ainda termina depois do corte: pede a 2ª
assert set(lidos) == {'n1', 'n2', 'v1', 'v2'} and len(pedidos) == 2
pedidos.clear()
lidos, _ = coletor.ler_ficha(auth, ficha, coletor.quando('2026-10-15T00:00:00Z'))  # a 1ª página já termina antes do corte: não pede a 2ª
assert set(lidos) == {'n1', 'n2'} and len(pedidos) == 1

# hora do Google com 9 casas decimais e avaliação sem nota conhecida
assert coletor.quando('2026-10-28T14:45:57.123456789Z') == coletor.quando('2026-10-28T14:45:57.123456Z')
sem_nota = {'2026-10': {'x': coletor.registro({'reviewId': 'x', 'starRating': 'STAR_RATING_UNSPECIFIED', 'createTime': '2026-10-01T00:00:00Z'}, '9')}}
assert coletor.resumir([{'id': '9', 'title': 'Loja'}], sem_nota, {})[0]['coletadas'] == 1

# mensagens de erro nunca levam segredo nem ID de conta/ficha
assert coletor.mascarar('falhou accounts/123/locations/456 com SEGREDO-DE-TESTE') == 'falhou accounts/***/locations/*** com ***'

print('ok: coletor de avaliações verificado')
