#target photoshop
/* Preparar para Espanhol — revisão 3. O documento original não é alterado. */
(function () {
    var SUFIXO = " - ESPANHOL", NOME_GRUPO = "TEXTOS EDITÁVEIS";
    function falhar(m) { throw new Error(m); }
    function afirmar(c, m) { if (!c) { falhar(m); } }
    function nomeSaida(n) { return n.replace(/\.[^\.]+$/, "") + SUFIXO + ".psd"; }
    function autoTeste() {
        afirmar(nomeSaida("arte.psd") === "arte - ESPANHOL.psd", "Falha no nome de saída.");
        afirmar(nomeSaida("arte.v1.psd") === "arte.v1 - ESPANHOL.psd", "Falha em nome com ponto.");
    }
    function coletarTextos(container, resultado) {
        var i, camada;
        for (i = 0; i < container.layers.length; i++) {
            camada = container.layers[i];
            if (camada.typename === "ArtLayer" && camada.kind === LayerKind.TEXT) { resultado.push(camada); }
            else if (camada.typename === "LayerSet") { coletarTextos(camada, resultado); }
        }
    }
    function coletarPranchetas(documento, resultado) {
        var i, camada;
        for (i = 0; i < documento.layers.length; i++) {
            camada = documento.layers[i];
            if (camada.typename === "LayerSet" && camada.artboardEnabled) { resultado.push(camada); }
        }
    }
    function moverParaFundo(camada, documento) { camada.move(documento, ElementPlacement.PLACEATEND); }
    function preparar(documento, destino) {
        var trabalho = documento.duplicate(), textos = [], copias = [], pranchetas = [];
        var i, grupo, copia, fundo, nomePrancheta;
        app.activeDocument = trabalho;
        coletarTextos(trabalho, textos);
        if (textos.length === 0) {
            trabalho.close(SaveOptions.DONOTSAVECHANGES);
            falhar("Nenhuma camada de texto editável foi encontrada neste PSD.");
        }
        grupo = trabalho.layerSets.add();
        grupo.name = NOME_GRUPO;
        for (i = 0; i < textos.length; i++) {
            copia = textos[i].duplicate();
            copia.move(grupo, ElementPlacement.INSIDE);
            copia.visible = false;
            textos[i].visible = false;
            copias.push(copia);
        }
        coletarPranchetas(trabalho, pranchetas);
        if (pranchetas.length > 0) {
            for (i = pranchetas.length - 1; i >= 0; i--) {
                nomePrancheta = pranchetas[i].name;
                pranchetas[i].merge();
                // Em algumas versões o merge() retorna undefined; activeLayer é sempre o resultado.
                fundo = trabalho.activeLayer;
                fundo.name = "FUNDO RENDERIZADO — " + nomePrancheta;
                moverParaFundo(fundo, trabalho);
            }
        } else {
            trabalho.mergeVisibleLayers();
            fundo = trabalho.activeLayer;
            fundo.name = "FUNDO RENDERIZADO — NÃO EDITAR";
            moverParaFundo(fundo, trabalho);
        }
        for (i = textos.length - 1; i >= 0; i--) { try { textos[i].remove(); } catch (erroRemocao) {} }
        for (i = 0; i < copias.length; i++) { copias[i].visible = true; }
        grupo.visible = true;
        grupo.move(trabalho, ElementPlacement.PLACEATBEGINNING);
        trabalho.saveAs(new File(destino.fsName + "/" + nomeSaida(documento.name)), new PhotoshopSaveOptions(), true, Extension.LOWERCASE);
        trabalho.close(SaveOptions.SAVECHANGES);
        return textos.length;
    }
    try {
        autoTeste();
        if (app.documents.length === 0) { falhar("Abra um PSD antes de executar este script."); }
        var original = app.activeDocument, pasta = Folder.selectDialog("Escolha a pasta onde salvar o PSD preparado");
        if (!pasta) { return; }
        var quantidade = preparar(original, pasta);
        alert("Pronto. O original não foi alterado.\n\nCriado: " + nomeSaida(original.name) + "\nTextos editáveis: " + quantidade);
    } catch (erro) { alert("Não foi possível preparar o arquivo.\n\n" + erro.message); }
}());
