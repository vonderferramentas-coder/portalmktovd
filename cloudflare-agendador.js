// Agendador externo dos coletores do portal (Cloudflare Worker, só com Cron Trigger).
//
// Por quê: o GitHub entrega os agendamentos (`schedule`) com atraso de várias horas - até um cron
// de 15 em 15 minutos roda de 3 em 3 ou de 5 em 5 horas, e os fechamentos diários chegaram a
// falhar, e um cron atrasado cancelava runs na fila. Este Worker chama `workflow_dispatch` no
// horário certo e é o único disparo: os workflows não têm mais cron próprio.
//
// Configuração (Console do Cloudflare, nunca neste arquivo):
//  - Cron Trigger único: `*/5 * * * *` (a agenda abaixo decide o que disparar em cada minuto;
//    só minutos múltiplos de 5);
//  - Segredo `GITHUB_DISPATCH_TOKEN`: token fine-grained do GitHub, só neste repositório,
//    permissão "Actions: Read and write". Se for revogado ou expirar, os disparos falham e o log mostra 401.
//
// Se todas as tentativas falharem, aquela execução se perde até o próximo horário (sem reserva).

const REPO = 'vonderferramentas-coder/portalmktovd';

// Horários em UTC (São Paulo = UTC-3). `rotina: true` = coleta comum, que NÃO fecha o dia nem
// força a busca diária de mais vistos; `false` = o fechamento diário (como um disparo manual);
// sem `rotina` = workflow que não tem essa entrada (não pode receber `inputs`: o GitHub recusa).
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
  // Posts e vídeos de 12 em 12 horas (00 e 12 UTC), minutos diferentes entre si.
  if (hora % 12 === 0 && minuto === 10) fila.push({ workflow: 'sync-meta-posts.yml' });
  if (hora % 12 === 0 && minuto === 20) fila.push({ workflow: 'sync-meta-facebook-posts.yml' });
  if (hora % 12 === 0 && minuto === 25) fila.push({ workflow: 'sync-youtube-videos.yml' });
  // Rotinas diárias (UTC), no mesmo horário do cron de cada workflow, no múltiplo de 5 min mais
  // próximo. As tendências (4 a 15 min) saem às 06:15 para terminar antes das coletas de :35/:40; os
// fechamentos (02:50/02:55) saem antes das reconstruções e do resto.
  const diarias = {
    '3:15': 'aggregate-usage-metrics.yml',
    '4:30': 'sync-youtube-analytics-diario.yml',
    '6:15': 'sync-google-trends.yml',
    '7:0': 'backup-portalstore.yml',
    '11:40': 'reconstruir-historico.yml',
    '12:40': 'reconstruir-historico-facebook.yml'
  };
  if (diarias[`${hora}:${minuto}`]) fila.push({ workflow: diarias[`${hora}:${minuto}`] });
  return fila;
}

// Até 3 tentativas em falha de rede, HTTP 5xx ou 429; erro 4xx (token, permissão, entrada
// inválida) não se resolve repetindo, então só registra no log.
export async function disparar(env, { workflow, rotina }, esperar = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resposta = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'portal-mkt-agendador',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify(rotina === undefined ? { ref: 'main' } : { ref: 'main', inputs: { rotina: String(rotina) } })
      });
      if (resposta.status === 204) return;
      console.error(`Falha ao disparar ${workflow} (tentativa ${tentativa}): HTTP ${resposta.status} ${await resposta.text()}`);
      if (resposta.status < 500 && resposta.status !== 429) return;
    } catch (erro) {
      console.error(`Falha ao disparar ${workflow} (tentativa ${tentativa}): ${erro}`);
    }
    if (tentativa < 3) await esperar(2000 * tentativa);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all(agendaDoMomento(new Date(event.scheduledTime)).map(item => disparar(env, item))));
  }
};
