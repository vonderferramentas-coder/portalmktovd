/* Worker do Revisor de Planilha: lê e grava o .xlsx fora da tela principal (a planilha do catálogo passa de 240 mil linhas). */
importScripts('../vendor/xlsx.full.min.js');
self.onmessage = ev => {
  const { op, buffer, aoa } = ev.data;
  try {
    if (op === 'read') {
      const wb = XLSX.read(buffer, { type: 'array', dense: true, cellNF: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // data vira texto dd/mm/aaaa: sem isso aparece e é exportada como número de série (45000)
      (ws['!data'] || []).forEach(row => row && row.forEach(c => { if (c && c.t === 'n' && c.z && XLSX.SSF.is_date(c.z)) { c.v = XLSX.SSF.format(c.v < 1 ? 'hh:mm' : c.v % 1 ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy', c.v); c.t = 's'; delete c.z; delete c.w; } }));
      const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      self.postMessage({ op, sheet: wb.SheetNames[0], header: all[0] || [], rows: all.slice(1) });
    } else if (op === 'write') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Revisão');
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
      self.postMessage({ op, out }, [out]);
    }
  } catch (e) { self.postMessage({ op, error: String(e && e.message || e) }); }
};
