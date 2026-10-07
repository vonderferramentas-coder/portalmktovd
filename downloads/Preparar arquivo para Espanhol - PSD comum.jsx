#target photoshop
/* Preparar para Espanhol — revisão 10. Mantém original e resultado abertos. */
(function () {
    var SUFIXO = " - ESPANHOL";
    var NOME_GRUPO = "TEXTOS EDITÁVEIS";
    var NOME_FUNDO = "FUNDO RENDERIZADO — NÃO EDITAR";

    function falhar(m) { throw new Error(m); }
    function afirmar(c, m) { if (!c) { falhar(m); } }
    function nomeSaida(n) { return n.replace(/\.[^\.]+$/, "") + SUFIXO + ".psd"; }

    function autoTeste() {
        afirmar(nomeSaida("arte.psd") === "arte - ESPANHOL.psd", "Falha no nome de saída.");
        afirmar(nomeSaida("arte.v1.psd") === "arte.v1 - ESPANHOL.psd", "Falha em nome com ponto.");
    }

    function analisarVisiveis(container, resultado, paiVisivel) {
        var i, camada, visivel;
        for (i = 0; i < container.layers.length; i++) {
            camada = container.layers[i];
            visivel = paiVisivel && camada.visible;
            if (camada.typename === "ArtLayer" && visivel) {
                if (camada.kind === LayerKind.TEXT) { resultado.textos.push(camada); }
                else { resultado.fundos++; }
            } else if (camada.typename === "LayerSet" && visivel) {
                analisarVisiveis(camada, resultado, visivel);
            }
        }
    }

    function coletarPranchetas(documento, resultado) {
        var i, camada;
        for (i = 0; i < documento.layers.length; i++) {
            camada = documento.layers[i];
            if (camada.typename === "LayerSet" && camada.artboardEnabled) { resultado.push(camada); }
        }
    }

    function jaPreparado(documento) {
        var i, temGrupo = false, temFundo = false;
        for (i = 0; i < documento.layers.length; i++) {
            temGrupo = temGrupo || documento.layers[i].name === NOME_GRUPO;
            temFundo = temFundo || documento.layers[i].name === NOME_FUNDO;
        }
        return temGrupo && temFundo;
    }

    function validarResultado(trabalho, grupo, fundo, quantidadeTextos) {
        var i;
        afirmar(trabalho.layers.length === 2,
            "O arquivo final não ficou com apenas textos e fundo.");
        afirmar(grupo.layers.length === quantidadeTextos,
            "A quantidade de textos no resultado ficou diferente do original.");
        for (i = 0; i < grupo.layers.length; i++) {
            afirmar(grupo.layers[i].typename === "ArtLayer" && grupo.layers[i].kind === LayerKind.TEXT,
                "O grupo de textos contém uma camada que não é texto editável.");
        }
        afirmar(fundo.typename === "ArtLayer" && fundo.kind !== LayerKind.TEXT,
            "O fundo não foi consolidado corretamente.");
    }

    function preparar(documento, destino) {
        var trabalho = documento.duplicate(), analise = { textos: [], fundos: 0 }, pranchetas = [];
        var i, antes, camada, grupo, copia, fundo, apoio, idGrupo, idFundo, concluido = false;
        try {
            app.activeDocument = trabalho;
            analisarVisiveis(trabalho, analise, true);
            afirmar(analise.textos.length > 0, "Nenhuma camada de texto visível foi encontrada neste PSD.");
            afirmar(analise.fundos > 0, "Nenhum conteúdo de fundo visível foi encontrado neste PSD.");

            grupo = trabalho.layerSets.add();
            grupo.name = NOME_GRUPO;
            grupo.move(trabalho, ElementPlacement.PLACEATBEGINNING);
            for (i = 0; i < analise.textos.length; i++) {
                copia = analise.textos[i].duplicate();
                copia.name = analise.textos[i].name;
                copia.move(grupo, ElementPlacement.INSIDE);
                copia.visible = true;
                analise.textos[i].visible = false;
            }
            grupo.visible = false;

            coletarPranchetas(trabalho, pranchetas);
            while (pranchetas.length > 0) {
                antes = pranchetas.length;
                pranchetas[antes - 1].merge();
                trabalho.activeLayer.move(trabalho, ElementPlacement.PLACEATEND);
                pranchetas = [];
                coletarPranchetas(trabalho, pranchetas);
                afirmar(pranchetas.length < antes, "Não foi possível consolidar uma das pranchetas.");
            }

            apoio = trabalho.artLayers.add();
            apoio.name = "APOIO TEMPORÁRIO";
            trabalho.mergeVisibleLayers();
            fundo = trabalho.activeLayer;
            fundo.name = NOME_FUNDO;
            fundo.move(trabalho, ElementPlacement.PLACEATEND);

            idGrupo = grupo.id;
            idFundo = fundo.id;
            for (i = trabalho.layers.length - 1; i >= 0; i--) {
                camada = trabalho.layers[i];
                if (camada.id !== idGrupo && camada.id !== idFundo) { camada.remove(); }
            }

            grupo.visible = true;
            grupo.move(trabalho, ElementPlacement.PLACEATBEGINNING);
            validarResultado(trabalho, grupo, fundo, analise.textos.length);
            trabalho.saveAs(
                new File(destino.fsName + "/" + nomeSaida(documento.name)),
                new PhotoshopSaveOptions(), false, Extension.LOWERCASE
            );
            concluido = true;
            app.activeDocument = trabalho;
            return analise.textos.length;
        } catch (erro) {
            if (!concluido) {
                try { trabalho.close(SaveOptions.DONOTSAVECHANGES); } catch (erroFechamento) {}
                try { app.activeDocument = documento; } catch (erroDocumento) {}
            }
            throw erro;
        }
    }

    try {
        autoTeste();
        afirmar(app.documents.length > 0, "Abra um PSD antes de executar este script.");
        var original = app.activeDocument;
        afirmar(!jaPreparado(original), "Este PSD já parece ter sido preparado para Espanhol.");
        var pasta = Folder.selectDialog("Escolha a pasta onde salvar o PSD preparado");
        if (!pasta) { return; }
        var quantidade = preparar(original, pasta);
        alert("Pronto. O original não foi alterado.\n\nCriado e mantido aberto: " +
            nomeSaida(original.name) + "\nTextos editáveis: " + quantidade);
    } catch (erro) {
        alert("Não foi possível preparar o arquivo.\n\n" + erro.message);
    }
}());
