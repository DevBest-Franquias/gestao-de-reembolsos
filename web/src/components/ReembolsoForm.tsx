import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { api, abrirAnexo, CATEGORIAS_ANEXO, MEIOS_PAGAMENTO, type MeioPagamento, abrirComprovanteCartaoReembolso, enviarAnexos, CENTRO_CUSTO_N5, EMPRESA_PAGADORA, type Anexo, type Reembolso, type Solicitante, type Usuario } from '../api';
import { documentoValido, formatarData, mascaraDocumento, proximaTercaOuQuinta, tamanhoArquivo } from '../formato';
import { CampoMoeda, Dica, avisar, msgErro } from './ui';

/** Valor do campo Cartão que significa "manter o cartão já registrado" */
const ATUAL = 'atual';

const DICA_ANEXO = 'Nota fiscal / boleto / chave pix / outros (podem ser enviados vários arquivos separados)';

/** Área de anexos de um tipo: arquivos já enviados e novos a enviar */
function CampoAnexos({ titulo, dica, existentes, novos, setNovos, aoRemover }: {
  titulo: string;
  dica: string;
  existentes: Anexo[];
  novos: File[];
  setNovos: Dispatch<SetStateAction<File[]>>;
  aoRemover: (a: Anexo) => void;
}) {
  return (
    <fieldset className="grupo">
      <legend>
        {titulo} <Dica texto={dica} />
      </legend>
      {existentes.length > 0 && (
        <ul className="anexos-lista">
          {existentes.map((a) => (
            <li key={a.id}>
              <button type="button" className="link" onClick={() => abrirAnexo(a.id).catch((e) => avisar(msgErro(e), 'erro'))}>{a.nome_arquivo}</button>
              <span className="mudo pequeno">{tamanhoArquivo(a.tamanho)}</span>
              <button type="button" className="icone-btn" aria-label={`Excluir ${a.nome_arquivo}`} onClick={() => aoRemover(a)}>×</button>
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
            setNovos((l) => [...l, ...fs]);
            e.target.value = '';
          }}
        />
        <span><strong>Escolher arquivos</strong> ou arraste aqui. Até 20 MB cada.</span>
      </label>
      {novos.length > 0 && (
        <ul className="anexos-lista">
          {novos.map((f, i) => (
            <li key={i}>
              <span>{f.name}</span>
              <span className="mudo pequeno">{tamanhoArquivo(f.size)}</span>
              <button type="button" className="icone-btn" aria-label={`Remover ${f.name}`} onClick={() => setNovos((l) => l.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

type Props = {
  eu: Usuario;
  inicial: Reembolso | null;
  solicitantes: Solicitante[];
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

/** Acha o solicitante do usuário logado: primeiro pelo e-mail, depois pelo nome */
function solicitanteDoUsuario(eu: Usuario, solicitantes: Solicitante[]) {
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    solicitantes.find((s) => s.email.trim().toLowerCase() === eu.email.trim().toLowerCase()) ??
    solicitantes.find((s) => norm(s.nome) === norm(eu.nome))
  );
}

export default function ReembolsoForm({ eu, inicial, solicitantes, aoSalvar, aoCancelar }: Props) {
  const editando = !!inicial;
  const meu = solicitanteDoUsuario(eu, solicitantes);
  const [solicitanteId, setSolicitanteId] = useState(
    inicial ? (inicial.solicitante_id ? String(inicial.solicitante_id) : '') : meu ? String(meu.id) : '',
  );
  const [valor, setValor] = useState(inicial?.valor_centavos ?? 0);
  const [cartaoId, setCartaoId] = useState(inicial?.cartao_final ? ATUAL : '');
  const [vencimento, setVencimento] = useState(inicial?.data_pagamento ?? '');
  const [meio, setMeio] = useState<MeioPagamento | ''>(inicial?.meio_pagamento ?? '');
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [anexos, setAnexos] = useState<Anexo[]>(inicial?.anexos ?? []);
  const [novosDocumento, setNovosDocumento] = useState<File[]>([]);
  const [novosCobranca, setNovosCobranca] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  const s = solicitantes.find((x) => String(x.id) === solicitanteId);
  // Só pede o cartão quando o solicitante tem mais de um; com um só, a API usa ele sozinha
  const cartoesSol = s?.cartoes ?? [];

  // Na edição, ao trocar o solicitante, os dados passam a vir do cadastro do novo
  const solicitanteOriginal = inicial?.solicitante_id ? String(inicial.solicitante_id) : '';
  const trocou = !!inicial && solicitanteId !== solicitanteOriginal;

  // Na edição, mostra o que foi registrado; numa nova solicitação, o que vem do cadastro
  const dados = inicial && !trocou
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
        numeroDoc: inicial?.numero_documento ?? '0',
        vencimento: inicial?.data_pagamento ?? proximaTercaOuQuinta(),
        chavePix: s?.chave_pix ?? '',
        banco: s?.banco ?? '',
        agencia: s?.agencia ?? '',
        conta: s?.conta ?? '',
        empresa: inicial?.empresa_pagadora || EMPRESA_PAGADORA,
        multiplos: 'Não',
        centro: inicial?.centro_custo || CENTRO_CUSTO_N5,
      };

  const faltas = (!editando || trocou) && s ? faltasCadastro(s) : [];

  const trocarSolicitanteEdicao = (id: string) => {
    setSolicitanteId(id);
    const novo = solicitantes.find((x) => String(x.id) === id);
    const cartoes = novo?.cartoes ?? [];
    if (id === solicitanteOriginal) setCartaoId(inicial?.cartao_final ? ATUAL : '');
    else setCartaoId(cartoes.length === 1 ? String(cartoes[0].id) : '');
  };

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
    if (!meio) return avisar('Informe como foi feito o pagamento.', 'erro');
    if (meio === 'cartao' && !inicial && cartoesSol.length === 0) return avisar('Esse solicitante não tem cartão cadastrado. Cadastre em Solicitantes ou escolha PIX.', 'erro');
    if (meio === 'cartao' && !inicial && cartoesSol.length > 1 && !cartaoId) return avisar('Escolha o cartão usado no pagamento.', 'erro');
    if (meio === 'cartao' && inicial && !cartaoId) return avisar('Escolha o cartão usado no pagamento.', 'erro');
    if (inicial && !vencimento) return avisar('Informe a data de vencimento.', 'erro');
    if (inicial && trocou && !s) return avisar('Escolha o solicitante.', 'erro');

    setSalvando(true);
    try {
      const r = await api<Reembolso>(inicial ? `/reembolsos/${inicial.id}` : '/reembolsos', {
        method: inicial ? 'PUT' : 'POST',
        json: inicial
          ? {
              valor_centavos: valor,
              descricao,
              data_pagamento: vencimento,
              meio_pagamento: meio,
              solicitante_id: trocou ? Number(solicitanteId) : undefined,
              cartao_id: cartaoId === ATUAL ? undefined : cartaoId ? Number(cartaoId) : null,
            }
          : { solicitante_id: Number(solicitanteId), valor_centavos: valor, descricao, meio_pagamento: meio, cartao_id: meio === 'cartao' && cartaoId ? Number(cartaoId) : null },
      });
      if (novosDocumento.length) await enviarAnexos(r.id, novosDocumento, 'documento');
      if (novosCobranca.length) await enviarAnexos(r.id, novosCobranca, 'cobranca');
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
      {!inicial ? (
        // Nova solicitação: só o que pode ser preenchido. O resto é gravado pela API a partir do cadastro.
        <fieldset className="grupo">
          <legend>Solicitação</legend>
          <div className="grade grade-2">
            <label className="campo coluna-2">
              <span>Nome do solicitante</span>
              <select value={solicitanteId} onChange={(e) => { setSolicitanteId(e.target.value); setCartaoId(''); }} required>
                <option value="">Selecione</option>
                {solicitantes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Valor do pagamento</span>
              <CampoMoeda centavos={valor} aoMudar={setValor} />
            </label>
            <label className="campo">
              <span>Como foi feito o pagamento</span>
              <select value={meio} onChange={(e) => setMeio(e.target.value as MeioPagamento | '')} required>
                <option value="">Selecione</option>
                {Object.entries(MEIOS_PAGAMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </label>
            {meio === 'cartao' && cartoesSol.length > 1 && (
              <label className="campo">
                <span>Cartão</span>
                <select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)} required>
                  <option value="">Selecione o cartão</option>
                  {cartoesSol.map((k) => <option key={k.id} value={k.id}>Final {k.final}</option>)}
                </select>
              </label>
            )}
            <label className="campo coluna-2">
              <span>Descrição do pagamento</span>
              <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} autoFocus={!!meu} />
            </label>
          </div>
          {!inicial && !meu && (
            <p className="nota" style={{ margin: '12px 0 0' }}>
              Seu usuário ainda não está ligado a um solicitante. Cadastre-se em <a href="#solicitantes">Solicitantes</a> com o mesmo e-mail do login (<strong>{eu.email}</strong>) para seus dados virem preenchidos.
            </p>
          )}
          {!inicial && meu && String(meu.id) !== solicitanteId && solicitanteId && (
            <p className="mudo pequeno" style={{ margin: '10px 0 0' }}>
              Você está registrando em nome de outra pessoa. <button type="button" className="link" onClick={() => setSolicitanteId(String(meu.id))}>Voltar para {meu.nome}</button>
            </p>
          )}
          {meio === 'cartao' && s && cartoesSol.length === 0 && (
            <p className="nota nota-alerta" style={{ margin: '12px 0 0' }}>
              <strong>{s.nome}</strong> não tem cartão cadastrado. Cadastre em <a href="#solicitantes">Solicitantes</a> ou escolha PIX.
            </p>
          )}
          {faltas.length > 0 && (
            <p className="nota nota-alerta" style={{ margin: '12px 0 0' }}>
              O cadastro de <strong>{s!.nome}</strong> está incompleto. Falta: {faltas.join(', ')}. Complete em <a href="#solicitantes">Solicitantes</a> para registrar o reembolso.
            </p>
          )}
        </fieldset>
      ) : (
        <>
        <fieldset className="grupo">
          <legend>Solicitante</legend>
          <div className="grade grade-2">
            <label className="campo">
              <span>Nome do solicitante</span>
              <select value={solicitanteId} onChange={(e) => trocarSolicitanteEdicao(e.target.value)} required={!!solicitanteOriginal}>
                {!solicitanteOriginal && <option value="">{inicial.solicitante_nome} (sem cadastro)</option>}
                {solicitantes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <Fixo rotulo="E-mail do solicitante" valor={dados.email} vazio="Preenchido ao escolher" />
          </div>
          {trocou && s && faltas.length === 0 && (
            <p className="mudo pequeno" style={{ margin: '10px 0 0' }}>Ao salvar, e-mail, CPF, fornecedor e dados bancários passam a ser os de {s.nome}.</p>
          )}
          {faltas.length > 0 && (
            <p className="nota nota-alerta" style={{ margin: '12px 0 0' }}>
              O cadastro de <strong>{s!.nome}</strong> está incompleto. Falta: {faltas.join(', ')}. Complete em <a href="#solicitantes">Solicitantes</a> para usar esse solicitante.
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
            <label className="campo">
              <span>Data de vencimento</span>
              <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
            </label>
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
            <label className="campo">
              <span>Como foi feito o pagamento</span>
              <select
                value={meio}
                onChange={(e) => {
                  const v = e.target.value as MeioPagamento | '';
                  setMeio(v);
                  // Voltando para cartão sem cartão escolhido: usa o registrado ou o único do cadastro
                  if (v === 'cartao' && !cartaoId) {
                    if (!trocou && inicial.cartao_final) setCartaoId(ATUAL);
                    else if (cartoesSol.length === 1) setCartaoId(String(cartoesSol[0].id));
                  }
                }}
                required
              >
                <option value="">Selecione</option>
                {Object.entries(MEIOS_PAGAMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </label>
            {meio === 'cartao' && (
            <>
            <label className="campo">
              <span>Cartão</span>
              <select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
                <option value="">Selecione o cartão</option>
                {!trocou && inicial.cartao_final && <option value={ATUAL}>Final {inicial.cartao_final} (registrado)</option>}
                {cartoesSol
                  .filter((k) => trocou || k.id !== inicial.cartao_id)
                  .map((k) => <option key={k.id} value={k.id}>Final {k.final}</option>)}
              </select>
            </label>
            <div className="campo">
              <span>Comprovante do cartão</span>
              <div className="cartao-registrado">
                {cartaoId === ATUAL && inicial.cartao_comprovante ? (
                  <button type="button" className="link" onClick={() => abrirComprovanteCartaoReembolso(inicial.id).catch((e) => avisar(msgErro(e), 'erro'))}>
                    Abrir comprovante do cartão
                  </button>
                ) : cartaoId === ATUAL || !cartaoId ? (
                  <span className="mudo">{cartaoId ? 'Sem comprovante' : 'Nenhum cartão vinculado'}</span>
                ) : (
                  <span className="mudo">
                    {cartoesSol.find((k) => String(k.id) === cartaoId)?.comprovante ? 'O comprovante desse cartão será copiado ao salvar.' : 'Esse cartão não tem comprovante no cadastro.'}
                  </span>
                )}
              </div>
            </div>
            </>
            )}
          </div>
        </fieldset>

        </>
      )}

      <CampoAnexos
        titulo={CATEGORIAS_ANEXO.documento}
        dica={DICA_ANEXO}
        existentes={anexos.filter((a) => (a.categoria ?? 'documento') === 'documento')}
        novos={novosDocumento}
        setNovos={setNovosDocumento}
        aoRemover={removerAnexo}
      />

      <CampoAnexos
        titulo={CATEGORIAS_ANEXO.cobranca}
        dica="Print da cobrança na fatura do cartão ou comprovante do Pix enviado (podem ser enviados vários arquivos separados)"
        existentes={anexos.filter((a) => a.categoria === 'cobranca')}
        novos={novosCobranca}
        setNovos={setNovosCobranca}
        aoRemover={removerAnexo}
      />

      <div className="form-rodape">
        <button type="button" className="btn btn-fantasma" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario" disabled={salvando || faltas.length > 0}>
          {salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Registrar solicitação'}
        </button>
      </div>
    </form>
  );
}
