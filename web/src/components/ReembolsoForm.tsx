import { useState, type FormEvent } from 'react';
import { api, abrirAnexo, enviarAnexos, CENTRO_CUSTO_N5, EMPRESA_PAGADORA, type Anexo, type Fornecedor, type Reembolso, type Solicitante } from '../api';
import { documentoValido, formatarData, mascaraDocumento, proximaTercaOuQuinta, tamanhoArquivo } from '../formato';
import { CampoMoeda, Dica, avisar, msgErro } from './ui';

const DICA_ANEXO = 'Nota fiscal / boleto / chave pix / outros (podem ser enviados vários arquivos separados)';

type Props = {
  inicial: Reembolso | null;
  solicitantes: Solicitante[];
  fornecedores?: Fornecedor[];
  aoSalvar: () => void;
  aoCancelar: () => void;
};

/** O que falta no cadastro do solicitante para registrar um reembolso */
function faltasCadastro(s: Solicitante) {
  const faltas: string[] = [];
  if (!s.cpf || !documentoValido(s.cpf)) faltas.push('CPF');
  if (!s.chave_pix) faltas.push('chave Pix');
  if (!s.banco) faltas.push('banco');
  if (!s.agencia) faltas.push('agência');
  if (!s.conta) faltas.push('conta');
  return faltas;
}

/** Campo travado: mostra o valor, mas não deixa alterar */
function Fixo({ rotulo, valor, vazio = 'Não informado', classe }: { rotulo: string; valor: string; vazio?: string; classe?: string }) {
  return (
    <label className={`campo ${classe ?? ''}`}>
      <span>{rotulo}</span>
      <input value={valor} placeholder={vazio} readOnly tabIndex={-1} aria-readonly="true" />
    </label>
  );
}

export default function ReembolsoForm({ inicial, solicitantes, aoSalvar, aoCancelar }: Props) {
  const editando = !!inicial;
  const [solicitanteId, setSolicitanteId] = useState(inicial?.solicitante_id ? String(inicial.solicitante_id) : '');
  const [valor, setValor] = useState(inicial?.valor_centavos ?? 0);
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [anexos, setAnexos] = useState<Anexo[]>(inicial?.anexos ?? []);
  const [novosArquivos, setNovosArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  const s = solicitantes.find((x) => String(x.id) === solicitanteId);

  // Na edição, mostra o que foi registrado; numa nova solicitação, o que vem do cadastro
  const dados = inicial
    ? {
        nome: inicial.solicitante_nome,
        email: inicial.solicitante_email,
        fornecedorNovo: inicial.fornecedor_novo ? 'Sim' : 'Não',
        fornecedorNome: inicial.fornecedor_nome,
        fornecedorDoc: inicial.fornecedor_documento,
        numeroDoc: inicial.numero_documento,
        vencimento: inicial.data_pagamento,
        chavePix: inicial.chave_pix,
        banco: inicial.banco,
        agencia: inicial.agencia,
        conta: inicial.conta,
        empresa: inicial.empresa_pagadora,
        multiplos: inicial.multiplos_centros_custo ? 'Sim' : 'Não',
        centro: inicial.centro_custo,
      }
    : {
        nome: s?.nome ?? '',
        email: s?.email ?? '',
        fornecedorNovo: 'Não',
        fornecedorNome: s?.nome ?? '',
        fornecedorDoc: s?.cpf ?? '',
        numeroDoc: '0',
        vencimento: proximaTercaOuQuinta(),
        chavePix: s?.chave_pix ?? '',
        banco: s?.banco ?? '',
        agencia: s?.agencia ?? '',
        conta: s?.conta ?? '',
        empresa: EMPRESA_PAGADORA,
        multiplos: 'Não',
        centro: CENTRO_CUSTO_N5,
      };

  const faltas = !editando && s ? faltasCadastro(s) : [];

  const removerAnexo = async (a: Anexo) => {
    if (!confirm(`Excluir o anexo ${a.nome_arquivo}?`)) return;
    try {
      await api(`/anexos/${a.id}`, { method: 'DELETE' });
      setAnexos((l) => l.filter((x) => x.id !== a.id));
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!inicial && !s) return avisar('Escolha o solicitante.', 'erro');
    if (faltas.length) return avisar('Complete o cadastro do solicitante antes de registrar.', 'erro');
    if (!valor) return avisar('Informe o valor do pagamento.', 'erro');

    setSalvando(true);
    try {
      const r = await api<Reembolso>(inicial ? `/reembolsos/${inicial.id}` : '/reembolsos', {
        method: inicial ? 'PUT' : 'POST',
        json: inicial ? { valor_centavos: valor, descricao } : { solicitante_id: Number(solicitanteId), valor_centavos: valor, descricao },
      });
      if (novosArquivos.length) await enviarAnexos(r.id, novosArquivos);
      avisar(inicial ? 'Solicitação atualizada.' : 'Solicitação registrada.');
      aoSalvar();
    } catch (e) {
      avisar(msgErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form className="form" onSubmit={salvar}>
      <fieldset className="grupo">
        <legend>Solicitante</legend>
        <div className="grade grade-2">
          {inicial ? (
            <Fixo rotulo="Nome do solicitante" valor={dados.nome} />
          ) : (
            <label className="campo">
              <span>Nome do solicitante</span>
              <select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)} required autoFocus>
                <option value="">Selecione</option>
                {solicitantes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
          )}
          <Fixo rotulo="E-mail do solicitante" valor={dados.email} vazio="Preenchido ao escolher" />
        </div>
        {faltas.length > 0 && (
          <p className="nota nota-alerta" style={{ margin: '12px 0 0' }}>
            O cadastro de <strong>{s!.nome}</strong> está incompleto. Falta: {faltas.join(', ')}. Complete em <a href="#solicitantes">Solicitantes</a> para registrar o reembolso.
          </p>
        )}
      </fieldset>

      <fieldset className="grupo">
        <legend>Fornecedor</legend>
        <div className="grade grade-3">
          <Fixo rotulo="Fornecedor novo" valor={dados.fornecedorNovo} />
          <Fixo rotulo="Nome / Razão social" valor={dados.fornecedorNome} vazio="Nome do solicitante" />
          <Fixo rotulo="CNPJ / CPF" valor={dados.fornecedorDoc ? mascaraDocumento(dados.fornecedorDoc) : ''} vazio="CPF do solicitante" />
        </div>
      </fieldset>

      <fieldset className="grupo">
        <legend>Pagamento</legend>
        <div className="grade grade-3">
          <Fixo rotulo="Número do documento" valor={dados.numeroDoc} />
          <Fixo rotulo="Data de vencimento" valor={formatarData(dados.vencimento)} />
          <label className="campo">
            <span>Valor do pagamento</span>
            <CampoMoeda centavos={valor} aoMudar={setValor} />
          </label>
          <label className="campo coluna-3">
            <span>Descrição do pagamento</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
          </label>
          <Fixo rotulo="Forma de pagamento" valor="Pix" />
          <Fixo rotulo="Chave PIX" valor={dados.chavePix} vazio="Do cadastro do solicitante" classe="coluna-2" />
          <Fixo rotulo="Banco" valor={dados.banco} vazio="Do cadastro do solicitante" />
          <Fixo rotulo="Agência" valor={dados.agencia} vazio="Do cadastro do solicitante" />
          <Fixo rotulo="Conta" valor={dados.conta} vazio="Do cadastro do solicitante" />
          <Fixo rotulo="Empresa pagadora" valor={dados.empresa} classe="coluna-3" />
          <Fixo rotulo="O custo deverá ser atrelado a mais de um centro de custo?" valor={dados.multiplos} classe="coluna-2" />
          <Fixo rotulo="Centro de custo - N5" valor={dados.centro} />
        </div>
        {!inicial && <p className="mudo pequeno" style={{ margin: '10px 0 0' }}>A data de vencimento é sempre a próxima terça ou quinta-feira a partir de hoje.</p>}
      </fieldset>

      <fieldset className="grupo">
        <legend>
          Anexo da solicitação <Dica texto={DICA_ANEXO} />
        </legend>
        {anexos.length > 0 && (
          <ul className="anexos-lista">
            {anexos.map((a) => (
              <li key={a.id}>
                <button type="button" className="link" onClick={() => abrirAnexo(a.id).catch((e) => avisar(msgErro(e), 'erro'))}>{a.nome_arquivo}</button>
                <span className="mudo pequeno">{tamanhoArquivo(a.tamanho)}</span>
                <button type="button" className="icone-btn" aria-label={`Excluir ${a.nome_arquivo}`} onClick={() => removerAnexo(a)}>×</button>
              </li>
            ))}
          </ul>
        )}
        <label className="soltar">
          <input
            type="file"
            multiple
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              setNovosArquivos((l) => [...l, ...fs]);
              e.target.value = '';
            }}
          />
          <span><strong>Escolher arquivos</strong> ou arraste aqui. Até 20 MB cada.</span>
        </label>
        {novosArquivos.length > 0 && (
          <ul className="anexos-lista">
            {novosArquivos.map((f, i) => (
              <li key={i}>
                <span>{f.name}</span>
                <span className="mudo pequeno">{tamanhoArquivo(f.size)}</span>
                <button type="button" className="icone-btn" aria-label={`Remover ${f.name}`} onClick={() => setNovosArquivos((l) => l.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="form-rodape">
        <button type="button" className="btn btn-fantasma" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario" disabled={salvando || faltas.length > 0}>
          {salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Registrar solicitação'}
        </button>
      </div>
    </form>
  );
}
