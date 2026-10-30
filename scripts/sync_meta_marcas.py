#!/usr/bin/env python3
"""Coleta seguidores do Instagram e da Página do Facebook das marcas listadas em data/meta-marcas.json.

Cada marca grava só em portalStore/followers-<storeSuffix>-v1 (mesmo formato do coletor da VONDER e da
Ferramentas Gerais), sem JSON versionado no Git. Os tokens vêm do segredo META_PAGE_TOKENS: a resposta
inteira de `me/accounts?fields=id,name,access_token` do Graph API Explorer; cada marca usa o token da
própria Página (o mesmo token alcança o Instagram ligado a ela). Uma marca que falha não derruba as outras.

Variáveis: META_PAGE_TOKENS, FIREBASE_SERVICE_ACCOUNT_KEY, FECHAR_DIA ('true' fecha o dia no histórico).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = 'https://graph.facebook.com/v26.0'
MARCAS = Path(__file__).resolve().parent.parent / 'data' / 'meta-marcas.json'


def consultar(caminho, campos, token):
    url = f"{API}/{caminho}?{urllib.parse.urlencode({'fields': campos})}"
    pedido = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(pedido, timeout=30) as resposta:
        return json.load(resposta)


def descrever(erro):
    """Resumo seguro de um erro HTTP da Meta: só código e mensagem (o log do Actions é público)."""
    try:
        detalhe = json.loads(erro.read()).get('error') or {}
        return f"HTTP {erro.code} (código {detalhe.get('code')}): {str(detalhe.get('message'))[:200]}"
    except (ValueError, AttributeError, OSError):
        return f'HTTP {erro.code}'


def ler_tokens(texto):
    try:
        paginas = json.loads(texto).get('data') or []
    except (ValueError, AttributeError):
        sys.exit('META_PAGE_TOKENS não é um JSON válido (cole a resposta inteira de me/accounts).')
    return {pagina['id']: pagina['access_token'] for pagina in paginas if isinstance(pagina, dict) and pagina.get('id') and pagina.get('access_token')}


def coletar(marca, token):
    """Devolve ({rede: dados}, [erros]) só com as redes que responderam; levanta erro se nenhuma respondeu."""
    redes, erros = {}, []
    for rede, caminho, campos, nome in (
        ('Instagram', marca['instagramId'], 'followers_count,username', 'username'),
        ('Facebook', marca['facebookPageId'], 'followers_count,name', 'name'),
    ):
        try:
            dados = consultar(caminho, campos, token)
            redes[rede] = {
                'accountId': caminho,
                'username': str(dados.get(nome) or ''),
                'followers': int(dados['followers_count']),
                'source': 'meta_graph_api',
            }
        except urllib.error.HTTPError as erro:
            erros.append(f"{rede}: {descrever(erro)}")
        except (KeyError, TypeError, ValueError, OSError) as erro:
            erros.append(f'{rede}: {erro}')
    for erro in erros:
        print(f"::warning::{marca['marca']} - {erro}")
    if not redes:
        raise RuntimeError('nenhuma rede respondeu')
    return redes, erros


def aplicar(atual, redes, fechar, agora):
    """Mescla a coleta no documento `v` atual sem apagar o que outras fontes gravaram (LinkedIn, TikTok...)."""
    carimbo = agora.replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    published = dict(atual.get('published') or {'version': 2, 'history': []})
    live = dict(atual.get('live') or {'version': 2, 'platforms': {}})
    live.update({'version': 2, 'updatedAt': carimbo, 'platforms': {**(live.get('platforms') or {}), **redes}})
    if fechar:
        dia = (agora - timedelta(hours=3)).date().isoformat()
        historico = {item['date']: item for item in (published.get('history') or []) if isinstance(item, dict) and item.get('date')}
        entrada = dict(historico.get(dia) or {'date': dia})
        entrada['followers'] = {**(entrada.get('followers') or {}), **{nome: dado['followers'] for nome, dado in redes.items()}}
        historico[dia] = entrada
        published.update({'version': 2, 'updatedAt': carimbo, 'history': [historico[data] for data in sorted(historico)]})
    return {'published': published, 'live': live}


def main():
    tokens = ler_tokens(os.environ['META_PAGE_TOKENS'])
    fechar = os.environ.get('FECHAR_DIA') == 'true'
    marcas = json.loads(MARCAS.read_text(encoding='utf-8'))

    import firebase_admin
    from firebase_admin import credentials, firestore
    firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_KEY'])))
    banco = firestore.client()

    # Transação: o LinkedIn do Grupo OVD grava no mesmo documento (outro grupo de fila), e um
    # get()+set() soltos poderiam devolver o `v` antigo por cima do ponto que ele acabou de gravar.
    @firestore.transactional
    def gravar(transacao, referencia, redes):
        documento = referencia.get(transaction=transacao)
        atual = (documento.to_dict() or {}).get('v') or {}
        novo = aplicar(atual, redes, fechar, datetime.now(timezone.utc))
        transacao.set(referencia, {'v': novo, 'updated_at': int(time.time() * 1000), 'updatedAt': firestore.SERVER_TIMESTAMP})

    falhas = []
    for marca in marcas:
        try:
            token = tokens.get(marca['facebookPageId'])
            if not token:
                raise RuntimeError('Página não está no META_PAGE_TOKENS (refaça me/accounts com limit=100 e atualize o segredo)')
            redes, erros = coletar(marca, token)
            gravar(banco.transaction(), banco.collection('portalStore').document(f"followers-{marca['storeSuffix']}-v1"), redes)
            print(f"{marca['marca']}: " + ', '.join(f"{nome} {dado['followers']}" for nome, dado in redes.items()))
            if erros:  # grava o que funcionou, mas deixa o job vermelho: a outra rede ficou com número antigo
                falhas.append(f"{marca['marca']} (parcial)")
        except Exception as erro:  # uma marca com problema não pode impedir as demais
            falhas.append(marca['marca'])
            print(f"::error::{marca['marca']} falhou - {erro}")
    if falhas:
        sys.exit(f"Marcas com falha: {', '.join(falhas)}")


if __name__ == '__main__':
    main()
