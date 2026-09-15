#target photoshop
/* Cria um PSD aberto por prancheta: fundo renderizado + textos editáveis. */
(function () {
    var SUFIXO = " - ESPANHOL";
    function falhar(m) { throw new Error(m); }
    function afirmar(c, m) { if (!c) { falhar(m); } }
    function limparNome(n) {
        var proibidos = "\\\\/:*?\"<>|", r = "", i, c;
        for (i = 0; i < n.length; i++) { c = n.charAt(i); r += proibidos.indexOf(c) >= 0 ? "-" : c; }
        return r;
    }
    function nomeSaida(nome, prancheta) {
        var p = nome.lastIndexOf(".");
        return (p > 0 ? nome.substring(0, p) : nome) + " - " + limparNome(prancheta) + SUFIXO + ".psd";
    }
    function autoTeste() { afirmar(nomeSaida("post.psb", "Feed") === "post - Feed - ESPANHOL.psd", "Falha no nome de saída."); }
    function dadosPrancheta(camada) {
        var s2t = stringIDToTypeID, ref = new ActionReference(), d, a, r;
        try {
            ref.putProperty(s2t("property"), s2t("artboardEnabled")); ref.putIdentifier(s2t("layer"), camada.id);
            if (!executeActionGet(ref).getBoolean(s2t("artboardEnabled"))) { return null; }
            ref = new ActionReference(); ref.putProperty(s2t("property"), s2t("artboard")); ref.putIdentifier(s2t("layer"), camada.id);
            a = executeActionGet(ref).getObjectValue(s2t("artboard")); r = a.getObjectValue(s2t("artboardRect"));
            return { nome: camada.name, esquerda: r.getDouble(s2t("left")), topo: r.getDouble(s2t("top")), direita: r.getDouble(s2t("right")), baixo: r.getDouble(s2t("bottom")), textos: [] };
        } catch (erro) { return null; }
    }
    function coletarTextos(container, resultado) {
        var i, camada;
        for (i = 0; i < container.layers.length; i++) {
            camada = container.layers[i];
            if (camada.typename === "ArtLayer" && camada.kind === LayerKind.TEXT) { resultado.push(camada); }
            else if (camada.typename === "LayerSet") { coletarTextos(camada, resultado); }
        }
    }
    function listarPranchetas(doc) {
        var i, dados, lista = [];
        for (i = 0; i < doc.layerSets.length; i++) {
            dados = dadosPrancheta(doc.layerSets[i]);
            if (dados) { coletarTextos(doc.layerSets[i], dados.textos); lista.push(dados); }
        }
        return lista;
    }
    function ocultarTextos(container) {
        var i, camada;
        for (i = 0; i < container.layers.length; i++) {
            camada = container.layers[i];
            if (camada.typename === "ArtLayer" && camada.kind === LayerKind.TEXT) { camada.visible = false; }
            else if (camada.typename === "LayerSet") { ocultarTextos(camada); }
        }
    }
    function criarArquivo(original, trabalho, dados, pasta) {
        var largura = dados.direita - dados.esquerda, altura = dados.baixo - dados.topo;
        var novo, fundo, grupo, i, texto, arquivo;
        app.activeDocument = trabalho;
        trabalho.selection.select([[dados.esquerda, dados.topo], [dados.direita, dados.topo], [dados.direita, dados.baixo], [dados.esquerda, dados.baixo]]);
        trabalho.selection.copy(true); trabalho.selection.deselect();
        novo = app.documents.add(UnitValue(largura, "px"), UnitValue(altura, "px"), original.resolution, dados.nome + SUFIXO, NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
        novo.paste(); fundo = novo.activeLayer; fundo.name = "FUNDO RENDERIZADO — NÃO EDITAR"; fundo.move(novo, ElementPlacement.PLACEATEND);
        grupo = novo.layerSets.add(); grupo.name = "TEXTOS EDITÁVEIS";
        for (i = dados.textos.length - 1; i >= 0; i--) {
            app.activeDocument = original;
            dados.textos[i].duplicate(novo, ElementPlacement.PLACEATBEGINNING);
            app.activeDocument = novo;
            texto = novo.activeLayer;
            // O Photoshop já converte a posição ao duplicar entre documentos; não translade novamente.
            texto.move(grupo, ElementPlacement.PLACEATBEGINNING);
        }
        grupo.move(novo, ElementPlacement.PLACEATBEGINNING);
        arquivo = new File(pasta.fsName + "/" + nomeSaida(original.name, dados.nome));
        novo.saveAs(arquivo, new PhotoshopSaveOptions(), false, Extension.LOWERCASE);
        // Mantém o novo PSD aberto para revisão imediata.
        return dados.textos.length;
    }
    try {
        autoTeste();
        if (app.documents.length === 0) { falhar("Abra um PSD com pranchetas antes de executar o script."); }
        var original = app.activeDocument, pranchetas = listarPranchetas(original), pasta, trabalho, i, total = 0;
        if (pranchetas.length === 0) { falhar("Este arquivo não contém pranchetas."); }
        pasta = Folder.selectDialog("Escolha a pasta onde salvar os PSDs preparados");
        if (!pasta) { return; }
        trabalho = original.duplicate(); app.activeDocument = trabalho; ocultarTextos(trabalho);
        for (i = 0; i < pranchetas.length; i++) { total += criarArquivo(original, trabalho, pranchetas[i], pasta); }
        app.activeDocument = trabalho; trabalho.close(SaveOptions.DONOTSAVECHANGES); app.activeDocument = original;
        alert("Pronto. O original não foi alterado.\n\nPSDs criados: " + pranchetas.length + "\nTextos editáveis: " + total + "\nOs PSDs gerados ficaram abertos.");
    } catch (erro) { alert("Não foi possível separar as pranchetas.\n\n" + erro.message); }
}());
