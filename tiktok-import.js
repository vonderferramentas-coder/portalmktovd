import { audit, readPortalStore, writePortalStore } from './firebase-client.js';

const STORE_KEY = 'followers-vonder-v1';
const fileInput = document.getElementById('csvFile');
const summary = document.getElementById('importSummary');
const button = document.getElementById('importButton');

// Exportação do TikTok Studio vem em português (idioma da conta), ex.: "16 de setembro".
const MONTHS_PT = {
  janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

function setMessage(message, type = '') {
  summary.textContent = message;
  summary.className = `auth-notice ${type}`.trim();
}

function parseCsv(text) {
  return text.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim().length)
    .map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
}

function parseDayMonth(text) {
  const match = /^(\d{1,2}) de (\p{L}+)$/u.exec(text.trim().toLowerCase());
  const month = match && MONTHS_PT[match[2]];
  return month ? { day: Number(match[1]), month } : null;
}

const isoDate = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// O CSV não tem coluna de ano (a exportação do TikTok Studio omite) — as linhas são dias de
// calendário consecutivos (confirmado no arquivo real testado em 17/09/2026), então a âncora é
// a ÚLTIMA linha: deve cair pouco antes de hoje (a TikTok atrasa a atualização alguns dias,
// nunca perto de um ano). Caminha pra trás um dia por linha; a data/mês do texto de cada linha
// só serve de conferência — se não bater, o arquivo tem um buraco e a importação é recusada
// em vez de gravar uma série torta.
function assignYears(rows, today) {
  if (!rows.length) throw new Error('Arquivo sem linhas de dados.');
  const last = rows[rows.length - 1];
  let year = today.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, last.month - 1, last.day));
  if (candidate.getTime() > today.getTime()) { year -= 1; candidate = new Date(Date.UTC(year, last.month - 1, last.day)); }
  const diffDays = Math.round((today.getTime() - candidate.getTime()) / 86400000);
  if (diffDays > 60 || diffDays < 0) {
    throw new Error(`A última data do arquivo (${last.day}/${last.month}) não parece recente (${diffDays} dias atrás) — confira se é o FollowerHistory.csv certo.`);
  }
  let cursor = candidate;
  const dated = new Array(rows.length);
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (cursor.getUTCDate() !== row.day || cursor.getUTCMonth() + 1 !== row.month) {
      throw new Error(`Data inesperada na linha ${index + 2} do CSV: esperava ${cursor.getUTCDate()}/${cursor.getUTCMonth() + 1}, o arquivo tem ${row.day}/${row.month} — o arquivo pode ter dias faltando.`);
    }
    dated[index] = { date: isoDate(cursor), followers: row.followers };
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return dated;
}

function parseFollowerHistory(text, today) {
  const lines = parseCsv(text);
  if (!lines.length || lines[0][0] !== 'Date') {
    throw new Error('Não parece o FollowerHistory.csv (esperava a coluna "Date" na primeira linha).');
  }
  const rows = lines.slice(1).map((cells, index) => {
    const dayMonth = parseDayMonth(cells[0]);
    if (!dayMonth || !Number.isFinite(Number(cells[1]))) {
      throw new Error(`Linha ${index + 2} do CSV não reconhecida: "${cells.join(',')}"`);
    }
    return { day: dayMonth.day, month: dayMonth.month, followers: Number(cells[1]) };
  });
  return assignYears(rows, today);
}

// Mescla só a chave TikTok — nunca substitui o dicionário 'followers' inteiro do dia (deixaria
// Instagram/Facebook/YouTube sem dado nesses dias, mesmo bug já corrigido em
// reconstruir-historico.yml) nem remove dias fora do período do arquivo.
function mergeTikTokHistory(current, dated) {
  const value = current ? JSON.parse(JSON.stringify(current)) : {};
  value.published = value.published || { version: 2, history: [] };
  value.published.history = Array.isArray(value.published.history) ? value.published.history : [];
  const byDate = new Map(value.published.history.map(entry => [entry.date, entry]));
  dated.forEach(({ date, followers }) => {
    const entry = byDate.get(date) || { date };
    entry.followers = Object.assign({}, entry.followers, { TikTok: followers });
    byDate.set(date, entry);
  });
  value.published.history = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  value.published.version = 2;
  value.published.updatedAt = new Date().toISOString();

  value.live = value.live || { version: 2, platforms: {} };
  value.live.platforms = Object.assign({}, value.live.platforms, {
    TikTok: { username: 'vonderferramentas', followers: dated[dated.length - 1].followers, source: 'tiktok_studio_export' }
  });
  value.live.version = 2;
  value.live.updatedAt = new Date().toISOString();
  return value;
}

let parsedFile = null;

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  button.disabled = true;
  parsedFile = null;
  if (!file) { setMessage('Selecione o arquivo FollowerHistory.csv para começar.'); return; }
  try {
    const text = await file.text();
    const dated = parseFollowerHistory(text, new Date());
    parsedFile = dated;
    const first = dated[0], last = dated[dated.length - 1];
    setMessage(`Pronto: ${dated.length} dias, de ${first.date} (${first.followers} seguidores) a ${last.date} (${last.followers} seguidores).`);
    button.disabled = false;
  } catch (error) {
    setMessage(error.message || 'Não foi possível ler este arquivo.', 'error');
  }
});

button.addEventListener('click', async () => {
  if (!parsedFile) return;
  button.disabled = true;
  setMessage('Importando para o Firestore…');
  try {
    const current = await readPortalStore(STORE_KEY);
    const merged = mergeTikTokHistory(current.v, parsedFile);
    const result = await writePortalStore(STORE_KEY, merged, current.updated_at);
    if (result.conflict) throw new Error('Os dados foram alterados por outra sessão. Atualize a página e tente de novo.');
    await audit('tiktok_history_imported', { days: parsedFile.length, from: parsedFile[0].date, to: parsedFile[parsedFile.length - 1].date });
    setMessage(`Importado: ${parsedFile.length} dias de seguidores do TikTok (${parsedFile[0].date} a ${parsedFile[parsedFile.length - 1].date}).`, 'success');
  } catch (error) {
    setMessage(error.message || 'Não foi possível concluir a importação.', 'error');
    button.disabled = false;
  }
});
