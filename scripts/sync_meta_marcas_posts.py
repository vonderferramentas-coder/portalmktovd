#!/usr/bin/env python3
"""Coleta as publicações do Instagram e da Página do Facebook das marcas de data/meta-marcas.json.

Cada marca grava em data/social-posts-<suffix>.json / data/social-facebook-posts-<suffix>.json (backup no
Git, o workflow faz o commit) e em portalStore/posts-<suffix>-v1 / facebook-posts-<suffix>-v1, que o painel lê.
Os posts novos são mesclados por id sobre os já guardados, então o histórico só cresce.

Variáveis: META_PAGE_TOKENS, FIREBASE_SERVICE_ACCOUNT_KEY e MESES (0 = só os 30 mais recentes, a rotina;
N = volta N meses, para carga inicial). Rede ou marca com problema não derruba as demais.
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

sys.path.insert(0, os.path.dirname(__file__))
from sync_meta_marcas import API, MARCAS, descrever, ler_tokens

DADOS = Path(__file__).resolve().parent.parent / 'data'
IG_CAMPOS = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url'
FB_CAMPOS = ('id,message,story,created_time,permalink_url,full_picture,likes.summary(true).limit(0),'
             'comments.summary(true).limit(0),shares,attachments{media_type}')


def pegar(url, token):
    pedido = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(pedido, timeout=30) as resposta:
        return json.load(resposta)


def paginar(url, token, corte, chave_data):
    """Rotina (sem corte): só a primeira página. Com corte: segue `paging.next` até uma página inteira ficar antes da data.
    Itens antigos no meio da página (post fixado do Facebook) são ignorados sem parar a coleta."""
    itens = []
    while url:
        pagina = pegar(url, token)
        dados = pagina.get('data', [])
        dentro = [item for item in dados if not corte or (item.get(chave_data) or '') >= corte]
        itens += dentro
        if corte and dados and not dentro:
            break
        url = (pagina.get('paging') or {}).get('next') if corte else None
    return itens


def metricas_instagram(post_id, token):
    """total_interactions, views e saved; se a chamada junta falhar (tipo de mídia sem alguma), tenta uma a uma."""
    nomes = ('total_interactions', 'views', 'saved')
    try:
        resposta = pegar(f"{API}/{post_id}/insights?metric={','.join(nomes)}", token)
        return {entrada['name']: (entrada.get('values') or [{}])[0].get('value') for entrada in resposta.get('data', [])}
    except (OSError, ValueError):
        pass
    metricas = {}
    for nome in nomes:
        try:
            for entrada in pegar(f"{API}/{post_id}/insights?metric={nome}", token).get('data', []):
                metricas[nome] = (entrada.get('values') or [{}])[0].get('value')
        except (OSError, ValueError):
            pass  # post antigo ou tipo de mídia sem essa métrica
    return metricas


def posts_instagram(marca, token, corte):
    url = f"{API}/{marca['instagramId']}/media?" + urllib.parse.urlencode({'fields': IG_CAMPOS, 'limit': 100 if corte else 30})
    posts = []
    for item in paginar(url, token, corte, 'timestamp'):
        metricas = metricas_instagram(item['id'], token)
        posts.append({
            'id': item['id'],
            'caption': item.get('caption') or '',
            'mediaType': item.get('media_type'),
            'mediaProductType': item.get('media_product_type'),
            'permalink': item.get('permalink'),
            'thumbnailUrl': item.get('thumbnail_url') or item.get('media_url'),
            'timestamp': item.get('timestamp'),
            'likeCount': item.get('like_count', 0) or 0,
            'commentsCount': item.get('comments_count', 0) or 0,
            'totalInteractions': metricas.get('total_interactions'),
            'views': metricas.get('views'),
            'saved': metricas.get('saved'),
        })
        time.sleep(0.2)  # não martela a API em sequência
    return posts


def posts_facebook(marca, token, corte):
    url = f"{API}/{marca['facebookPageId']}/posts?" + urllib.parse.urlencode({'fields': FB_CAMPOS, 'limit': 50 if corte else 30})
    posts = []
    for item in paginar(url, token, corte, 'created_time'):
        curtidas = ((item.get('likes') or {}).get('summary') or {}).get('total_count', 0) or 0
        comentarios = ((item.get('comments') or {}).get('summary') or {}).get('total_count', 0) or 0
        compartilhamentos = (item.get('shares') or {}).get('count', 0) or 0
        anexos = (item.get('attachments') or {}).get('data') or []
        post = {
            'id': item['id'],
            'caption': item.get('message') or item.get('story') or '',
            'permalink': item.get('permalink_url'),
            'thumbnailUrl': item.get('full_picture'),
            'timestamp': item.get('created_time'),
            'likeCount': curtidas,
            'commentsCount': comentarios,
            'totalInteractions': curtidas + comentarios + compartilhamentos,
        }
        if anexos and anexos[0].get('media_type') == 'video':
            post['mediaProductType'] = 'VIDEO'  # mesmo valor que o painel já reconhece no YouTube
        posts.append(post)
    return posts


def mesclar(existentes, novos):
    por_id = {post['id']: post for post in existentes}
    for post in novos:
        # campo que veio vazio hoje (insights que falharam) não apaga o valor bom já guardado
        por_id[post['id']] = {**por_id.get(post['id'], {}), **{chave: valor for chave, valor in post.items() if valor is not None}}
    return sorted(por_id.values(), key=lambda post: post.get('timestamp') or '', reverse=True)


def main():
    from archive_post_thumbnails import archive_thumbnails  # precisa de Pillow
    from publish_posts_firestore import publish

    tokens = ler_tokens(os.environ['META_PAGE_TOKENS'])
    chave = os.environ['FIREBASE_SERVICE_ACCOUNT_KEY']
    meses = int(os.environ.get('MESES') or 0)
    corte = (datetime.now(timezone.utc) - timedelta(days=30 * meses)).strftime('%Y-%m-%dT%H:%M:%S+0000') if meses else None

    falhas = []
    for marca in json.loads(MARCAS.read_text(encoding='utf-8')):
        token = tokens.get(marca['facebookPageId'])
        sufixo = marca['storeSuffix']
        for rede, coletor, arquivo, loja in (
            ('Instagram', posts_instagram, f'social-posts-{sufixo}.json', f'posts-{sufixo}-v1'),
            ('Facebook', posts_facebook, f'social-facebook-posts-{sufixo}.json', f'facebook-posts-{sufixo}-v1'),
        ):
            try:
                if not token:
                    raise RuntimeError('Página não está no META_PAGE_TOKENS')
                novos = coletor(marca, token, corte)
                caminho = DADOS / arquivo
                existente = json.loads(caminho.read_text(encoding='utf-8')).get('posts', []) if caminho.exists() else []
                posts = mesclar(existente, novos)
                if rede == 'Instagram':
                    archive_thumbnails(posts)  # guarda cópia da miniatura: a URL assinada da Meta expira
                documento = {'version': 1, 'updatedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'), 'posts': posts}
                caminho.write_text(json.dumps(documento, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                publish(loja, documento, chave)
                print(f"{marca['marca']} {rede}: {len(novos)} coletados, {len(posts)} no histórico")
            except urllib.error.HTTPError as erro:
                falhas.append(f"{marca['marca']} {rede}")
                print(f"::error::{marca['marca']} {rede} falhou - {descrever(erro)}")
            except Exception as erro:  # uma rede ou marca com problema não pode impedir as demais
                falhas.append(f"{marca['marca']} {rede}")
                print(f"::error::{marca['marca']} {rede} falhou - {erro}")
    if falhas:
        sys.exit(f"Com falha: {', '.join(falhas)}")


if __name__ == '__main__':
    main()
