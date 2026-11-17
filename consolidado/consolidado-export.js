// Exportação do consolidado (html2canvas 1.4.1 não implementa object-fit e recorta transform+overflow incorretamente, o que esticava as fotos).
// Mesma solução do Gerador de Cartazes: no clone usado pelo html2canvas, cada imagem é "assada" num canvas já com o enquadramento (contain),
// o zoom e o arraste finais, e o <img> vira um preenchimento simples (object-fit: fill) numa caixa sem transform.
(function (global) {
  'use strict';

  function draw(img, boxW, boxH, scale, exportScale) {
    const canvas = document.createElement('canvas'); canvas.width = Math.round(boxW * exportScale); canvas.height = Math.round(boxH * exportScale);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; // fotos de origem têm 2000-4000 px: sem isso a redução fica serrilhada
    context.drawImage(img, (boxW - w) / 2 * exportScale, (boxH - h) / 2 * exportScale, w * exportScale, h * exportScale);
    return canvas.toDataURL();
  }

  function bakeImages(origPage, clonedPage, exportScale) {
    clonedPage.querySelectorAll('.photo-editing').forEach(el => el.classList.remove('photo-editing'));
    const clones = [...clonedPage.querySelectorAll('img')];
    [...origPage.querySelectorAll('img')].forEach((img, index) => {
      const clone = clones[index];
      if (!clone || !img.naturalWidth || !img.naturalHeight || getComputedStyle(img).display === 'none') return;
      try {
        const photo = img.closest('.consolidado-photo');
        if (photo) {
          const card = photo.closest('.consolidado-card'), photoRect = photo.getBoundingClientRect(), cardRect = card.getBoundingClientRect(), zoom = photoRect.width / photo.offsetWidth;
          if (!zoom) return;
          const boxW = Math.round(photoRect.width), boxH = Math.round(photoRect.height), scale = Math.min(photo.offsetWidth / img.naturalWidth, photo.offsetHeight / img.naturalHeight) * zoom;
          clone.src = draw(img, boxW, boxH, scale, exportScale);
          const box = clone.parentElement; box.style.cssText += ';transform:none;overflow:visible;margin:0;right:auto;bottom:auto;left:' + (photoRect.left - cardRect.left) + 'px;top:' + (photoRect.top - cardRect.top) + 'px;width:' + boxW + 'px;height:' + boxH + 'px';
        } else if (getComputedStyle(img).objectFit === 'contain') {
          const boxW = img.offsetWidth, boxH = img.offsetHeight; if (!boxW || !boxH) return;
          clone.src = draw(img, boxW, boxH, Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight), exportScale);
          clone.style.width = boxW + 'px'; clone.style.height = boxH + 'px'; // mantém o tamanho que o elemento já tinha (não 100% do pai)
        } else return;
        clone.style.objectFit = 'fill'; clone.style.maxWidth = 'none'; clone.style.maxHeight = 'none';
        if (photo) { clone.style.width = '100%'; clone.style.height = '100%'; }
      } catch (error) { /* canvas contaminado (CORS): deixa o html2canvas renderizar a imagem sozinho em vez de travar a exportação */ }
    });
  }

  global.ConsolidadoExport = { bakeImages };
})(window);
