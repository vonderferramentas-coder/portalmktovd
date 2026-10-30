#!/usr/bin/env python3
"""Reconstrói o histórico de seguidores das marcas de data/meta-marcas.json e grava em portalStore/followers-<suffix>-v1.

- Facebook: `page_follows` devolve o total acumulado por dia, em pedaços de 90 dias (limite da Meta), para trás.
- Instagram: a Meta só guarda entradas e saídas por dia dos últimos ~29 dias; o total vem de andar para trás a
  partir do total de agora (total de ontem = total de hoje - saldo de hoje). Mesma lógica de reconstruir-historico.yml.

Nunca sobrescreve um total que a coleta diária já mediu de verdade: só preenche dias que faltam e acrescenta os insights.
Variáveis: META_PAGE_TOKENS, FIREBASE_SERVICE_ACCOUNT_KEY, MESES (quanto voltar no Facebook; o Instagram é sempre ~29 dias).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from sync_meta_marcas import API, MARCAS, descrever, ler_tokens
from sync_meta_marcas_posts import pegar

DIA = 86400


def historico_facebook(pagina, token, pedacos):
    """{data: total} do page_follows, andando para trás em pedaços de 90 dias até a Meta parar de devolver pontos."""
    por_dia, fim = {}, int(time.time()) - DIA
    for _ in range(pedacos):
        inicio = fim - 89 * DIA
        resposta = pegar(f"{API}/{pagina}/insights?metric=page_follows&period=day&since={inicio}&until={fim}", token)
        pontos = ((resposta.get('data') or [{}])[0].get('values')) or []
        if not pontos:
            break
        for ponto in pontos:
            if isinstance(ponto.get('value'), (int, float)) and ponto.get('end_time'):
                por_dia[ponto['end_time'][:10]] = int(ponto['value'])
        fim = inicio
    return por_dia


def _valor(resposta, tipo):
    for dado in resposta.get('data') or []:
        for quebra in (dado.get('total_value') or {}).get('breakdowns') or []:
            for resultado in quebra.get('results') or []:
                if (resultado.get('dimension_values') or [None])[0] == tipo:
                    return resultado.get('value')
    return None


def _saldo(instagram, token, inicio, fim):
    resposta = pegar(f"{API}/{instagram}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value"
                     f"&breakdown=follow_type&since={inicio}&until={fim}", token)
    entraram, sairam = _valor(resposta, 'FOLLOWER'), _valor(resposta, 'NON_FOLLOWER')
    if entraram is None or sairam is None:
        return None
    return {'entraram': int(entraram), 'sairam': int(sairam), 'saldo': int(entraram) - int(sairam)}


def coletar_instagram(instagram, token):
    """Devolve (total_atual, saldos_por_dia, saldo_parcial_de_hoje, alcance_por_dia)."""
    agora = int(time.time())
    atual = int(pegar(f"{API}/{instagram}?fields=followers_count", token)['followers_count'])
    janela = f"period=day&since={agora - 29 * DIA}&until={agora - DIA}"
    # As fronteiras de dia vêm do próprio follower_count (end_time no fuso da conta), para a janela casar com o dia da Meta.
    limites = [valor['end_time'] for valor in (pegar(f"{API}/{instagram}/insights?metric=follower_count&{janela}", token).get('data') or [{}])[0].get('values') or []]
    alcance = {valor['end_time'][:10]: valor['value'] for valor in (pegar(f"{API}/{instagram}/insights?metric=reach&{janela}", token).get('data') or [{}])[0].get('values') or []}
    saldos, anterior = [], None
    for limite in limites:
        fim = int(datetime.fromisoformat(limite.replace('Z', '+00:00').replace('+0000', '+00:00')).timestamp())
        if anterior is not None:
            # +1 s: o `until` da Meta é inclusivo, e uma janela que começa na fronteira anterior somaria dois dias
            saldo = _saldo(instagram, token, anterior + 1, fim)
            if saldo:
                saldos.append({'date': limite[:10], **saldo})
        anterior = fim
    # Do fim do último dia até agora já houve crescimento: descontar evita a curva inteira subir um dia de ganho.
    parcial = _saldo(instagram, token, anterior + 1, agora) if anterior is not None else None
    return atual, saldos, parcial, alcance


def totais_instagram(atual, saldos, parcial):
    """Anda do dia mais recente para o mais antigo: o total do dia anterior é o total do dia menos o saldo do dia seguinte."""
    total = atual - (parcial or {}).get('saldo', 0)
    totais, seguinte = {}, None
    for item in sorted(saldos, key=lambda item: item['date'], reverse=True):
        # Dia sem saldo (a Meta omitiu os valores) quebra a cadeia: totais mais antigos sairiam deslocados, então param aqui.
        if seguinte and (datetime.fromisoformat(seguinte) - datetime.fromisoformat(item['date'])).days != 1:
            break
        totais[item['date']] = total
        total -= item['saldo']
        seguinte = item['date']
    return totais


def _medido(entrada, rede):
    """Total que a coleta diária mediu de verdade (entrada sem origem 'reconstruido'/'estimado')."""
    return bool(entrada) and (entrada.get('followers') or {}).get(rede) is not None \
        and entrada.get('source') not in ('reconstruido', 'estimado')


def mesclar(historico, facebook, instagram, saldos, alcance):
    """Mescla no histórico existente (lista de dias) sem tocar em totais já medidos nem em outras redes."""
    dias = {item['date']: item for item in (historico or []) if isinstance(item, dict) and item.get('date')}
    for dia, valor in facebook.items():
        existente = dias.get(dia)
        entrada = dict(existente or {'date': dia, 'source': 'reconstruido'})
        if not _medido(existente, 'Facebook'):
            entrada['followers'] = {**(entrada.get('followers') or {}), 'Facebook': valor}
        dias[dia] = entrada
    medidas = {item['date']: item for item in saldos}
    for dia, total in instagram.items():
        existente = dias.get(dia)
        entrada = dict(existente or {'date': dia, 'source': 'reconstruido'})  # origem só para dia novo: não rebaixa o que já existia
        if not _medido(existente, 'Instagram'):
            entrada['followers'] = {**(entrada.get('followers') or {}), 'Instagram': int(total)}
        medida = medidas.get(dia)
        if medida:
            insights = {'follows': medida['entraram'], 'unfollows': medida['sairam'], 'net': medida['saldo']}
            if dia in alcance:
                insights['reach'] = int(alcance[dia])
            entrada['insights'] = {**(entrada.get('insights') or {}), 'Instagram': insights}
        dias[dia] = entrada
    return [dias[dia] for dia in sorted(dias)]


def main():
    import firebase_admin
    from firebase_admin import credentials, firestore

    tokens = ler_tokens(os.environ['META_PAGE_TOKENS'])
    meses = int(os.environ.get('MESES') or 12)
    pedacos = max(1, -(-meses // 3))  # 90 dias por pedaço
    firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_KEY'])))
    banco = firestore.client()

    @firestore.transactional
    def gravar(transacao, referencia, facebook, instagram, saldos, alcance):
        documento = referencia.get(transaction=transacao)
        atual = (documento.to_dict() or {}).get('v') or {}
        published = dict(atual.get('published') or {'version': 2})
        published.update({'version': 2, 'updatedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
                          'history': mesclar(published.get('history'), facebook, instagram, saldos, alcance)})
        transacao.set(referencia, {'v': {**atual, 'published': published}, 'updated_at': int(time.time() * 1000), 'updatedAt': firestore.SERVER_TIMESTAMP})
        return len(published['history'])

    falhas = []
    for marca in json.loads(MARCAS.read_text(encoding='utf-8')):
        try:
            token = tokens.get(marca['facebookPageId'])
            if not token:
                raise RuntimeError('Página não está no META_PAGE_TOKENS')
            facebook, instagram, saldos, alcance, erros = {}, {}, [], {}, []
            try:
                facebook = historico_facebook(marca['facebookPageId'], token, pedacos)
            except (OSError, ValueError, KeyError) as erro:
                erros.append(f'Facebook: {descrever(erro)}')
            try:
                atual, saldos, parcial, alcance = coletar_instagram(marca['instagramId'], token)
                instagram = totais_instagram(atual, saldos, parcial)
            except (OSError, ValueError, KeyError) as erro:
                erros.append(f'Instagram: {descrever(erro)}')
            for erro in erros:
                print(f"::warning::{marca['marca']} - {erro}")
            if not facebook and not instagram:
                raise RuntimeError('nenhuma rede devolveu histórico')
            dias = gravar(banco.transaction(), banco.collection('portalStore').document(f"followers-{marca['storeSuffix']}-v1"),
                          facebook, instagram, saldos, alcance)
            print(f"{marca['marca']}: Facebook {len(facebook)} dias, Instagram {len(instagram)} dias; histórico agora com {dias} dias")
            if erros:
                falhas.append(f"{marca['marca']} (parcial)")
        except Exception as erro:  # uma marca com problema não pode impedir as demais
            falhas.append(marca['marca'])
            print(f"::error::{marca['marca']} falhou - {erro}")
    if falhas:
        sys.exit(f"Com falha: {', '.join(falhas)}")


if __name__ == '__main__':
    main()
