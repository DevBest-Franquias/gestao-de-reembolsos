import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context, Next } from 'hono';

type Env = {
  DB: D1Database;
  ANEXOS: R2Bucket;
  ALLOWED_ORIGINS: string;
  /** Repetições do PBKDF2. O plano gratuito do Workers limita 10 ms de CPU por requisição; no plano pago pode subir. */
  HASH_ITERACOES?: string;
};

type Usuario = { id: number; nome: string; email: string; papel: 'admin' | 'usuario' };
type Vars = { usuario: Usuario };
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const FORMAS = ['boleto', 'cartao_credito', 'pix', 'pix_qr_code'] as const;
const STATUS = ['nao_solicitado', 'solicitado', 'pago'] as const;
const SESSAO_DIAS = 30;
const MAX_ANEXO_BYTES = 20 * 1024 * 1024;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

/* ---------- CORS ---------- */
app.use('/api/*', async (c, next) => {
  const permitidos = (c.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: (origin) => (permitidos.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition'],
    maxAge: 86400,
  })(c, next);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ erro: 'Erro interno. Tente novamente.' }, 500);
});

const erro = (c: Ctx, msg: string, status: 400 | 401 | 403 | 404 | 409 = 400) => c.json({ erro: msg }, status);

/* ---------- Senhas e sessões ---------- */
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

// O hash é guardado como "<iteracoes>$<hex>" para permitir mudar as repetições sem invalidar senhas antigas
async function hashSenha(senha: string, iteracoes: number, saltHex?: string) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iteracoes, hash: 'SHA-256' }, chave, 256);
  return { hash: `${iteracoes}$${hex(bits)}`, salt: hex(salt) };
}

const iteracoesPadrao = (env: Env) => Math.min(Math.max(Number(env.HASH_ITERACOES) || 10000, 1000), 100000);

async function conferirSenha(senha: string, hashGuardado: string, salt: string) {
  const [it, valor] = hashGuardado.includes('$') ? hashGuardado.split('$') : ['100000', hashGuardado];
  const { hash } = await hashSenha(senha, Number(it), salt);
  return iguais(hash, `${it}$${valor}`);
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function criarSessao(db: D1Database, usuarioId: number) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(Date.now() + SESSAO_DIAS * 864e5).toISOString();
  await db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)').bind(token, usuarioId, expira).run();
  return token;
}

async function autenticar(c: Ctx, next: Next) {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return erro(c, 'Faça login para continuar.', 401);
  const u = await c.env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.papel FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira_em > ?`,
  )
    .bind(token, new Date().toISOString())
    .first<Usuario>();
  if (!u) return erro(c, 'Sessão expirada. Faça login novamente.', 401);
  c.set('usuario', u);
  await next();
}

async function somenteAdmin(c: Ctx, next: Next) {
  if (c.get('usuario').papel !== 'admin') return erro(c, 'Apenas administradores podem fazer isso.', 403);
  await next();
}

/* ---------- Validações ---------- */
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const texto = (s: unknown) => String(s ?? '').trim();
const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const dataValida = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function cpfValido(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
    const d = ((soma * 10) % 11) % 10;
    if (d !== Number(cpf[t])) return false;
  }
  return true;
}

function cnpjValido(cnpj: string) {
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string) => {
    let pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

const documentoValido = (d: string) => (d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false);

/* ---------- Setup e login ---------- */
app.get('/api/setup', async (c) => {
  const r = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios').first<{ n: number }>();
  return c.json({ precisaSetup: (r?.n ?? 0) === 0 });
});

app.post('/api/setup', async (c) => {
  const r = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios').first<{ n: number }>();
  if ((r?.n ?? 0) > 0) return erro(c, 'O sistema já foi configurado.', 409);
  const b = await c.req.json().catch(() => ({}));
  const nome = texto(b.nome);
  const email = texto(b.email).toLowerCase();
  const senha = String(b.senha ?? '');
  if (!nome || !emailValido(email)) return erro(c, 'Informe nome e e-mail válidos.');
  if (senha.length < 8) return erro(c, 'A senha precisa ter pelo menos 8 caracteres.');
  const { hash, salt } = await hashSenha(senha, iteracoesPadrao(c.env));
  const ins = await c.env.DB.prepare(
    "INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel) VALUES (?, ?, ?, ?, 'admin')",
  )
    .bind(nome, email, hash, salt)
    .run();
  const id = Number(ins.meta.last_row_id);
  const token = await criarSessao(c.env.DB, id);
  return c.json({ token, usuario: { id, nome, email, papel: 'admin' } });
});

app.post('/api/login', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = texto(b.email).toLowerCase();
  const senha = String(b.senha ?? '');
  const u = await c.env.DB.prepare('SELECT * FROM usuarios WHERE email = ?').bind(email).first<
    Usuario & { senha_hash: string; senha_salt: string }
  >();
  if (!u) return erro(c, 'E-mail ou senha incorretos.', 401);
  if (!(await conferirSenha(senha, u.senha_hash, u.senha_salt))) return erro(c, 'E-mail ou senha incorretos.', 401);
  await c.env.DB.prepare('DELETE FROM sessoes WHERE expira_em < ?').bind(new Date().toISOString()).run();
  const token = await criarSessao(c.env.DB, u.id);
  return c.json({ token, usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel } });
});

/* Tudo abaixo exige login */
app.use('/api/*', async (c, next) => {
  const livre = ['/api/setup', '/api/login'];
  // Os links úteis são públicos para aparecerem na tela de login
  const publicoGet = c.req.method === 'GET' && c.req.path === '/api/links';
  if (livre.includes(c.req.path) || publicoGet || c.req.method === 'OPTIONS') return next();
  return autenticar(c as Ctx, next);
});

app.post('/api/logout', async (c) => {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  await c.env.DB.prepare('DELETE FROM sessoes WHERE token = ?').bind(token).run();
  return c.json({ ok: true });
});

app.get('/api/me', (c) => c.json(c.get('usuario')));

app.put('/api/me/senha', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const nova = String(b.senha ?? '');
  if (nova.length < 8) return erro(c, 'A senha precisa ter pelo menos 8 caracteres.');
  const { hash, salt } = await hashSenha(nova, iteracoesPadrao(c.env));
  await c.env.DB.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?')
    .bind(hash, salt, c.get('usuario').id)
    .run();
  return c.json({ ok: true });
});

/* ---------- Usuários (admin) ---------- */
app.get('/api/usuarios', somenteAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, nome, email, papel, criado_em FROM usuarios ORDER BY nome').all();
  return c.json(results);
});

app.post('/api/usuarios', somenteAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const nome = texto(b.nome);
  const email = texto(b.email).toLowerCase();
  const senha = String(b.senha ?? '');
  const papel = b.papel === 'admin' ? 'admin' : 'usuario';
  if (!nome || !emailValido(email)) return erro(c, 'Informe nome e e-mail válidos.');
  if (senha.length < 8) return erro(c, 'A senha precisa ter pelo menos 8 caracteres.');
  const existe = await c.env.DB.prepare('SELECT id FROM usuarios WHERE email = ?').bind(email).first();
  if (existe) return erro(c, 'Já existe um usuário com esse e-mail.', 409);
  const { hash, salt } = await hashSenha(senha, iteracoesPadrao(c.env));
  await c.env.DB.prepare('INSERT INTO usuarios (nome, email, senha_hash, senha_salt, papel) VALUES (?, ?, ?, ?, ?)')
    .bind(nome, email, hash, salt, papel)
    .run();
  return c.json({ ok: true }, 201);
});

// Redefinir a senha de um usuário (admin). Encerra as sessões abertas dele.
app.put('/api/usuarios/:id/senha', somenteAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json().catch(() => ({}));
  const nova = String(b.senha ?? '');
  if (nova.length < 8) return erro(c, 'A senha precisa ter pelo menos 8 caracteres.');
  const existe = await c.env.DB.prepare('SELECT id FROM usuarios WHERE id = ?').bind(id).first();
  if (!existe) return erro(c, 'Usuário não encontrado.', 404);
  const { hash, salt } = await hashSenha(nova, iteracoesPadrao(c.env));
  await c.env.DB.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?').bind(hash, salt, id).run();
  if (id !== c.get('usuario').id) {
    await c.env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id).run();
  }
  return c.json({ ok: true });
});

app.delete('/api/usuarios/:id', somenteAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('usuario').id) return erro(c, 'Você não pode excluir o próprio usuário.');
  await c.env.DB.prepare('DELETE FROM usuarios WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

/* ---------- Solicitantes ---------- */
type Cartao = {
  id: number;
  solicitante_id: number;
  final: string;
  comprovante_chave_r2: string | null;
  comprovante_nome: string | null;
  comprovante_tamanho: number | null;
};

// Não expõe a chave interna do R2 para o front
const cartaoPublico = (k: Cartao) => ({
  id: k.id,
  solicitante_id: k.solicitante_id,
  final: k.final,
  comprovante: k.comprovante_chave_r2 ? { nome: k.comprovante_nome, tamanho: k.comprovante_tamanho } : null,
});

app.get('/api/solicitantes', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM solicitantes ORDER BY nome').all<Record<string, unknown>>();
  const { results: cartoes } = await c.env.DB.prepare('SELECT * FROM cartoes ORDER BY id').all<Cartao>();
  return c.json(
    results.map((s) => ({
      ...s,
      cartoes: cartoes.filter((k) => k.solicitante_id === s.id).map(cartaoPublico),
    })),
  );
});

async function lerSolicitante(c: Ctx) {
  const b = await c.req.json().catch(() => ({}));
  const nome = texto(b.nome);
  const email = texto(b.email).toLowerCase();
  const chave_pix = texto(b.chave_pix);
  const cpf = soDigitos(b.cpf);
  const banco = texto(b.banco).slice(0, 100);
  const agencia = texto(b.agencia).slice(0, 20);
  const conta = texto(b.conta).slice(0, 30);
  if (!nome) return { falha: 'Informe o nome do solicitante.' };
  if (!cpfValido(cpf)) return { falha: 'CPF do solicitante inválido.' };
  if (!emailValido(email)) return { falha: 'Informe um e-mail válido.' };
  return { nome, email, chave_pix, cpf, banco, agencia, conta };
}

const cpfEmUso = (db: D1Database, cpf: string, ignorarId = 0) =>
  db.prepare('SELECT nome FROM solicitantes WHERE cpf = ? AND id <> ?').bind(cpf, ignorarId).first<{ nome: string }>();

app.post('/api/solicitantes', async (c) => {
  const d = await lerSolicitante(c);
  if ('falha' in d) return erro(c, d.falha!);
  const outro = await cpfEmUso(c.env.DB, d.cpf);
  if (outro) return erro(c, `Esse CPF já está cadastrado para ${outro.nome}.`, 409);
  const r = await c.env.DB.prepare('INSERT INTO solicitantes (nome, email, chave_pix, cpf, banco, agencia, conta) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(d.nome, d.email, d.chave_pix, d.cpf, d.banco, d.agencia, d.conta)
    .first();
  return c.json({ ...r, cartoes: [] }, 201);
});

app.put('/api/solicitantes/:id', async (c) => {
  const d = await lerSolicitante(c);
  if ('falha' in d) return erro(c, d.falha!);
  const id = Number(c.req.param('id'));
  const outro = await cpfEmUso(c.env.DB, d.cpf, id);
  if (outro) return erro(c, `Esse CPF já está cadastrado para ${outro.nome}.`, 409);
  const r = await c.env.DB.prepare('UPDATE solicitantes SET nome = ?, email = ?, chave_pix = ?, cpf = ?, banco = ?, agencia = ?, conta = ? WHERE id = ? RETURNING *')
    .bind(d.nome, d.email, d.chave_pix, d.cpf, d.banco, d.agencia, d.conta, id)
    .first();
  if (!r) return erro(c, 'Solicitante não encontrado.', 404);
  return c.json(r);
});

app.delete('/api/solicitantes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare('SELECT comprovante_chave_r2 FROM cartoes WHERE solicitante_id = ? AND comprovante_chave_r2 IS NOT NULL')
    .bind(id)
    .all<{ comprovante_chave_r2: string }>();
  if (results.length) await c.env.ANEXOS.delete(results.map((k) => k.comprovante_chave_r2));
  await c.env.DB.prepare('DELETE FROM cartoes WHERE solicitante_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM solicitantes WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

/* ---------- Cartões dos solicitantes ---------- */
const lerFinal = (v: unknown) => {
  const d = soDigitos(v);
  return d.length === 4 ? d : null;
};

const buscarCartao = (db: D1Database, id: number) => db.prepare('SELECT * FROM cartoes WHERE id = ?').bind(id).first<Cartao>();

app.post('/api/solicitantes/:id/cartoes', async (c) => {
  const sid = Number(c.req.param('id'));
  const existe = await c.env.DB.prepare('SELECT id FROM solicitantes WHERE id = ?').bind(sid).first();
  if (!existe) return erro(c, 'Solicitante não encontrado.', 404);
  const b = await c.req.json().catch(() => ({}));
  const final = lerFinal(b.final);
  if (!final) return erro(c, 'Informe os 4 últimos dígitos do cartão.');
  const k = await c.env.DB.prepare('INSERT INTO cartoes (solicitante_id, final) VALUES (?, ?) RETURNING *').bind(sid, final).first<Cartao>();
  return c.json(cartaoPublico(k!), 201);
});

app.put('/api/cartoes/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const final = lerFinal(b.final);
  if (!final) return erro(c, 'Informe os 4 últimos dígitos do cartão.');
  const k = await c.env.DB.prepare('UPDATE cartoes SET final = ? WHERE id = ? RETURNING *').bind(final, Number(c.req.param('id'))).first<Cartao>();
  if (!k) return erro(c, 'Cartão não encontrado.', 404);
  return c.json(cartaoPublico(k));
});

app.delete('/api/cartoes/:id', async (c) => {
  const k = await buscarCartao(c.env.DB, Number(c.req.param('id')));
  if (!k) return erro(c, 'Cartão não encontrado.', 404);
  if (k.comprovante_chave_r2) await c.env.ANEXOS.delete(k.comprovante_chave_r2);
  await c.env.DB.prepare('DELETE FROM cartoes WHERE id = ?').bind(k.id).run();
  return c.json({ ok: true });
});

// Envia (ou troca) o comprovante do cartão. Aceita qualquer tipo de arquivo.
app.post('/api/cartoes/:id/comprovante', async (c) => {
  const k = await buscarCartao(c.env.DB, Number(c.req.param('id')));
  if (!k) return erro(c, 'Cartão não encontrado.', 404);
  const form = await c.req.formData();
  const f = form.get('arquivo');
  if (!f || typeof f === 'string') return erro(c, 'Nenhum arquivo enviado.');
  if (f.size > MAX_ANEXO_BYTES) return erro(c, 'O comprovante passa de 20 MB.');
  const chave = `cartoes/${k.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
  await c.env.ANEXOS.put(chave, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' } });
  if (k.comprovante_chave_r2) await c.env.ANEXOS.delete(k.comprovante_chave_r2);
  const novo = await c.env.DB.prepare(
    'UPDATE cartoes SET comprovante_chave_r2 = ?, comprovante_nome = ?, comprovante_tamanho = ? WHERE id = ? RETURNING *',
  )
    .bind(chave, f.name, f.size, k.id)
    .first<Cartao>();
  return c.json(cartaoPublico(novo!));
});

app.get('/api/cartoes/:id/comprovante', async (c) => {
  const k = await buscarCartao(c.env.DB, Number(c.req.param('id')));
  if (!k?.comprovante_chave_r2) return erro(c, 'Comprovante não encontrado.', 404);
  const obj = await c.env.ANEXOS.get(k.comprovante_chave_r2);
  if (!obj) return erro(c, 'Arquivo não encontrado no armazenamento.', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(k.comprovante_nome || 'comprovante')}`,
    },
  });
});

app.delete('/api/cartoes/:id/comprovante', async (c) => {
  const k = await buscarCartao(c.env.DB, Number(c.req.param('id')));
  if (!k) return erro(c, 'Cartão não encontrado.', 404);
  if (k.comprovante_chave_r2) await c.env.ANEXOS.delete(k.comprovante_chave_r2);
  const novo = await c.env.DB.prepare(
    'UPDATE cartoes SET comprovante_chave_r2 = NULL, comprovante_nome = NULL, comprovante_tamanho = NULL WHERE id = ? RETURNING *',
  )
    .bind(k.id)
    .first<Cartao>();
  return c.json(cartaoPublico(novo!));
});

/* ---------- Reembolsos ---------- */
type Anexo = { id: number; reembolso_id: number; nome_arquivo: string; tipo: string; tamanho: number; categoria: string; criado_em: string };
const CATEGORIAS_ANEXO = ['documento', 'cobranca'] as const;

app.get('/api/reembolsos', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM reembolsos ORDER BY id DESC').all<Record<string, unknown>>();
  const { results: anexos } = await c.env.DB.prepare(
    'SELECT id, reembolso_id, nome_arquivo, tipo, tamanho, categoria, criado_em FROM anexos ORDER BY id',
  ).all<Anexo>();
  const porReembolso = new Map<number, Anexo[]>();
  for (const a of anexos) {
    const lista = porReembolso.get(a.reembolso_id) ?? [];
    lista.push(a);
    porReembolso.set(a.reembolso_id, lista);
  }
  return c.json(
    results.map(({ cartao_comprovante_chave_r2, ...r }) => ({
      ...r,
      cartao_comprovante: cartao_comprovante_chave_r2 ? { nome: r.cartao_comprovante_nome, tamanho: r.cartao_comprovante_tamanho } : null,
      anexos: porReembolso.get(r.id as number) ?? [],
    })),
  );
});

/* Valores fixos da solicitação de reembolso */
const EMPRESA_PAGADORA = '[1026] BEST INVESTIDAS LTDA';
const CENTRO_CUSTO_N5 = '[5766] FRANQUIAS';

/** Próxima terça ou quinta-feira depois de hoje, no horário de Brasília (AAAA-MM-DD) */
function proximaTercaOuQuinta(agora = new Date()) {
  const d = new Date(agora.getTime() - 3 * 3600e3);
  d.setUTCHours(12, 0, 0, 0);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 2 && d.getUTCDay() !== 4);
  return d.toISOString().slice(0, 10);
}

type SolicitanteCompleto = {
  id: number; nome: string; email: string; cpf: string;
  banco: string; agencia: string; conta: string; chave_pix: string;
};

/** O que falta no cadastro do solicitante para registrar um reembolso */
function faltasCadastro(s: SolicitanteCompleto) {
  const faltas: string[] = [];
  if (!cpfValido(s.cpf)) faltas.push('CPF');
  if (!s.chave_pix) faltas.push('chave Pix');
  if (!s.banco) faltas.push('banco');
  if (!s.agencia) faltas.push('agência');
  if (!s.conta) faltas.push('conta');
  return faltas;
}

const listaHumana = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0]);

function lerValorDescricao(b: Record<string, unknown>) {
  const valor_centavos = Math.round(Number(b.valor_centavos));
  if (!Number.isFinite(valor_centavos) || valor_centavos <= 0) return { falha: 'Informe o valor do pagamento.' };
  return { valor_centavos, descricao: texto(b.descricao).slice(0, 500) };
}

// Registro: só solicitante, valor e descrição vêm do formulário. O resto é fixo ou vem do cadastro.
app.post('/api/reembolsos', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const sid = Number(b.solicitante_id);
  const s = sid ? await c.env.DB.prepare('SELECT * FROM solicitantes WHERE id = ?').bind(sid).first<SolicitanteCompleto>() : null;
  if (!s) return erro(c, 'Escolha o solicitante.');
  const faltas = faltasCadastro(s);
  if (faltas.length) return erro(c, `Complete o cadastro de ${s.nome} em Solicitantes. Falta: ${listaHumana(faltas)}.`);
  const v = lerValorDescricao(b);
  if ('falha' in v) return erro(c, v.falha!);

  // Cartão: com um só, usa ele; com vários, precisa escolher; sem nenhum, segue sem cartão
  const { results: cartoes } = await c.env.DB.prepare('SELECT * FROM cartoes WHERE solicitante_id = ? ORDER BY id').bind(s.id).all<Cartao>();
  let cartao: Cartao | undefined;
  if (cartoes.length === 1) cartao = cartoes[0];
  else if (cartoes.length > 1) {
    cartao = cartoes.find((k) => k.id === Number(b.cartao_id));
    if (!cartao) return erro(c, 'Escolha o cartão usado no pagamento.');
  }
  // O comprovante do cartão é copiado para a solicitação, para não depender do cadastro depois
  const comprovanteCopia = await copiarComprovanteCartao(c.env, cartao);

  const dados: Record<string, string | number | null> = {
    solicitante_id: s.id,
    solicitante_nome: s.nome,
    solicitante_email: s.email,
    solicitante_cpf: s.cpf,
    fornecedor_novo: 0,
    fornecedor_eh_solicitante: 1,
    fornecedor_id: null,
    fornecedor_nome: s.nome,
    fornecedor_documento: s.cpf,
    numero_documento: '0',
    data_pagamento: proximaTercaOuQuinta(),
    valor_centavos: v.valor_centavos,
    descricao: v.descricao,
    forma_pagamento: 'pix',
    chave_pix: s.chave_pix,
    banco: s.banco,
    agencia: s.agencia,
    conta: s.conta,
    empresa_pagadora: EMPRESA_PAGADORA,
    multiplos_centros_custo: 0,
    centro_custo: CENTRO_CUSTO_N5,
    cartao_id: cartao?.id ?? null,
    cartao_final: cartao?.final ?? '',
    cartao_comprovante_chave_r2: comprovanteCopia,
    cartao_comprovante_nome: comprovanteCopia ? cartao!.comprovante_nome : null,
    cartao_comprovante_tamanho: comprovanteCopia ? cartao!.comprovante_tamanho : null,
    criado_por: c.get('usuario').id,
  };
  const campos = Object.keys(dados);
  const r = await c.env.DB.prepare(
    `INSERT INTO reembolsos (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')}) RETURNING *`,
  )
    .bind(...campos.map((k) => dados[k]))
    .first<Record<string, unknown>>();
  const { cartao_comprovante_chave_r2, ...publico } = r!;
  return c.json({ ...publico, cartao_comprovante: cartao_comprovante_chave_r2 ? { nome: publico.cartao_comprovante_nome, tamanho: publico.cartao_comprovante_tamanho } : null, anexos: [] }, 201);
});

/** Copia o comprovante do cartão para a solicitação; devolve a chave da cópia */
async function copiarComprovanteCartao(env: Env, cartao: Cartao | undefined) {
  if (!cartao?.comprovante_chave_r2) return null;
  const obj = await env.ANEXOS.get(cartao.comprovante_chave_r2);
  if (!obj) return null;
  const chave = `reembolsos/cartao/${crypto.randomUUID()}-${(cartao.comprovante_nome || 'comprovante').replace(/[^\w.\-]+/g, '_')}`;
  await env.ANEXOS.put(chave, obj.body, { httpMetadata: obj.httpMetadata });
  return chave;
}

// Edição: valor, descrição, data de vencimento, solicitante e cartão podem mudar
app.put('/api/reembolsos/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const atual = await db.prepare('SELECT * FROM reembolsos WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!atual) return erro(c, 'Solicitação não encontrada.', 404);
  const v = lerValorDescricao(b);
  if ('falha' in v) return erro(c, v.falha!);
  const mudancas: Record<string, string | number | null> = { valor_centavos: v.valor_centavos, descricao: v.descricao };

  if (b.data_pagamento !== undefined) {
    if (!dataValida(b.data_pagamento)) return erro(c, 'Informe uma data de vencimento válida.');
    mudancas.data_pagamento = String(b.data_pagamento);
  }

  // Troca de solicitante: os dados passam a vir do cadastro do novo solicitante
  let solicitanteId = atual.solicitante_id as number | null;
  const trocouSolicitante = b.solicitante_id !== undefined && b.solicitante_id !== null && Number(b.solicitante_id) !== solicitanteId;
  if (trocouSolicitante) {
    const s = await db.prepare('SELECT * FROM solicitantes WHERE id = ?').bind(Number(b.solicitante_id)).first<SolicitanteCompleto>();
    if (!s) return erro(c, 'Solicitante não encontrado.');
    const faltas = faltasCadastro(s);
    if (faltas.length) return erro(c, `Complete o cadastro de ${s.nome} em Solicitantes. Falta: ${listaHumana(faltas)}.`);
    solicitanteId = s.id;
    Object.assign(mudancas, {
      solicitante_id: s.id,
      solicitante_nome: s.nome,
      solicitante_email: s.email,
      solicitante_cpf: s.cpf,
      fornecedor_nome: s.nome,
      fornecedor_documento: s.cpf,
      chave_pix: s.chave_pix,
      banco: s.banco,
      agencia: s.agencia,
      conta: s.conta,
    });
  }

  // Cartão: undefined mantém; null retira; número troca (precisa ser do solicitante)
  let chaveAntiga: string | null = null;
  const querMudarCartao = b.cartao_id !== undefined && (b.cartao_id === null ? atual.cartao_final !== '' : Number(b.cartao_id) !== atual.cartao_id);
  if (trocouSolicitante && b.cartao_id === undefined && atual.cartao_final) {
    return erro(c, 'Escolha o cartão do novo solicitante.');
  }
  if (querMudarCartao) {
    let cartao: Cartao | undefined;
    if (b.cartao_id !== null) {
      cartao = (await db.prepare('SELECT * FROM cartoes WHERE id = ? AND solicitante_id = ?').bind(Number(b.cartao_id), solicitanteId).first<Cartao>()) ?? undefined;
      if (!cartao) return erro(c, 'Cartão não encontrado para esse solicitante.');
    }
    const copia = await copiarComprovanteCartao(c.env, cartao);
    chaveAntiga = (atual.cartao_comprovante_chave_r2 as string | null) ?? null;
    Object.assign(mudancas, {
      cartao_id: cartao?.id ?? null,
      cartao_final: cartao?.final ?? '',
      cartao_comprovante_chave_r2: copia,
      cartao_comprovante_nome: copia ? cartao!.comprovante_nome : null,
      cartao_comprovante_tamanho: copia ? cartao!.comprovante_tamanho : null,
    });
  }

  const campos = Object.keys(mudancas);
  await db
    .prepare(`UPDATE reembolsos SET ${campos.map((k) => `${k} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`)
    .bind(...campos.map((k) => mudancas[k]), id)
    .run();
  if (chaveAntiga) await c.env.ANEXOS.delete(chaveAntiga);
  return c.json({ ok: true, id });
});

// Atualização rápida de acompanhamento: status e data do reembolso
app.patch('/api/reembolsos/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(c.req.param('id'));
  const atual = await c.env.DB.prepare('SELECT status, data_reembolso FROM reembolsos WHERE id = ?').bind(id).first<{
    status: string;
    data_reembolso: string | null;
  }>();
  if (!atual) return erro(c, 'Solicitação não encontrada.', 404);
  const status = b.status !== undefined ? String(b.status) : atual.status;
  if (!STATUS.includes(status as (typeof STATUS)[number])) return erro(c, 'Status inválido.');
  let data_reembolso = b.data_reembolso !== undefined ? (b.data_reembolso ? String(b.data_reembolso) : null) : atual.data_reembolso;
  if (data_reembolso && !dataValida(data_reembolso)) return erro(c, 'Data do reembolso inválida.');
  // Ao marcar como pago sem data, assume a data de hoje (horário de Brasília)
  if (status === 'pago' && !data_reembolso) {
    data_reembolso = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  }
  const r = await c.env.DB.prepare(
    "UPDATE reembolsos SET status = ?, data_reembolso = ?, atualizado_em = datetime('now') WHERE id = ? RETURNING *",
  )
    .bind(status, data_reembolso, id)
    .first();
  return c.json(r);
});

app.delete('/api/reembolsos/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { results } = await c.env.DB.prepare('SELECT chave_r2 FROM anexos WHERE reembolso_id = ?').bind(id).all<{ chave_r2: string }>();
  if (results.length) await c.env.ANEXOS.delete(results.map((a) => a.chave_r2));
  const rb = await c.env.DB.prepare('SELECT cartao_comprovante_chave_r2 AS k FROM reembolsos WHERE id = ?').bind(id).first<{ k: string | null }>();
  if (rb?.k) await c.env.ANEXOS.delete(rb.k);
  await c.env.DB.prepare('DELETE FROM anexos WHERE reembolso_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM reembolsos WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// Comprovante do cartão guardado na solicitação
app.get('/api/reembolsos/:id/comprovante-cartao', async (c) => {
  const r = await c.env.DB.prepare('SELECT cartao_comprovante_chave_r2 AS k, cartao_comprovante_nome AS nome FROM reembolsos WHERE id = ?')
    .bind(Number(c.req.param('id')))
    .first<{ k: string | null; nome: string | null }>();
  if (!r?.k) return erro(c, 'Comprovante do cartão não encontrado.', 404);
  const obj = await c.env.ANEXOS.get(r.k);
  if (!obj) return erro(c, 'Arquivo não encontrado no armazenamento.', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(r.nome || 'comprovante')}`,
    },
  });
});

/* ---------- Anexos (R2) ---------- */
app.post('/api/reembolsos/:id/anexos', async (c) => {
  const id = Number(c.req.param('id'));
  const existe = await c.env.DB.prepare('SELECT id FROM reembolsos WHERE id = ?').bind(id).first();
  if (!existe) return erro(c, 'Solicitação não encontrada.', 404);
  const form = await c.req.formData();
  const arquivos = form.getAll('arquivos').filter((f): f is File => typeof f !== 'string');
  const categoria = String(form.get('categoria') ?? 'documento');
  if (!CATEGORIAS_ANEXO.includes(categoria as (typeof CATEGORIAS_ANEXO)[number])) return erro(c, 'Tipo de anexo inválido.');
  if (!arquivos.length) return erro(c, 'Nenhum arquivo enviado.');
  const salvos: Anexo[] = [];
  for (const f of arquivos) {
    if (f.size > MAX_ANEXO_BYTES) return erro(c, `O arquivo "${f.name}" passa de 20 MB.`);
    const chave = `reembolsos/${id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
    await c.env.ANEXOS.put(chave, f.stream(), { httpMetadata: { contentType: f.type || 'application/octet-stream' } });
    const a = await c.env.DB.prepare(
      'INSERT INTO anexos (reembolso_id, chave_r2, nome_arquivo, tipo, tamanho, categoria) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, reembolso_id, nome_arquivo, tipo, tamanho, categoria, criado_em',
    )
      .bind(id, chave, f.name, f.type || 'application/octet-stream', f.size, categoria)
      .first<Anexo>();
    salvos.push(a!);
  }
  return c.json(salvos, 201);
});

app.get('/api/anexos/:id', async (c) => {
  const a = await c.env.DB.prepare('SELECT * FROM anexos WHERE id = ?').bind(Number(c.req.param('id'))).first<
    Anexo & { chave_r2: string }
  >();
  if (!a) return erro(c, 'Anexo não encontrado.', 404);
  const obj = await c.env.ANEXOS.get(a.chave_r2);
  if (!obj) return erro(c, 'Arquivo não encontrado no armazenamento.', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': a.tipo,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.nome_arquivo)}`,
    },
  });
});

app.delete('/api/anexos/:id', async (c) => {
  const a = await c.env.DB.prepare('SELECT chave_r2 FROM anexos WHERE id = ?').bind(Number(c.req.param('id'))).first<{ chave_r2: string }>();
  if (!a) return erro(c, 'Anexo não encontrado.', 404);
  await c.env.ANEXOS.delete(a.chave_r2);
  await c.env.DB.prepare('DELETE FROM anexos WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

/* ---------- Links úteis ---------- */
app.get('/api/links', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, titulo, url FROM links_uteis ORDER BY ordem, id').all();
  return c.json(results);
});

// Substitui a lista inteira de links (admin)
app.put('/api/links', somenteAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const lista = Array.isArray(b.links) ? b.links : [];
  const limpos: { titulo: string; url: string }[] = [];
  for (const l of lista) {
    const titulo = texto(l?.titulo);
    const url = texto(l?.url);
    if (!titulo && !url) continue;
    if (!titulo) return erro(c, 'Todo link precisa de um nome.');
    let u: URL;
    try { u = new URL(url); } catch { return erro(c, `Endereço inválido em "${titulo}".`); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return erro(c, `Endereço inválido em "${titulo}".`);
    limpos.push({ titulo, url: u.toString() });
  }
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM links_uteis'),
    ...limpos.map((l, i) => db.prepare('INSERT INTO links_uteis (titulo, url, ordem) VALUES (?, ?, ?)').bind(l.titulo, l.url, i + 1)),
  ]);
  const { results } = await db.prepare('SELECT id, titulo, url FROM links_uteis ORDER BY ordem, id').all();
  return c.json(results);
});

app.notFound((c) => c.json({ erro: 'Rota não encontrada.' }, 404));

export default app;
