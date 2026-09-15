# Cruza os termos do Google Trends coletados por sync-google-trends.yml com o catálogo de
# produtos (data/catalog-vonder.json) — para cada termo, lista os produtos cujo nome tem
# palavra(s) em comum com a busca, ranqueados por quantas palavras bateram. Roda logo após a
# coleta, antes de publicar (edita data/google-trends.json no lugar).
#
# ponytail: casamento por substring de palavra, sem sinônimos nem categoria própria no
# catálogo (o catálogo não tem esse campo hoje — é texto livre). Mostra candidatos demais de
# propósito (melhor sobrar produto que faltar um relevante); uma pessoa da equipe filtra
# visualmente na Central de Inteligência. Caminho de evolução se o ruído incomodar na prática:
# lista de sinônimos curada manualmente por produto, não IA/LLM (evita custo/dependência nova).
import json
import re
import sys
import unicodedata
from pathlib import Path

MAX_MATCHES_PER_TERM = 5
MIN_WORD_LENGTH = 4
# Palavras comuns em português que não ajudam a identificar produto — lista pequena de
# propósito, cobre só os casos mais óbvios que apareceriam em nomes de produto e buscas.
STOPWORDS = {
    'para', 'com', 'sem', 'uma', 'umas', 'uns', 'que', 'dos', 'das', 'nos', 'nas',
    'pela', 'pelo', 'pelas', 'pelos', 'como', 'seus', 'suas', 'este', 'esta',
    'isso', 'aquele', 'aquela', 'mais', 'menos', 'muito', 'pouco',
}


def normalize(text):
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode('ascii')
    return text.lower()


def significant_words(text):
    words = re.findall(r'[a-z0-9]+', normalize(text))
    return [w for w in words if len(w) >= MIN_WORD_LENGTH and w not in STOPWORDS]


def build_index(products):
    index = {}
    for product in products:
        code, name = product.get('code'), product.get('name')
        if not code or not name:
            continue
        for word in set(significant_words(name)):
            index.setdefault(word, []).append((code, name))
    return index


def match_term(term, index):
    words = significant_words(term)
    if not words:
        return []
    scores, names = {}, {}
    for word in words:
        for code, name in index.get(word, []):
            scores[code] = scores.get(code, 0) + 1
            names[code] = name
    ranked = sorted(scores.items(), key=lambda item: (-item[1], names[item[0]]))
    return [{'code': code, 'name': names[code]} for code, _ in ranked[:MAX_MATCHES_PER_TERM]]


def annotate(document, index):
    for category in document.get('categories', {}).values():
        for period in category.get('periods', {}).values():
            for term_entry in period.get('terms', []):
                term_entry['matchedProducts'] = match_term(term_entry['term'], index)


def run(trends_path, catalog_path):
    trends_path, catalog_path = Path(trends_path), Path(catalog_path)
    document = json.loads(trends_path.read_text(encoding='utf-8'))
    if not catalog_path.exists():
        print(f'{catalog_path} não existe — pulando cruzamento com catálogo.')
        return
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    index = build_index(catalog)
    annotate(document, index)
    trends_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Cruzamento aplicado ({len(catalog)} produtos indexados).')


if __name__ == '__main__':
    trends_arg = sys.argv[1] if len(sys.argv) > 1 else 'data/google-trends.json'
    catalog_arg = sys.argv[2] if len(sys.argv) > 2 else 'data/catalog-vonder.json'
    run(trends_arg, catalog_arg)
