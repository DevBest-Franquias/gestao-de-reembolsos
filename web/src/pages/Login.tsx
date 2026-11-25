import { useEffect, useState, type FormEvent } from 'react';
import { api, sessao, type Usuario } from '../api';
import { msgErro } from '../components/ui';

export default function Login({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const [setup, setSetup] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ precisaSetup: boolean }>('/setup').then((r) => setSetup(r.precisaSetup)).catch(() => {});
  }, []);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r = await api<{ token: string; usuario: Usuario }>(setup ? '/setup' : '/login', {
        method: 'POST',
        json: setup ? { nome, email, senha } : { email, senha },
      });
      sessao.token = r.token;
      aoEntrar(r.usuario);
    } catch (e) {
      setErro(msgErro(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <form className="login-cartao" onSubmit={enviar}>
        <img src="/logo-best-franquias-roxoescuro.png" alt="Best Franquias" className="login-logo" />
        <h1>{setup ? 'Primeiro acesso' : 'Gestão de reembolsos'}</h1>
        <p className="mudo">
          {setup ? 'Crie o usuário administrador do sistema.' : 'Entre com seu e-mail e senha.'}
        </p>
        {setup && (
          <label className="campo">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </label>
        )}
        <label className="campo">
          <span>E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!setup} />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={setup ? 8 : undefined} />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="btn btn-primario btn-largo" disabled={enviando}>
          {enviando ? 'Aguarde…' : setup ? 'Criar e entrar' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
