import csv from "csv-reader";
import { createReadStream, createWriteStream } from "fs";
import { CSV } from "../../models/csv";
import { promisify } from "util";
import { pipeline } from "stream";
import ftp from "promise-ftp";
import * as config from "../../config/database.json";
import { Database } from "../../database";
import { Dado, Resumo, ResumoMunicipio } from "../../models/resultado";
import { HTTP400Error } from "../../utils/httpErrors";
const streamPipeline = promisify(pipeline);

const filePath = "./dados.csv";

async function download() {
    const ftpClient = new ftp();
    console.log("Conectando...");
    await ftpClient.connect({
        host: "ftp2.ciasc.gov.br",
        user: "boavista",
        password: "dados_abertos",
    });
    console.log("Conectado!");
    console.log("Efetuando download do arquivo");
    const stream = await ftpClient.get("boavista_covid_dados_abertos.csv");
    console.log("Arquivo baixado com sucesso!");
    console.log("Gravando arquivo...");
    await streamPipeline(stream, createWriteStream(filePath));
    console.log("Arquivo gravado com sucesso!");
    await ftpClient.end();
    console.log("Encerrado");
}

async function readCsvFile(path: string): Promise<CSV[]> {
    return new Promise((resolve, reject) => {
        const results: any[] = [];
        createReadStream(path, "utf8")
            .pipe(csv({ delimiter: ";", asObject: true, parseNumbers: true, trim: true }))
            .on("data", (data) => results.push(data))
            .on("end", () => resolve(results))
            .on("error", (e) => reject(e));
    });
}

function normalizarDados(dados: CSV[]): Dado[] {
    return dados.map(
        (dado) =>
            ({
                publicacao:
                    dado.data_publicacao && Date.parse(dado.data_publicacao) > 0
                        ? new Date(dado.data_publicacao)
                        : null,
                recuperado: dado.recuperados === "SIM",
                inicioSintomas:
                    dado.data_inicio_sintomas && Date.parse(dado.data_inicio_sintomas) > 0
                        ? new Date(dado.data_inicio_sintomas)
                        : null,
                coleta: dado.data_coleta && Date.parse(dado.data_coleta) > 0 ? new Date(dado.data_coleta) : null,
                sintomas: dado.sintomas,
                comorbidades: dado.comorbidades,
                internado: dado.internacao === "INTERNADO",
                internadoUti: dado.internacao_uti === "INTERNADO UTI",
                sexo: dado.sexo,
                municipio: dado.municipio,
                obito: dado.obito === "SIM",
                dataObito: dado.data_obito && Date.parse(dado.data_obito) ? new Date(dado.data_obito) : null,
                idade: Number(dado.idade),
                dataResultado:
                    dado.data_resultado && Date.parse(dado.data_resultado) > 0 ? new Date(dado.data_resultado) : null,
                codigoIbge: isNaN(Number(dado.codigo_ibge_municipio)) ? 9999999 : Number(dado.codigo_ibge_municipio),
                latitude: Number(dado.latitude),
                longitude: Number(dado.longitude),
                criterioConfirmacao: dado.criterio_confirmacao,
                tipoTeste: dado.tipo_teste,
                municipioNotificacao: dado.municipio_notificacao,
                origemEsus: dado.origem_esus === "SIM",
                origemSivep: dado.origem_sivep === "SIM",
                origemLacen: dado.origem_lacen === "SIM",
                origemLaboratorioPrivado: dado.origem_laboratorio_privado === "SIM",
                nomeLaboratorio: dado.nom_laboratorio === "NULL" ? null : dado.nom_laboratorio,
                testeRapido: dado.fez_teste_rapido === "SIM",
                pcr: dado.fez_pcr === "SIM",
                dataInternacao:
                    dado.data_internacao && Date.parse(dado.data_internacao) > 0
                        ? new Date(dado.data_internacao)
                        : null,
                dataEntradaUti:
                    dado.data_entrada_uti && Date.parse(dado.data_entrada_uti) > 0
                        ? new Date(dado.data_entrada_uti)
                        : null,
                regionalSaude: dado.regional_saude,
                dataEvolucaoCaso:
                    dado.data_evolucao_caso && Date.parse(dado.data_evolucao_caso) > 0
                        ? new Date(dado.data_evolucao_caso)
                        : null,
                dataSaidaUti:
                    dado.data_saida_uti && Date.parse(dado.data_saida_uti) > 0 ? new Date(dado.data_saida_uti) : null,
                bairro: dado.bairro,
            } as Dado),
    );
}

export async function importarDados(): Promise<any> {
    await download();
    const dadosNormalizados = normalizarDados(await readCsvFile(filePath));
    if (!dadosNormalizados) {
        throw new HTTP400Error("Dados do SES/SC não estão íntegros!");
    }
    const municipios = Array.from(new Set(dadosNormalizados.map((d) => d.codigoIbge)));
    const dados: ResumoMunicipio[] = municipios.map((codigoIbge) => {
        const dadosMunicipio = dadosNormalizados.filter((d) => d.codigoIbge === codigoIbge);
        return {
            nome: dadosMunicipio[0].municipio,
            codigoIbge,
            casos: dadosMunicipio.length,
            recuperados: dadosMunicipio.filter((d) => d.recuperado).length,
            internados: dadosMunicipio.filter((d) => d.internado).length,
            internadosUti: dadosMunicipio.filter((d) => d.internadoUti).length,
            obitos: dadosMunicipio.filter((d) => d.obito).length,
            dados: dadosMunicipio,
        } as ResumoMunicipio;
    });
    const resumo: Resumo = {
        publicacao: dadosNormalizados[0].publicacao,
        internados: dados.reduce((soma, dado) => soma + dado.internados, 0),
        internadosUti: dados.reduce((soma, dado) => soma + dado.internadosUti, 0),
        recuperados: dados.reduce((soma, dado) => soma + dado.recuperados, 0),
        obitos: dados.reduce((soma, dado) => soma + dado.obitos, 0),
        casos: dados.reduce((soma, dado) => soma + dado.casos, 0),
    };
    const dadosBanco = await Database.findOne(config.collections.resumo, { publicacao: resumo.publicacao });
    if (!dadosBanco) {
        console.log("Salvando no banco de dados...");
        const retorno = await Database.save(config.collections.resumo, resumo);
        if (!retorno.insertedId) {
            throw new HTTP400Error();
        }
        for (const dado of dados) {
            console.log(`Salvando ${dado.nome}`);
            await Database.save(config.collections.municipios, {
                resumo: retorno.insertedId,
                ...dado,
            });
        }
        console.log("Finalizado!");
        return resumo;
    }
    console.log("Não salvo no banco de dados!");
    return {};
}
