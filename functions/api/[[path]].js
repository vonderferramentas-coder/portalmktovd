// Cloudflare Pages Functions: serve as rotas do Worker ecommerce-fg (foto, oferta, busca etc.) em /api/* no próprio domínio
// do portal (portalmktovd.pages.dev e previews como o HML). Mesmo código do Worker, sem cópia. Ver docs/ARQUITETURA-E-INTEGRACOES.md.
import worker from '../../cloudflare-worker.js';

export const onRequest = ({ request }) => worker.fetch(request);
