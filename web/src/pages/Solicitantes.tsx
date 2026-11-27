import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, abrirComprovante, enviarComprovante, type Cartao, type Solicitante } from '../api';
import { Modal, avisar, msgErro } from '../components/ui';
import { Icone } from '../components/Icone';
import { Info, LinhaExpansivel } from '../components/Expansivel';
import { TELA, useTelaMinima } from '../telas';
import { documentoValido, mascaraDocumento, soDigitos, tamanhoArquivo } from '../formato';

/** Cartão sendo editado no formulário. As mudanças só vão para a API ao salvar. */
type CartaoForm = {
  chave: string;
  id?: number;
  final: string;
  finalOriginal?: string;
  comprovante: { nome: string; tamanho: number } | null;
  arquivoNovo?: File;
  removerComprovante?: boolean;
};

type Edicao = { id?: number; nome: string; cpf: string; email: string; banco: string; agencia: string; conta: string; chave_pix: string; cartoes: CartaoForm[]; removidos: number[] };

/** Etiqueta curta com o tipo do arquivo, por exemplo PDF, JPG, PNG */
const extensao = (nome: string) => {
  const e = nome.includes('.') ? nome.split('.').pop()!.toUpperCase() : '';
  return e && e.length <= 4 ? e : 'ARQ';
};

let seq = 0;
const novaChave = () => `c${++seq}`;

const paraForm = (k: Cartao): CartaoForm => ({
  chave: novaChave(),
  id: k.id,
  final: k.final,
  finalOriginal: k.final,
  comprovante: k.comprovante,
});

export default function Solicitantes() {
  const [lista, setLista] = useState<Solicitante[]>([]);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const tabela = useTelaMinima(TELA.desktop);

  const carregar = () => api<Solicitante[]>('/solicitantes').then(setLista).catch((e) => avisar(msgErro(e), 'erro'));
  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => setEdicao({ nome: '', cpf: '', email: '', banco: '', agencia: '', conta: '', chave_pix: '', cartoes: [], removidos: [] });
  const abrirEdicao = (s: Solicitante) =>
    setEdicao({ id: s.id, nome: s.nome, cpf: mascaraDocumento(s.cpf ?? ''), email: s.email, banco: s.banco ?? '', agencia: s.agencia ?? '', conta: s.conta ?? '', chave_pix: s.chave_pix ?? '', cartoes: (s.cartoes ?? []).map(paraForm), removidos: [] });

  const mudarCartao = (chave: string, mudanca: Partial<CartaoForm>) =>
    setEdicao((e) => e && { ...e, cartoes: e.cartoes.map((k) => (k.chave === chave ? { ...k, ...mudanca } : k)) });

  const excluirCartao = (k: CartaoForm) =>
    setEdicao((e) => e && {
      ...e,
      cartoes: e.cartoes.filter((x) => x.chave !== k.chave),
      removidos: k.id ? [...e.removidos, k.id] : e.removidos,
    });

  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!edicao) return;
    if (edicao.nome.trim().split(/\s+/).length < 2) return avisar('Informe o nome completo (nome e sobrenome).', 'erro');
    if (soDigitos(edicao.cpf).length !== 11 || !documentoValido(edicao.cpf)) return avisar('CPF inválido.', 'erro');
    const invalido = edicao.cartoes.find((k) => !/^\d{4}$/.test(k.final));
    if (invalido) return avisar('Informe os 4 últimos dígitos de cada cartão.', 'erro');

    setSalvando(true);
    try {
      const dados = {
        nome: edicao.nome, cpf: edicao.cpf, email: edicao.email,
        banco: edicao.banco, agencia: edicao.agencia, conta: edicao.conta, chave_pix: edicao.chave_pix,
      };
      const s = await api<Solicitante>(edicao.id ? `/solicitantes/${edicao.id}` : '/solicitantes', {
        method: edicao.id ? 'PUT' : 'POST',
        json: dados,
      });

      for (const id of edicao.removidos) await api(`/cartoes/${id}`, { method: 'DELETE' });

      for (const k of edicao.cartoes) {
        let id = k.id;
        if (!id) {
          const novo = await api<Cartao>(`/solicitantes/${s.id}/cartoes`, { method: 'POST', json: { final: k.final } });
          id = novo.id;
        } else if (k.final !== k.finalOriginal) {
          await api(`/cartoes/${id}`, { method: 'PUT', json: { final: k.final } });
        }
        if (k.arquivoNovo) await enviarComprovante(id, k.arquivoNovo);
        else if (k.removerComprovante) await api(`/cartoes/${id}/comprovante`, { method: 'DELETE' });
      }

      avisar('Solicitante salvo.');
      setEdicao(null);
      carregar();
    } catch (e) {
      avisar(msgErro(e), 'erro');
      carregar();
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (s: Solicitante) => {
    if (!confirm(`Excluir ${s.nome}? Os cartões e comprovantes dele também serão apagados. As solicitações já feitas continuam com o nome e e-mail registrados.`)) return;
    try { await api(`/solicitantes/${s.id}`, { method: 'DELETE' }); carregar(); }
    catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const t = busca.toLowerCase();
  const filtrados = lista.filter((s) =>
    `${s.nome} ${s.cpf ?? ''} ${mascaraDocumento(s.cpf ?? '')} ${s.email} ${s.banco ?? ''} ${s.chave_pix ?? ''} ${(s.cartoes ?? []).map((k) => k.final).join(' ')}`.toLowerCase().includes(t),
  );

  const cartoesDe = (s: Solicitante) =>
    (s.cartoes ?? []).length === 0 ? <span className="mudo">Nenhum</span> : (
      <div className="cartoes-celula">
        {s.cartoes.map((k) =>
          k.comprovante ? (
            <button key={k.id} className="chip-cartao com-pdf" title="Abrir comprovante" onClick={() => abrirComprovante(k.id).catch((e) => avisar(msgErro(e), 'erro'))}>
              •••• {k.final} <span className="pdf">{extensao(k.comprovante.nome)}</span>
            </button>
          ) : (
            <span key={k.id} className="chip-cartao" title="Sem comprovante">•••• {k.final}</span>
          ),
        )}
      </div>
    );

  return (
    <section>
      <div className="pagina-topo">
        <div className="pagina-titulo">
          <h1>Solicitantes</h1>
          <p className="mudo">Quem pede reembolso. Ao escolher um solicitante na solicitação, nome e e-mail entram sozinhos.</p>
        </div>
        <button className="btn btn-primario acao-principal" aria-label="Novo solicitante" onClick={abrirNovo}><Icone nome="mais" tamanho={20} /> <span>Novo solicitante</span></button>
      </div>
      <div className="busca-linha">
        <input className="busca" type="search" placeholder="Buscar por nome, CPF, e-mail, banco, Pix ou final do cartão" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {tabela ? (
      <div className="tabela-caixa">
        <table className="tabela">
          <thead><tr><th>Nome completo</th><th>CPF</th><th>E-mail corporativo</th><th>Dados bancários</th><th>Cartões</th><th className="acoes-col" /></tr></thead>
          <tbody>
            {filtrados.map((s) => (
              <tr key={s.id}>
                <td className="forte">{s.nome}</td>
                <td className="mono">{s.cpf ? mascaraDocumento(s.cpf) : <span className="mudo">Não informado</span>}</td>
                <td>{s.email}</td>
                <td><ResumoBancario s={s} /></td>
                <td>
                  {cartoesDe(s)}
                </td>
                <td className="acoes">
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => abrirEdicao(s)}>Editar</button>
                  <button className="btn btn-fantasma btn-pequeno perigo" onClick={() => excluir(s)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!filtrados.length && <tr><td colSpan={6} className="vazio">Nenhum solicitante cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      ) : (
        <ul className="lista-exp">
          {filtrados.map((s) => (
            <LinhaExpansivel
              key={s.id}
              resumo={
                <>
                  <strong className="linha-titulo">{s.nome}</strong>
                  <span className="linha-sub">{s.cpf ? mascaraDocumento(s.cpf) : 'CPF não informado'}</span>
                </>
              }
              lateral={
                <span className="indicadores">
                  <span className={`indicador ${s.banco && s.conta ? 'ok' : ''}`} title={s.banco ? 'Dados bancários cadastrados' : 'Sem dados bancários'}><Icone nome="banco" tamanho={16} /></span>
                  <span className={`indicador ${s.cartoes?.length ? 'ok' : ''}`} title={`${s.cartoes?.length ?? 0} cartão(ões)`}><Icone nome="cartao" tamanho={16} />{s.cartoes?.length ? <small>{s.cartoes.length}</small> : null}</span>
                </span>
              }
            >
              <div className="info-grade">
                <Info rotulo="E-mail corporativo" largo>{s.email}</Info>
                <Info rotulo="Dados bancários" largo><ResumoBancario s={s} /></Info>
                <Info rotulo="Cartões" largo>{cartoesDe(s)}</Info>
              </div>
              <div className="linha-acoes">
                <button className="icone-acao" onClick={() => abrirEdicao(s)}><Icone nome="editar" tamanho={18} /><span className="acao-texto">Editar</span></button>
                <button className="icone-acao perigo" onClick={() => excluir(s)}><Icone nome="lixeira" tamanho={18} /><span className="acao-texto">Excluir</span></button>
              </div>
            </LinhaExpansivel>
          ))}
          {!filtrados.length && <li className="vazio-lista">Nenhum solicitante cadastrado.</li>}
        </ul>
      )}

      <Modal titulo={edicao?.id ? 'Editar solicitante' : 'Novo solicitante'} aberto={!!edicao} aoFechar={() => setEdicao(null)} largo>
        {edicao && (
          <form onSubmit={salvar} className="form">
            <fieldset className="grupo">
              <legend>Dados do solicitante</legend>
              <div className="grade grade-3">
                <label className="campo"><span>Nome completo</span>
                  <input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} placeholder="Nome e sobrenome" required autoFocus />
                </label>
                <label className="campo"><span>CPF</span>
                  <input
                    inputMode="numeric"
                    value={edicao.cpf}
                    placeholder="000.000.000-00"
                    onChange={(e) => setEdicao({ ...edicao, cpf: mascaraDocumento(soDigitos(e.target.value).slice(0, 11)) })}
                    required
                  />
                  {soDigitos(edicao.cpf).length === 11 && !documentoValido(edicao.cpf) && <span className="erro">CPF inválido.</span>}
                </label>
                <label className="campo"><span>E-mail corporativo</span>
                  <input type="email" value={edicao.email} onChange={(e) => setEdicao({ ...edicao, email: e.target.value })} placeholder="nome@empresa.com.br" required />
                </label>
              </div>
            </fieldset>

            <fieldset className="grupo">
              <legend>Dados bancários para reembolso</legend>
              <div className="grade grade-bancaria">
                <label className="campo"><span>Banco</span>
                  <input value={edicao.banco} placeholder="Ex.: 341 Itaú" onChange={(e) => setEdicao({ ...edicao, banco: e.target.value })} />
                </label>
                <label className="campo"><span>Agência</span>
                  <input value={edicao.agencia} placeholder="0000" onChange={(e) => setEdicao({ ...edicao, agencia: e.target.value })} />
                </label>
                <label className="campo"><span>Conta</span>
                  <input value={edicao.conta} placeholder="00000-0" onChange={(e) => setEdicao({ ...edicao, conta: e.target.value })} />
                </label>
                <label className="campo"><span>Chave Pix</span>
                  <input value={edicao.chave_pix} placeholder="CPF, e-mail, telefone ou aleatória" onChange={(e) => setEdicao({ ...edicao, chave_pix: e.target.value })} />
                </label>
              </div>
            </fieldset>

            <fieldset className="grupo">
              <legend>Cartões</legend>
              {edicao.cartoes.length === 0 && <p className="mudo" style={{ marginTop: 0 }}>Nenhum cartão cadastrado.</p>}
              <div className="cartoes-lista">
                {edicao.cartoes.map((k, i) => (
                  <LinhaCartao
                    key={k.chave}
                    indice={i + 1}
                    cartao={k}
                    aoMudar={(m) => mudarCartao(k.chave, m)}
                    aoExcluir={() => excluirCartao(k)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn btn-fantasma btn-pequeno"
                style={{ marginTop: 10 }}
                onClick={() => setEdicao({ ...edicao, cartoes: [...edicao.cartoes, { chave: novaChave(), final: '', comprovante: null }] })}
              >
                + Adicionar cartão
              </button>
            </fieldset>

            <div className="form-rodape">
              <button type="button" className="btn btn-fantasma" onClick={() => setEdicao(null)}>Cancelar</button>
              <button className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

function LinhaCartao({ indice, cartao, aoMudar, aoExcluir }: {
  indice: number; cartao: CartaoForm; aoMudar: (m: Partial<CartaoForm>) => void; aoExcluir: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const temComprovante = !!cartao.arquivoNovo || (!!cartao.comprovante && !cartao.removerComprovante);

  const escolher = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return avisar('O comprovante passa de 20 MB.', 'erro');
    aoMudar({ arquivoNovo: f, removerComprovante: false });
  };

  const removerComprovante = () => aoMudar({ arquivoNovo: undefined, removerComprovante: !!cartao.comprovante });

  return (
    <div className="cartao-linha">
      <span className="cartao-numero">Cartão {indice}</span>
      <label className="campo cartao-final">
        <span>4 últimos dígitos</span>
        <div className="final-entrada">
          <span className="mudo">•••• </span>
          <input
            inputMode="numeric"
            placeholder="0000"
            value={cartao.final}
            onChange={(e) => aoMudar({ final: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            required
          />
        </div>
      </label>
      <div className="campo cartao-comprovante">
        <span>Comprovante do número do cartão</span>
        <input ref={entrada} type="file" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }} />
        {temComprovante ? (
          <div className="comprovante-arquivo">
            {cartao.arquivoNovo ? (
              <span className="nome" title={cartao.arquivoNovo.name}>{cartao.arquivoNovo.name}</span>
            ) : (
              <button type="button" className="link nome" title={cartao.comprovante!.nome} onClick={() => abrirComprovante(cartao.id!).catch((e) => avisar(msgErro(e), 'erro'))}>
                {cartao.comprovante!.nome}
              </button>
            )}
            <span className="mudo pequeno">{tamanhoArquivo(cartao.arquivoNovo?.size ?? cartao.comprovante!.tamanho)}</span>
            <button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => entrada.current?.click()}>Trocar</button>
            <button type="button" className="btn btn-fantasma btn-pequeno perigo" onClick={removerComprovante}>Excluir arquivo</button>
          </div>
        ) : (
          <button type="button" className="soltar soltar-compacto" onClick={() => entrada.current?.click()}>
            <strong>Anexar arquivo</strong> <span className="mudo">PDF, imagem ou outro, até 20 MB</span>
          </button>
        )}
      </div>
      <button type="button" className="icone-btn cartao-excluir" aria-label={`Excluir cartão ${indice}`} title="Excluir cartão" onClick={aoExcluir}>×</button>
    </div>
  );
}

/** Resumo dos dados bancários numa célula da tabela */
export function ResumoBancario({ s }: { s: Pick<Solicitante, 'banco' | 'agencia' | 'conta' | 'chave_pix'> }) {
  const conta = [s.banco, s.agencia && `Ag. ${s.agencia}`, s.conta && `Conta ${s.conta}`].filter(Boolean).join(' · ');
  if (!conta && !s.chave_pix) return <span className="mudo">Não informados</span>;
  return (
    <div className="resumo-bancario">
      {conta && <span>{conta}</span>}
      {s.chave_pix && <span><span className="rotulo-pix">Pix</span> {s.chave_pix}</span>}
    </div>
  );
}
