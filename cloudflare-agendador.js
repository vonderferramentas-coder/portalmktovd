// Agendador externo dos coletores do portal (Cloudflare Worker, só com Cron Trigger).
//
// Por quê: o GitHub entrega os agendamentos (`schedule`) com atraso de várias horas - até um cron
// de 15 em 15 minutos roda de 3 em 3 ou de 5 em 5 horas, e os fechamentos diários chegaram a
// falhar. Este Worker chama `workflow_dispatch` no horário certo; os crons dos workflows ficam
// como reserva (atrasada) caso o Worker ou o token parem.
//
// Configuração (Console do Cloudflare, nunca neste arquivo):
//  - Cron Trigger único: `*/5 * * * *` (a agenda abaixo decide o que disparar em cada minuto);
//  - Segredo `GITHUB_DISPATCH_TOKEN`: token fine-grained do GitHub, só neste repositório,
//    permissão "Actions: Read and write". Quando expirar, os disparos falham e o log mostra 401.
//
// ponytail: sem repetição em caso de falha do disparo; a reserva é o cron do próprio workflow.

const REPO = 'vonderferramentas-coder/portalmktovd';

// Horários em UTC (São Paulo = UTC-3). `rotina: true` = coleta comum, que NÃO fecha o dia nem
// força a busca diária de mais vistos; `false` = o fechamento diário (como um disparo manual).
export function agendaDoMomento(agora) {
  const hora = agora.getUTCHours();
  const minuto = agora.getUTCMinutes();
  const fila = [];
  if (minuto === 5) fila.push({ workflow: 'sync-meta-followers.yml', rotina: true });
  if (minuto === 35) fila.push({ workflow: 'sync-youtube-followers.yml', rotina: true });
  if (minuto === 40 && hora % 2 === 0) fila.push({ workflow: 'sync-youtube-mencoes.yml', rotina: true });
  // Fechamento diário: 23:50 (YouTube) e 23:55 (Meta) em São Paulo.
  if (hora === 2 && minuto === 50) fila.push({ workflow: 'sync-youtube-followers.yml', rotina: false });
  if (hora === 2 && minuto === 55) fila.push({ workflow: 'sync-meta-followers.yml', rotina: false });
  return fila;
}

async function disparar(env, { workflow, rotina }) {
  const resposta = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'portal-mkt-agendador',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref: 'main', inputs: { rotina: String(rotina) } })
  });
  if (resposta.status !== 204) {
    console.error(`Falha ao disparar ${workflow}: HTTP ${resposta.status} ${await resposta.text()}`);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all(agendaDoMomento(new Date(event.scheduledTime)).map(item => disparar(env, item))));
  }
};
