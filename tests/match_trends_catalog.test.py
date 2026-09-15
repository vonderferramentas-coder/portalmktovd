# Teste mínimo (sem framework, mesmo padrão informal de tests/concurrent-post-storage.test.ps1)
# do cruzamento Trends x catálogo. Roda direto: python3 tests/match_trends_catalog.test.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from match_trends_catalog import build_index, match_term, significant_words  # noqa: E402

CATALOG = [
    {'code': '1', 'name': 'Furadeira de Impacto Elétrica 750W VONDER'},
    {'code': '2', 'name': 'Parafusadeira e Furadeira de Impacto a Bateria 20V VONDER'},
    {'code': '3', 'name': 'Jogo de Brocas para Furadeira 10 Peças VONDER'},
    {'code': '4', 'name': 'Serra Circular Elétrica 1400W VONDER'},
]

index = build_index(CATALOG)

# termo com 2+ palavras significativas bate com os 3 produtos que têm "furadeira" e/ou
# "impacto" no nome, e ranqueia primeiro quem tem as duas palavras
matches = match_term('furadeira de impacto profissional', index)
assert [m['code'] for m in matches] == ['1', '2', '3'], matches
assert matches[0]['code'] in ('1', '2'), 'produtos com as duas palavras (furadeira e impacto) devem vir primeiro'

# termo sem nenhuma palavra em comum não bate com nada
assert match_term('esmerilhadeira angular', index) == []

# termo vazio ou só com stopword/palavra curta não quebra e não bate com nada
assert match_term('', index) == []
assert match_term('de com para', index) == []

# no máximo 5 produtos por termo (checa o corte, não só o caso com poucos produtos)
big_catalog = [{'code': str(i), 'name': f'Furadeira Modelo {i} VONDER'} for i in range(10)]
big_index = build_index(big_catalog)
assert len(match_term('furadeira', big_index)) == 5

# normalização remove acento acento e caixa, sem quebrar palavras compostas por hífen
assert significant_words('Serra Tico-Tico Elétrica') == ['serra', 'tico', 'tico', 'eletrica']

print('PASS: cruzamento Trends x catálogo rankeia por sobreposição de palavras e respeita o limite de 5.')
