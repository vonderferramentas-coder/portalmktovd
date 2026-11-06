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

// Menções: quantas avaliações citam cada vendedor de UMA loja. "recs" são as avaliações dessa loja (já filtradas); devolve Map id -> avaliações que citam.
// Vale o primeiro nome (exceto quando dois ativos da loja o dividem: aí só o apelido atribui) e cada apelido, como palavra inteira, sem acento nem caixa.
export const termosDe = (v, ambiguos) => [ambiguos.has(v.id) ? '' : primeiroNome(v.nome), ...v.apelidos.map(chave)].map(t => t.replace(/[^a-z0-9]+/g, ' ').trim()).filter(t => t.length > 1);

// Onde os termos aparecem no texto, como [[início, fim], ...] sobre o texto ORIGINAL (para grifar). Cada unidade do texto vira exatamente um caractere do texto
// normalizado (sem acento, minúsculo, o resto vira espaço), então os índices servem nos dois. Uma menção é uma palavra inteira (ou a frase inteira, num apelido composto).
export function trechos(texto, termos) {
  const n = ' ' + String(texto || '').split('').map(c => { const x = sem(c); return x.length === 1 && /[a-z0-9]/.test(x) ? x : ' '; }).join('') + ' '; // 1 espaço à frente: o índice do " termo " é o do termo no texto
  const achados = [];
  termos.forEach(t => { for (let i = n.indexOf(` ${t} `); i >= 0; i = n.indexOf(` ${t} `, i + 1)) achados.push([i, i + t.length]); });
  achados.sort((a, b) => a[0] - b[0]);
  return achados.reduce((r, a) => { const u = r[r.length - 1]; if (u && a[0] <= u[1]) u[1] = Math.max(u[1], a[1]); else r.push([...a]); return r; }, []);
}

export function mencoes(vendedores, recs) {
  const ambiguos = nomesAmbiguos(vendedores);
  return new Map(vendedores.map(v => { const termos = termosDe(v, ambiguos); return [v.id, recs.filter(r => trechos(r.t, termos).length)]; }));
}
