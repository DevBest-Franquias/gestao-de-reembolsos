# Gestão de reembolsos

Sistema interno da Best Franquias para registrar solicitações de reembolso e acompanhar o andamento de cada uma.

- **Front:** React + Vite, hospedado na **Vercel** (pasta `web/`)
- **API:** Cloudflare **Workers** com Hono (pasta `api/`)
- **Banco:** Cloudflare **D1**
- **Anexos:** Cloudflare **R2**
- **Deploy:** a Vercel publica o front a cada push na `main`; o GitHub Actions publica a API

## Funcionalidades

- Lista de reembolsos com filtros por status, busca e total em R$ do que está filtrado
- Status (Não solicitado, Solicitado, Pago) e Data do reembolso editáveis direto na linha
- Ao marcar como **Pago** sem data, o sistema preenche com a data de hoje
- Cadastro de **solicitantes** e **fornecedores**; ao escolher na solicitação, os dados entram sozinhos
- Fornecedor novo informado na solicitação entra no cadastro automaticamente
- Validação de CPF/CNPJ, valor com formatação monetária, vários anexos por solicitação
- Login com e-mail e senha; administradores gerenciam os usuários

---

## Configuração (uma vez só)

### 1. Cloudflare: banco e armazenamento

Com o [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (já vem como dependência da pasta `api/`):

```bash
cd api
npm install
npx wrangler login
npx wrangler d1 create reembolsos
npx wrangler r2 bucket create reembolsos-anexos
```

O comando `d1 create` mostra um `database_id`. Copie e cole em `api/wrangler.toml` no lugar de `COLE_AQUI_O_ID_DO_D1`.

Também pelo painel: **Workers e Pages > D1** e **R2 > Criar bucket**, com os mesmos nomes.

### 2. Cloudflare: publicar a API

```bash
npx wrangler d1 migrations apply reembolsos --remote
npx wrangler deploy
```

O deploy mostra o endereço da API, algo como `https://reembolsos-api.SEU-SUBDOMINIO.workers.dev`.

### 3. Vercel: publicar o front

1. Na Vercel, **Add New > Project** e importe este repositório
2. **Root Directory:** `web`
3. **Framework:** Vite (detectado sozinho)
4. Em **Environment Variables**, crie `VITE_API_URL` com o endereço da API do passo 2
5. Deploy

### 4. Liberar o domínio do front na API

Em `api/wrangler.toml`, coloque o endereço do front em `ALLOWED_ORIGINS` (separe vários por vírgula):

```toml
ALLOWED_ORIGINS = "https://reembolsos.vercel.app,http://localhost:5173"
```

Faça commit na `main` (o GitHub Actions publica) ou rode `npx wrangler deploy`.

### 5. Deploy automático da API pelo GitHub

Em **GitHub > Settings > Secrets and variables > Actions**, crie:

| Segredo | Onde pegar |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens > Create Token > modelo **Edit Cloudflare Workers**, e adicione a permissão **D1: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare > Workers e Pages, na lateral direita |

A partir daí, todo push na `main` que mexer em `api/` aplica as migrações e publica a API.

### 6. Primeiro acesso

Abra o front. Como não há usuários, a tela pede para criar o **administrador**. Depois, cadastre os outros usuários em **Usuários**.

---

## Rodar localmente

Em dois terminais:

```bash
cd api && npm install && npm run db:migrate:local && npm run dev
```

```bash
cd web && npm install && npm run dev
```

Abra http://localhost:5173. Sem `VITE_API_URL`, o front usa `http://localhost:8787`.

## Estrutura

```
api/
  migrations/      tabelas do banco (D1)
  src/index.ts     rotas da API
  wrangler.toml    configuração do Worker, D1 e R2
web/
  src/pages/       telas (reembolsos, solicitantes, fornecedores, usuários, login)
  src/components/  formulário de reembolso e componentes de interface
  vercel.json      roteamento da SPA
```
