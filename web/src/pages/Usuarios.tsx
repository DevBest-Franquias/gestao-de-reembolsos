import { useEffect, useState, type FormEvent } from 'react';
import { api, type Usuario } from '../api';
import { CampoSenha, Modal, avisar, msgErro } from '../components/ui';
import { Icone } from '../components/Icone';
import { Info, LinhaExpansivel } from '../components/Expansivel';
import { TELA, useTelaMinima } from '../telas';

type Novo = { nome: string; email: string; senha: string; papel: 'admin' | 'usuario' };

export default function Usuarios({ eu }: { eu: Usuario }) {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [novo, setNovo] = useState<Novo | null>(null);
  const [redefinir, setRedefinir] = useState<Usuario | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const tabela = useTelaMinima(TELA.tablet);

  const carregar = () => api<Usuario[]>('/usuarios').then(setLista).catch((e) => avisar(msgErro(e), 'erro'));
  useEffect(() => { carregar(); }, []);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await api('/usuarios', { method: 'POST', json: novo });
      avisar('Usuário criado. Passe o e-mail e a senha para a pessoa.');
      setNovo(null);
      carregar();
    } catch (e) { avisar(msgErro(e), 'erro'); }
    finally { setSalvando(false); }
  };

  const salvarSenha = async (e: FormEvent) => {
    e.preventDefault();
    if (!redefinir) return;
    setSalvando(true);
    try {
      await api(`/usuarios/${redefinir.id}/senha`, { method: 'PUT', json: { senha: novaSenha } });
      avisar(redefinir.id === eu.id ? 'Sua senha foi alterada.' : `Senha de ${redefinir.nome} redefinida. Passe a nova senha para a pessoa.`);
      setRedefinir(null);
    } catch (e) { avisar(msgErro(e), 'erro'); }
    finally { setSalvando(false); }
  };

  const excluir = async (u: Usuario) => {
    if (!confirm(`Remover o acesso de ${u.nome}?`)) return;
    try { await api(`/usuarios/${u.id}`, { method: 'DELETE' }); carregar(); }
    catch (e) { avisar(msgErro(e), 'erro'); }
  };

  return (
    <section>
      <div className="pagina-topo">
        <div className="pagina-titulo">
          <h1>Usuários</h1>
          <p className="mudo">Quem pode entrar no sistema. Administradores também gerenciam esta lista e redefinem senhas.</p>
        </div>
        <button className="btn btn-primario acao-principal" aria-label="Novo usuário" onClick={() => setNovo({ nome: '', email: '', senha: '', papel: 'usuario' })}><Icone nome="mais" tamanho={20} /> <span>Novo usuário</span></button>
      </div>
      {tabela ? (
      <div className="tabela-caixa">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th className="acoes-col" /></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}{u.id === eu.id && <span className="mudo pequeno"> (você)</span>}</td>
                <td>{u.email}</td>
                <td><span className={`selo ${u.papel === 'admin' ? 'selo-roxo' : 'selo-cinza'}`}>{u.papel === 'admin' ? 'Administrador' : 'Usuário'}</span></td>
                <td className="acoes">
                  <button className="btn btn-fantasma btn-pequeno" onClick={() => { setNovaSenha(''); setRedefinir(u); }}>
                    {u.id === eu.id ? 'Alterar minha senha' : 'Redefinir senha'}
                  </button>
                  {u.id !== eu.id && <button className="btn btn-fantasma btn-pequeno perigo" onClick={() => excluir(u)}>Remover</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
        <ul className="lista-exp">
          {lista.map((x) => (
            <LinhaExpansivel
              key={x.id}
              resumo={
                <>
                  <strong className="linha-titulo">{x.nome}{x.id === eu.id && <span className="mudo pequeno"> (você)</span>}</strong>
                  <span className="linha-sub">{x.email}</span>
                </>
              }
              lateral={<span className={`selo ${x.papel === 'admin' ? 'selo-roxo' : 'selo-cinza'}`}>{x.papel === 'admin' ? 'Admin' : 'Usuário'}</span>}
            >
              <div className="info-grade">
                <Info rotulo="Perfil">{x.papel === 'admin' ? 'Administrador' : 'Usuário'}</Info>
              </div>
              <div className="linha-acoes">
                <button className="icone-acao" onClick={() => { setNovaSenha(''); setRedefinir(x); }}>
                  <Icone nome="chave" tamanho={18} /><span className="acao-texto">{x.id === eu.id ? 'Alterar minha senha' : 'Redefinir senha'}</span>
                </button>
                {x.id !== eu.id && (
                  <button className="icone-acao perigo" onClick={() => excluir(x)}><Icone nome="lixeira" tamanho={18} /><span className="acao-texto">Remover</span></button>
                )}
              </div>
            </LinhaExpansivel>
          ))}
        </ul>
      )}

      <Modal titulo="Novo usuário" aberto={!!novo} aoFechar={() => setNovo(null)}>
        {novo && (
          <form onSubmit={salvar} className="form">
            <label className="campo"><span>Nome</span>
              <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required autoFocus />
            </label>
            <label className="campo"><span>E-mail</span>
              <input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required />
            </label>
            <label className="campo"><span>Senha inicial</span>
              <CampoSenha valor={novo.senha} aoMudar={(v) => setNovo({ ...novo, senha: v })} minimo={8} autoComplete="new-password" />
              <span className="mudo pequeno">Pelo menos 8 caracteres.</span>
            </label>
            <label className="campo"><span>Perfil</span>
              <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as Novo['papel'] })}>
                <option value="usuario">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <div className="form-rodape">
              <button type="button" className="btn btn-fantasma" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Criar usuário'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        titulo={redefinir?.id === eu.id ? 'Alterar minha senha' : `Redefinir senha de ${redefinir?.nome ?? ''}`}
        aberto={!!redefinir}
        aoFechar={() => setRedefinir(null)}
      >
        {redefinir && (
          <form onSubmit={salvarSenha} className="form">
            <p className="mudo" style={{ margin: 0 }}>
              {redefinir.id === eu.id
                ? 'Você continua conectado depois de trocar a senha.'
                : `${redefinir.nome} será desconectado e vai precisar entrar com a nova senha.`}
            </p>
            <label className="campo"><span>Nova senha</span>
              <CampoSenha valor={novaSenha} aoMudar={setNovaSenha} minimo={8} autoFocus autoComplete="new-password" />
              <span className="mudo pequeno">Pelo menos 8 caracteres.</span>
            </label>
            <div className="form-rodape">
              <button type="button" className="btn btn-fantasma" onClick={() => setRedefinir(null)}>Cancelar</button>
              <button className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar nova senha'}</button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
