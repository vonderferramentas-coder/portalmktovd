// Cadastro de vendedores da campanha (lojas da Ferramentas Gerais): lógica pura, sem tela nem Firebase.
const sem = texto => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const chave = texto => sem(texto).replace(/\s+/g, ' ').trim();
export const idDe = (loja, nome) => `${chave(loja)}|${chave(nome)}`;
const primeiroNome = nome => chave(nome).split(' ')[0];

// Aceita o que o Excel copia (colunas separadas por tab) ou ";"; ignora linhas vazias e o cabeçalho "Loja / Vendedores".
export function lerColado(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.split(/\t|;/).map(c => c.trim()));
  return linhas.filter(([loja, nome]) => loja && nome && !(chave(loja) === 'loja' && /^vendedor/.test(chave(nome)))).map(([loja, nome]) => ({ loja, nome }));
}

// Junta novos nomes à lista sem duplicar (mesma loja + mesmo nome, ignorando acento, caixa e espaços).
export function adicionar(lista, novos) {
  const vistos = new Set(lista.map(v => v.id)), resultado = [...lista];
  let repetidos = 0;
  novos.forEach(({ loja, nome, apelidos = [] }) => {
    const id = idDe(loja, nome);
    if (vistos.has(id)) { repetidos++; return; }
    vistos.add(id);
    resultado.push({ id, loja: loja.trim(), nome: nome.trim(), apelidos, ativo: true });
  });
  return { lista: resultado, adicionados: resultado.length - lista.length, repetidos };
}

export const apelidosDoTexto = texto => [...new Set(String(texto || '').split(',').map(a => a.trim()).filter(Boolean))];

// Vendedores ativos da mesma loja com o mesmo primeiro nome: a citação "Joao" não dá para atribuir sem apelido.
export function nomesAmbiguos(lista) {
  const contagem = {};
  lista.filter(v => v.ativo).forEach(v => { const k = `${chave(v.loja)}|${primeiroNome(v.nome)}`; contagem[k] = (contagem[k] || 0) + 1; });
  return new Set(lista.filter(v => v.ativo && contagem[`${chave(v.loja)}|${primeiroNome(v.nome)}`] > 1).map(v => v.id));
}

export const ordenar = lista => [...lista].sort((a, b) => a.loja.localeCompare(b.loja, 'pt-BR') || b.ativo - a.ativo || a.nome.localeCompare(b.nome, 'pt-BR'));

// Planilha para exportar (CSV com ";" e BOM, que o Excel abre direto). Reimportável: lerColado lê as duas primeiras colunas e pula o cabeçalho.
const celula = t => { const x = String(t).replace(/[;"\s]+/g, ' ').trim(); return /^[=+\-@]/.test(x) ? "'" + x : x; }; // "'" na frente: o Excel não executa texto como fórmula
export const paraCsv = lista => '\uFEFF' + ['Loja;Vendedor;Apelidos;Ativo', ...lista.map(v => [v.loja, v.nome, v.apelidos.join(', '), v.ativo ? 'Sim' : 'Não'].map(celula).join(';'))].join('\r\n') + '\r\n';
