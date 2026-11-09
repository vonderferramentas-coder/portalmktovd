#!/usr/bin/env python3
"""Coleta as avaliações do Google Meu Negócio (Business Profile API, v4) e grava no Firestore.

Armazenamento (plano Spark, sem cobrança): as avaliações ficam agrupadas por mês de criação, um documento por mês
(`avaliacoesGoogle/AAAA-MM`), e o resumo por ficha em `avaliacoesGoogle/resumo`. Um documento por avaliação gastaria
~15 mil das 20 mil gravações diárias só na carga inicial. A coleção é própria (fora do `portalStore`, que qualquer usuário
ativo lê): o firestore.rules só deixa ler admin, gestao e social-media, e ninguém escreve pelo navegador (só o Admin SDK).
Fora do `portalStore` também não entra no backup diário: o Google é a fonte, e o `--completo` recompõe tudo.
O texto das avaliações vai como string JSON dentro do documento: o Firestore indexa cada campo de um mapa (limite de
40 mil entradas por documento) e uma string não gera esse índice.

Modos:
  (padrão)  incremental: lê as avaliações em ordem de atualização (mais novas primeiro) e para ao chegar na data já coletada
            (edições e respostas também atualizam essa data). Não detecta avaliação apagada pelo cliente: o `--completo` corrige.
  --completo  relê tudo e reconstrói os documentos (carga inicial e reconciliação).
  --ensaio    relê tudo e só imprime totais (nada é gravado e o Firebase nem é usado). O repositório é público e o log das
              Actions também: nunca imprimir ID de conta/ficha, nome de avaliador nem texto de avaliação.
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

COLECAO = 'avaliacoesGoogle'
RESUMO = 'resumo'
ESTRELAS = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5}
LIMITE_DOC = 900_000  # bytes; o Firestore aceita ~1 MiB por documento
MARGEM = timedelta(days=1)  # folga na data de corte do modo incremental
CAMPOS_ENDERECO = ('uf', 'cidade', 'bairro', 'rua', 'cep', 'endereco', 'categoria', 'telefone', 'mapsUri')  # dados da ficha que a tela mostra; mapsUri = link da ficha no Google Maps (botão "Ver no Google")
env = lambda name: os.environ.get(name, '').strip()
segredos = [env('GBP_CLIENT_SECRET'), env('GBP_REFRESH_TOKEN')]


def mascarar(texto):
    for valor in segredos:
        if len(valor) >= 8:
            texto = texto.replace(valor, '***')
    return re.sub(r'(accounts|locations)/\d+', r'\1/***', texto.replace('\n', ' '))


def http(url, dados=None, cabecalhos=None):
    """(status, corpo JSON como dict). Em falha de rede, 429 (cota por minuto) e 5xx (instabilidade do Google, como o 503
    que derrubou a primeira carga) espera 10, 30 e 60 s e tenta de novo, até 3 vezes."""
    for espera in (10, 30, 60, 0):
        pedido = urllib.request.Request(url, data=dados, headers=cabecalhos or {})
        try:
            with urllib.request.urlopen(pedido, timeout=30) as resposta:
                status, corpo = resposta.status, resposta.read()
        except urllib.error.HTTPError as erro:
            status, corpo = erro.code, erro.read()
        except (urllib.error.URLError, OSError) as erro:
            status, corpo = 0, json.dumps({'error': {'message': f'falha de rede: {erro}'}}).encode()
        if espera and status in (0, 429, 500, 502, 503, 504):
            time.sleep(espera)
            continue
        break
    try:
        corpo = json.loads(corpo.decode('utf-8'))
    except ValueError:
        corpo = {}
    return status, corpo if isinstance(corpo, dict) else {}


def falha(mensagem, status, corpo):
    info = corpo.get('error') or {}
    detalhe = info.get('message', info) if isinstance(info, dict) else info
    sys.exit(f'::error::{mensagem} (HTTP {status}): {mascarar(str(detalhe))[:300]}')


def autenticar():
    if not all(env(n) for n in ('GBP_CLIENT_ID', 'GBP_CLIENT_SECRET', 'GBP_REFRESH_TOKEN')):
        sys.exit('::error::Segredo GBP_* não configurado.')
    status, corpo = http('https://oauth2.googleapis.com/token', urllib.parse.urlencode({
        'grant_type': 'refresh_token', 'refresh_token': env('GBP_REFRESH_TOKEN'),
        'client_id': env('GBP_CLIENT_ID'), 'client_secret': env('GBP_CLIENT_SECRET')}).encode(),
        {'Content-Type': 'application/x-www-form-urlencoded'})
    if status != 200 or not corpo.get('access_token'):
        sys.exit(f'::error::O Google recusou a renovação do token (HTTP {status}): {mascarar(str(corpo.get("error", "")))}. '
                 'Se o refresh token foi revogado, gerar outro no OAuth Playground e atualizar o segredo GBP_REFRESH_TOKEN.')
    segredos.append(corpo['access_token'])
    return {'Authorization': f'Bearer {corpo["access_token"]}'}


def paginas(url, campo, auth, **consulta):
    """Itens de `campo` de todas as páginas de uma listagem do Google (segue nextPageToken)."""
    itens, pagina = [], ''
    while True:
        parametros = dict(consulta, **({'pageToken': pagina} if pagina else {}))
        status, corpo = http(f'{url}?{urllib.parse.urlencode(parametros)}', cabecalhos=auth)
        if status != 200:
            falha('Listagem do Google falhou', status, corpo)
        itens += corpo.get(campo, [])
        pagina = corpo.get('nextPageToken', '')
        if not pagina:
            return itens


ESTADOS = {'AC': 'acre', 'AL': 'alagoas', 'AP': 'amapa', 'AM': 'amazonas', 'BA': 'bahia', 'CE': 'ceara', 'DF': 'distrito federal', 'ES': 'espirito santo',
           'GO': 'goias', 'MA': 'maranhao', 'MT': 'mato grosso', 'MS': 'mato grosso do sul', 'MG': 'minas gerais', 'PA': 'para', 'PB': 'paraiba', 'PR': 'parana',
           'PE': 'pernambuco', 'PI': 'piaui', 'RJ': 'rio de janeiro', 'RN': 'rio grande do norte', 'RS': 'rio grande do sul', 'RO': 'rondonia', 'RR': 'roraima',
           'SC': 'santa catarina', 'SP': 'sao paulo', 'SE': 'sergipe', 'TO': 'tocantins'}


def sem_acento(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if not unicodedata.combining(c)).lower().strip()


def uf_de(area):
    """Sigla de 2 letras a partir do que o Google devolve em administrativeArea ('PR', 'Paraná', 'Estado do Paraná'); vazio se não reconhecer.
    Cortar nas 2 primeiras letras trocaria Paraná por PA e Santa Catarina por SA."""
    texto = sem_acento(area or '')
    for sigla, nome in sorted(ESTADOS.items(), key=lambda e: -len(e[1])):  # nome mais longo primeiro: "mato grosso do sul" antes de "mato grosso"
        if texto == sigla.lower() or re.search('(?<![a-z])' + nome + '(?![a-z])', texto):
            return sigla
    achado = re.search('(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])', (area or '') if len(texto) <= 40 else '')  # 'Paraná - PR', 'PR.' (sigla em maiúsculas)
    return achado.group(1) if achado and achado.group(1) in ESTADOS else ''


def endereco_de(ficha):
    """Endereço do cadastro da ficha (storefrontAddress): rua e número, bairro, cidade, UF, CEP e a linha completa para exibir."""
    dados = ficha.get('storefrontAddress') or {}
    rua = ', '.join(l.strip() for l in dados.get('addressLines', []) if l and l.strip())
    bairro, cidade = (dados.get('sublocality') or '').strip(), (dados.get('locality') or '').strip()
    cep = (dados.get('postalCode') or '').strip()
    uf = uf_de(dados.get('administrativeArea'))
    cidade_uf = ' - '.join(p for p in (cidade, uf) if p)
    bairro_na_rua = bairro and re.search('(?<![a-z])' + re.escape(sem_acento(bairro)) + '(?![a-z])', sem_acento(rua))  # o Google às vezes já traz o bairro na linha da rua
    completo = ', '.join(p for p in (rua, '' if bairro_na_rua else bairro, cidade_uf, f'CEP {cep}' if cep else '') if p)
    return {'uf': uf, 'cidade': cidade, 'bairro': bairro, 'rua': rua, 'cep': cep, 'endereco': completo}


def listar_fichas(auth):
    """[{'conta': 'accounts/1', 'id': '123', 'title': ..., 'uf', 'cidade', 'bairro', 'rua', 'cep', 'endereco', 'categoria', 'telefone', 'mapsUri'}]: o id é o número da ficha (sem o prefixo locations/).
    Lista incompleta seria perigosa (o --completo apagaria os blocos das fichas que faltam), por isso segue todas as páginas."""
    fichas = []
    for conta in paginas('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', 'accounts', auth, pageSize=20):
        for ficha in paginas(f'https://mybusinessbusinessinformation.googleapis.com/v1/{conta["name"]}/locations', 'locations', auth, readMask='name,title,storefrontAddress,primaryCategory,phoneNumbers,metadata', pageSize=100):
            fichas.append({'conta': conta['name'], 'id': ficha['name'].split('/')[-1], 'title': ficha.get('title', '(sem título)'), **endereco_de(ficha),
                           'categoria': ((ficha.get('primaryCategory') or {}).get('displayName') or '').strip(), 'telefone': ((ficha.get('phoneNumbers') or {}).get('primaryPhone') or '').strip(),
                           'mapsUri': ((ficha.get('metadata') or {}).get('mapsUri') or '').strip()})
    return fichas


def quando(texto):
    texto = re.sub(r'(\.\d{6})\d+', r'\1', (texto or '1970-01-01T00:00:00Z').replace('Z', '+00:00'))  # fração com mais de 6 dígitos
    return datetime.fromisoformat(texto)


MARCA_TRADUCAO = re.compile(r'[(](?:Translated by Google|Traduzido pelo Google)[)]', re.I)
MARCA_ORIGINAL = re.compile(r'[(]Original[)]', re.I)


def texto_original(comentario):
    """O Google junta ao comentário o aviso '(Translated by Google)' com a tradução: em geral depois do texto do cliente, às vezes antes
    ('(Translated by Google) tradução (Original) original'). Guarda só o original. Tem de vir antes do corte de 1500 caracteres."""
    comentario = comentario or ''
    marca = MARCA_TRADUCAO.search(comentario)
    if not marca:
        return comentario
    antes = comentario[:marca.start()].strip()
    if antes:
        return antes
    resto = comentario[marca.end():]
    original = MARCA_ORIGINAL.search(resto)
    return (resto[original.end():] if original else resto).strip()


def registro(avaliacao, ficha_id):
    """Forma compacta guardada no Firestore. Chaves: l ficha, s estrelas, c criada, u atualizada, n autor, t texto, r resposta, rt data da resposta."""
    autor = avaliacao.get('reviewer') or {}
    resposta = avaliacao.get('reviewReply') or {}
    return {'l': ficha_id, 's': ESTRELAS.get(avaliacao.get('starRating'), 0), 'c': avaliacao.get('createTime', ''), 'u': avaliacao.get('updateTime', ''),
            'n': '' if autor.get('isAnonymous') else autor.get('displayName', ''), 't': texto_original(avaliacao.get('comment'))[:1500],
            'r': resposta.get('comment', ''), 'rt': resposta.get('updateTime', '')}


def ler_ficha(auth, ficha, corte):
    """(registros novos, {'total', 'media'}). `corte` None lê tudo; senão para na primeira página que já cruzou a data de corte."""
    novos, meta, pagina = {}, {}, ''
    while True:
        consulta = {'pageSize': 50, 'orderBy': 'updateTime desc'}
        if pagina:
            consulta['pageToken'] = pagina
        status, corpo = http(f'https://mybusiness.googleapis.com/v4/{ficha["conta"]}/locations/{ficha["id"]}/reviews?{urllib.parse.urlencode(consulta)}', cabecalhos=auth)
        if status != 200:
            falha('Ler avaliações falhou', status, corpo)
        meta = {'total': corpo.get('totalReviewCount', 0), 'media': corpo.get('averageRating')}
        avaliacoes = corpo.get('reviews', [])
        for avaliacao in avaliacoes:
            novos[avaliacao['reviewId']] = registro(avaliacao, ficha['id'])
        pagina = corpo.get('nextPageToken', '')
        if not pagina or not avaliacoes or (corte and quando(avaliacoes[-1].get('updateTime')) < corte):
            return novos, meta
        time.sleep(0.25)  # a cota é de 300 consultas por minuto; sobra folga


def mesclar(meses, novos):
    """Insere/atualiza os registros nos blocos por mês (criação) e devolve os meses alterados."""
    alterados = set()
    for chave, rec in novos.items():
        mes = rec['c'][:7] or 'sem-data'
        bloco = meses.setdefault(mes, {})
        if bloco.get(chave) != rec:
            bloco[chave] = rec
            alterados.add(mes)
    return alterados


def resumir(fichas, meses, metas):
    por = {f['id']: {'id': f['id'], 'title': f['title'], **{c: f.get(c, '') for c in CAMPOS_ENDERECO}, 'coletadas': 0, 'estrelas': [0] * 5, 'semResposta': 0, 'ultima': '',
                     'googleTotal': (metas.get(f['id']) or {}).get('total'), 'googleMedia': (metas.get(f['id']) or {}).get('media')} for f in fichas}
    for bloco in meses.values():
        for rec in bloco.values():
            item = por.get(rec['l'])
            if not item:
                continue
            item['coletadas'] += 1
            if rec['s'] >= 1:
                item['estrelas'][rec['s'] - 1] += 1
            item['semResposta'] += 0 if rec['r'] else 1
            item['ultima'] = max(item['ultima'], rec['c'])
    return list(por.values())


def tamanho(bloco):
    return len(json.dumps(bloco, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))


def relatorio(resumo, meses):
    """Só totais: o log é público."""
    por_ano = {}
    for mes, bloco in meses.items():
        por_ano[mes[:4]] = por_ano.get(mes[:4], 0) + len(bloco)
    maior = max(meses, key=lambda m: tamanho(meses[m]), default=None)
    print(f'Avaliações coletadas: {sum(i["coletadas"] for i in resumo)} (Google informa {sum(i["googleTotal"] or 0 for i in resumo)})')
    print('Por ano: ' + ', '.join(f'{a}: {n}' for a, n in sorted(por_ano.items())))
    print(f'Blocos mensais: {len(meses)}; maior bloco: {tamanho(meses[maior]) // 1024 if maior else 0} KB ({maior}); limite {LIMITE_DOC // 1024} KB')
    print(f'Sem resposta: {sum(i["semResposta"] for i in resumo)}; estrelas 1 a 5: ' + str([sum(i["estrelas"][k] for i in resumo) for k in range(5)]))
    for item in resumo:
        divergencia = '' if item['coletadas'] == (item['googleTotal'] or 0) else f' (Google informa {item["googleTotal"]})'
        print(f'  - {item["title"]}: {item["coletadas"]} coletadas{divergencia}, {item["semResposta"]} sem resposta')


def gravar(db, firestore, meses, alterados, resumo, cursor, completo, anteriores):
    ms = int(time.time() * 1000)
    agora = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    envelope = lambda v: {'v': v, 'updated_at': ms, 'updatedAt': firestore.SERVER_TIMESTAMP}
    colecao = db.collection(COLECAO)
    for mes in sorted(alterados):
        if tamanho(meses[mes]) > LIMITE_DOC:  # ponytail: um bloco por mês; se estourar, dividir por ficha
            sys.exit(f'::error::O bloco de {mes} passou de {LIMITE_DOC // 1024} KB; dividir o mês por ficha antes de continuar.')
        colecao.document(mes).set(envelope({'version': 1, 'month': mes, 'reviewsJson': json.dumps(meses[mes], ensure_ascii=False, separators=(',', ':'))}))
    if completo:  # a reconstrução apaga os meses que deixaram de existir
        for mes in set(anteriores) - set(meses):
            colecao.document(mes).delete()
    colecao.document(RESUMO).set(envelope({'version': 1, 'updatedAt': agora, 'meses': sorted(meses), 'cursor': cursor, 'fichas': resumo}))
    print(f'Firestore atualizado: {len(alterados)} bloco(s) mensal(is) gravado(s).')


def main(argumentos=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--completo', action='store_true')
    parser.add_argument('--ensaio', action='store_true')
    args = parser.parse_args(argumentos)
    completo = args.completo or args.ensaio

    auth = autenticar()
    fichas = listar_fichas(auth)
    print(f'Fichas: {len(fichas)}')
    # Só contagens (o log é público): quantas fichas ficaram com endereço incompleto no cadastro do Google.
    faltam = sum(1 for f in fichas if not (f['rua'] and f['cidade'] and f['uf']))
    if faltam:
        print(f'::warning::{faltam} ficha(s) sem rua, cidade ou UF no cadastro do Google.')

    db = firestore = None
    meses, cursor, anteriores = {}, {}, []
    if not args.ensaio:
        if not env('FIREBASE_SERVICE_ACCOUNT_KEY'):
            sys.exit('::error::FIREBASE_SERVICE_ACCOUNT_KEY não configurado - sem ele não dá para gravar.')
        import firebase_admin
        from firebase_admin import credentials, firestore
        firebase_admin.initialize_app(credentials.Certificate(json.loads(env('FIREBASE_SERVICE_ACCOUNT_KEY'))))
        db = firestore.client()
        anterior = db.collection(COLECAO).document(RESUMO).get()
        guardado = ((anterior.to_dict() or {}).get('v') or {}) if anterior.exists else {}
        anteriores, cursor = guardado.get('meses', []), dict(guardado.get('cursor') or {})
        if not completo:
            if not guardado:
                sys.exit('::error::Ainda não há carga inicial: rodar uma vez com completo=true.')
            for mes in anteriores:
                doc = db.collection(COLECAO).document(mes).get()
                meses[mes] = json.loads(((doc.to_dict() or {}).get('v') or {}).get('reviewsJson') or '{}')

    metas, alterados = {}, set()
    for ficha in fichas:
        ultimo = cursor.get(ficha['id'])
        corte = None if completo or not ultimo else quando(ultimo) - MARGEM
        novos, metas[ficha['id']] = ler_ficha(auth, ficha, corte)
        alterados |= mesclar(meses, novos)
        cursor[ficha['id']] = max([ultimo or ''] + [r['u'] for r in novos.values()])

    resumo = resumir(fichas, meses, metas)
    if args.ensaio:
        relatorio(resumo, meses)
        return
    if completo:
        alterados = set(meses)
    print(f'{sum(i["coletadas"] for i in resumo)} avaliações no total; {len(alterados)} bloco(s) mensal(is) alterado(s).')
    gravar(db, firestore, meses, alterados, resumo, cursor, completo, anteriores)


if __name__ == '__main__':
    main()
