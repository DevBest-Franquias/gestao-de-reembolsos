import { useState, type FormEvent } from 'react';
import { api, abrirAnexo, enviarAnexos, FORMAS, type Anexo, type Forma, type Fornecedor, type Reembolso, type Solicitante } from '../api';
import { documentoValido, mascaraDocumento, tamanhoArquivo } from '../formato';
import { CampoMoeda, Dica, avisar, msgErro } from './ui';

const DICA_ANEXO = 'Nota fiscal / boleto / chave pix / outros (podem ser enviados vários arquivos separados)';

type Props = {
  inicial: Reembolso | null;
  solicitantes: Solicitante[];
  fornecedores: Fornecedor[];
  aoSalvar: () => void;
  aoCancelar: () => void;
};

export default function ReembolsoForm({ inicial, solicitantes, fornecedores, aoSalvar, aoCancelar }: Props) {
  const [solicitanteId, setSolicitanteId] = useState<string>(
    inicial ? (inicial.solicitante_id ? String(inicial.solicitante_id) : 'outro') : '',
  );
  const [solNome, setSolNome] = useState(inicial?.solicitante_nome ?? '');
  const [solEmail, setSolEmail] = useState(inicial?.solicitante_email ?? '');
  const [salvarSolicitante, setSalvarSolicitante] = useState(true);

  const [fornNovo, setFornNovo] = useState<'' | 'sim' | 'nao'>(inicial ? (inicial.fornecedor_novo ? 'sim' : 'nao') : '');
  const [fornecedorId, setFornecedorId] = useState(inicial?.fornecedor_id ? String(inicial.fornecedor_id) : '');
  const [fornNome, setFornNome] = useState(inicial?.fornecedor_nome ?? '');
  const [fornDoc, setFornDoc] = useState(inicial ? mascaraDocumento(inicial.fornecedor_documento) : '');

  const [numeroDoc, setNumeroDoc] = useState(inicial?.numero_documento ?? '');
  const [dataPagamento, setDataPagamento] = useState(inicial?.data_pagamento ?? '');
  const [valor, setValor] = useState(inicial?.valor_centavos ?? 0);
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [forma, setForma] = useState<Forma | ''>(inicial?.forma_pagamento ?? '');

  const [anexos, setAnexos] = useState<Anexo[]>(inicial?.anexos ?? []);
  const [novosArquivos, setNovosArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  const escolherSolicitante = (id: string) => {
    setSolicitanteId(id);
    const s = solicitantes.find((x) => String(x.id) === id);
    setSolNome(s?.nome ?? '');
    setSolEmail(s?.email ?? '');
  };

  const escolherFornecedor = (id: string) => {
    setFornecedorId(id);
    const f = fornecedores.find((x) => String(x.id) === id);
    setFornNome(f?.nome ?? '');
    setFornDoc(f ? mascaraDocumento(f.documento) : '');
  };

  const mudarFornNovo = (v: '' | 'sim' | 'nao') => {
    setFornNovo(v);
    setFornecedorId('');
    setFornNome('');
    setFornDoc('');
  };

  // Se digitar um CPF/CNPJ que já existe, avisa e oferece puxar do cadastro
  const docDigitos = fornDoc.replace(/\D/g, '');
  const jaCadastrado = fornNovo === 'sim' && docDigitos.length >= 11 ? fornecedores.find((f) => f.documento === docDigitos) : undefined;

  const removerAnexo = async (a: Anexo) => {
    if (!confirm(`Excluir o anexo ${a.nome_arquivo}?`)) return;
    try {
      await api(`/anexos/${a.id}`, { method: 'DELETE' });
      setAnexos((l) => l.filter((x) => x.id !== a.id));
    } catch (e) { avisar(msgErro(e), 'erro'); }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!solicitanteId) return avisar('Escolha o solicitante.', 'erro');
    if (!fornNovo) return avisar('Informe se o fornecedor é novo.', 'erro');
    if (fornNovo === 'nao' && !fornecedorId) return avisar('Escolha o fornecedor.', 'erro');
    if (fornNovo === 'sim' && !documentoValido(fornDoc)) return avisar('CPF ou CNPJ do fornecedor inválido.', 'erro');
    if (!valor) return avisar('Informe o valor do pagamento.', 'erro');
    if (!forma) return avisar('Escolha a forma de pagamento.', 'erro');

    setSalvando(true);
    try {
      const dados = {
        solicitante_id: solicitanteId !== 'outro' ? Number(solicitanteId) : null,
        solicitante_nome: solNome,
        solicitante_email: solEmail,
        salvar_solicitante: solicitanteId === 'outro' && salvarSolicitante,
        fornecedor_novo: fornNovo === 'sim',
        fornecedor_id: fornNovo === 'nao' ? Number(fornecedorId) : null,
        fornecedor_nome: fornNome,
        fornecedor_documento: fornDoc,
        numero_documento: numeroDoc,
        data_pagamento: dataPagamento || null,
        valor_centavos: valor,
        descricao,
        forma_pagamento: forma,
      };
      const r = await api<Reembolso>(inicial ? `/reembolsos/${inicial.id}` : '/reembolsos', {
        method: inicial ? 'PUT' : 'POST',
        json: dados,
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

  const solicitanteDoCadastro = solicitanteId !== '' && solicitanteId !== 'outro';

  return (
    <form className="form" onSubmit={salvar}>
      <fieldset className="grupo">
        <legend>Solicitante</legend>
        <div className="grade grade-3">
          <label className="campo">
            <span>Nome do solicitante</span>
            <select value={solicitanteId} onChange={(e) => escolherSolicitante(e.target.value)} required>
              <option value="">Selecione</option>
              {solicitantes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              <option value="outro">Outro (digitar)</option>
            </select>
          </label>
          {solicitanteId === 'outro' && (
            <label className="campo">
              <span>Nome completo</span>
              <input value={solNome} onChange={(e) => setSolNome(e.target.value)} required />
            </label>
          )}
          <label className="campo">
            <span>E-mail do solicitante</span>
            <input type="email" value={solEmail} onChange={(e) => setSolEmail(e.target.value)} readOnly={solicitanteDoCadastro} required />
          </label>
        </div>
        {solicitanteId === 'outro' && (
          <label className="marcar">
            <input type="checkbox" checked={salvarSolicitante} onChange={(e) => setSalvarSolicitante(e.target.checked)} />
            Salvar no cadastro de solicitantes
          </label>
        )}
      </fieldset>

      <fieldset className="grupo">
        <legend>Fornecedor</legend>
        <div className="grade grade-3">
          <label className="campo">
            <span>Fornecedor novo</span>
            <select value={fornNovo} onChange={(e) => mudarFornNovo(e.target.value as '' | 'sim' | 'nao')} required>
              <option value="">Selecione</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          {fornNovo === 'nao' && (
            <>
              <label className="campo">
                <span>Nome / Razão social</span>
                <select value={fornecedorId} onChange={(e) => escolherFornecedor(e.target.value)} required>
                  <option value="">Selecione</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>CNPJ / CPF</span>
                <input value={fornDoc} readOnly placeholder="Preenchido ao escolher" />
              </label>
            </>
          )}
          {fornNovo === 'sim' && (
            <>
              <label className="campo">
                <span>Nome / Razão social</span>
                <input value={fornNome} onChange={(e) => setFornNome(e.target.value)} required />
              </label>
              <label className="campo">
                <span>CNPJ / CPF</span>
                <input inputMode="numeric" value={fornDoc} onChange={(e) => setFornDoc(mascaraDocumento(e.target.value))} required />
              </label>
            </>
          )}
        </div>
        {fornNovo === 'sim' && docDigitos.length >= 11 && !documentoValido(fornDoc) && <p className="erro">CPF ou CNPJ inválido.</p>}
        {jaCadastrado && (
          <p className="nota">
            Esse CPF/CNPJ já está cadastrado como <strong>{jaCadastrado.nome}</strong>.{' '}
            <button type="button" className="link" onClick={() => { setFornNovo('nao'); escolherFornecedor(String(jaCadastrado.id)); }}>
              Usar o cadastro
            </button>
          </p>
        )}
        {fornNovo === 'sim' && !jaCadastrado && <p className="mudo pequeno">O fornecedor será adicionado ao cadastro ao salvar.</p>}
      </fieldset>

      <fieldset className="grupo">
        <legend>Pagamento</legend>
        <div className="grade grade-3">
          <label className="campo">
            <span>Número do documento</span>
            <input value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} />
          </label>
          <label className="campo">
            <span>Data do pagamento</span>
            <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          </label>
          <label className="campo">
            <span>Valor do pagamento</span>
            <CampoMoeda centavos={valor} aoMudar={setValor} />
          </label>
          <label className="campo">
            <span>Forma de pagamento</span>
            <select value={forma} onChange={(e) => setForma(e.target.value as Forma)} required>
              <option value="">Selecione</option>
              {Object.entries(FORMAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
          <label className="campo coluna-2">
            <span>Descrição do pagamento</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
        </div>
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
        <button className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Registrar solicitação'}</button>
      </div>
    </form>
  );
}
