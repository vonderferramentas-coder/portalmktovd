import { db } from './firebase-client.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const toolNames = {
  'post-editor': 'Editor de Posts',
  'post-editor-busca-sem-resultado': 'Editor de Posts - buscas sem resultado no catálogo',
  'post-editor-produto-do-site': 'Editor de Posts - produtos escolhidos pelo site',
  'cartaz-generator': 'Gerador de Cartazes',
  'business-card-generator': 'Gerador de Cartões',
  'conecta-fg': 'Conecta FG',
  'photoshop-actions': 'Ações do Photoshop'
};
const brandNames = {
  default: 'VONDER',
  'ferramentas-gerais': 'Ferramentas Gerais',
  'osten-ferragens': 'Osten Ferragens',
  dismatal: 'Dismatal',
  toolmix: 'Toolmix',
  dwt: 'DWT',
  nove54: 'Nove54',
  'grupo-ovd': 'Grupo OVD',
  'pilar-tecnologia': 'Pilar Tecnologia'
};
const day = value => value.toISOString().slice(0, 10);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const toolLabel = value => toolNames[value] || value;
const brandLabel = value => brandNames[value] || value || 'Sem marca';
let rows = [];

function options(id, values, label) {
  const el = $(id), current = el.value;
  [...new Set(values.filter(Boolean))].sort((a, b) => label(a).localeCompare(label(b), 'pt-BR')).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label(value);
    el.append(option);
  });
  el.value = current;
}

function list(id, data, field, label) {
  const el = $(id), totals = {};
  data.forEach(row => {
    const value = row[field] || '';
    totals[value] = (totals[value] || 0) + Number(row.quantity || 0);
  });
  const items = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  el.innerHTML = items.length
    ? items.map(([value, total]) => '<div class="usage-row"><span>' + escapeHtml(label(value)) + '</span><strong>' + total + '</strong></div>').join('')
    : '<p class="usage-empty">Ainda não há entregas consolidadas neste período.</p>';
}

function render() {
  const days = Number($('period').value), start = new Date();
  start.setDate(start.getDate() - days + 1);
  const subset = rows.filter(row => row.date >= day(start) && (!$('tool').value || row.tool === $('tool').value) && (!$('brand').value || row.brandId === $('brand').value));
  const total = subset.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const users = subset.reduce((sum, row) => sum + Number(row.uniqueUsers || 0), 0);
  $('total').textContent = total;
  $('users').textContent = users;
  $('tools').textContent = new Set(subset.map(row => row.tool)).size;
  $('change').textContent = '-';
  list('ranking', subset, 'tool', toolLabel);
  list('brands', subset, 'brandId', brandLabel);
}

try {
  const start = new Date();
  start.setDate(start.getDate() - 89);
  const snapshot = await getDocs(query(collection(db, 'usageDaily'), where('date', '>=', day(start))));
  rows = snapshot.docs.map(doc => doc.data());
  options('tool', rows.map(row => row.tool), toolLabel);
  options('brand', rows.map(row => row.brandId), brandLabel);
  ['period', 'tool', 'brand'].forEach(id => $(id).addEventListener('change', render));
  render();
} catch (error) {
  console.error(error);
  ['ranking', 'brands'].forEach(id => $(id).innerHTML = '<p class="usage-empty">Não foi possível carregar os indicadores agora.</p>');
}
