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

### 1. API no Cloudflare, pelo GitHub

Em **GitHub > Settings > Secrets and variables > Actions**:

**Secrets** (aba Secrets):

| Nome | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token do Cloudflare com **Workers Scripts: Edit**, **D1: Edit**, **Workers R2 Storage: Edit** e **Account Settings: Read** (o modelo **Edit Cloudflare Workers** + D1 e R2 resolve) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare > Workers e Pages, na lateral direita |

**Variables** (aba Variables):

| Nome | Valor |
|---|---|
| `FRONT_URLS` | Endereço do front na Vercel, por exemplo `https://reembolsos.vercel.app`. Vários separados por vírgula. Pode deixar para depois do passo 2. |

Depois vá em **Actions > Deploy da API (Cloudflare) > Run workflow**. O workflow:

1. Cria o banco D1 `reembolsos`, se ainda não existir
2. Cria o bucket R2 `reembolsos-anexos`, se ainda não existir
3. Cria ou atualiza as tabelas
4. Publica a API

No log do passo **Publicar Worker** aparece o endereço da API, algo como `https://reembolsos-api.SEU-SUBDOMINIO.workers.dev`.

A partir daí, todo push na `main` que mexer em `api/` publica a API de novo.

### 2. Front na Vercel

1. Na Vercel, **Add New > Project** e importe este repositório
2. **Root Directory:** `web`
3. **Framework:** Vite (detectado sozinho)
4. Em **Environment Variables**, crie `VITE_API_URL` com o endereço da API do passo 1
5. Deploy

### 3. Liberar o front na API

Coloque o endereço que a Vercel gerou na variável `FRONT_URLS` do GitHub (passo 1) e rode o workflow de novo. Sem isso, o navegador bloqueia as chamadas do front para a API.

### 4. Primeiro acesso

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
