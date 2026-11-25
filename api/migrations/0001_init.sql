CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);

CREATE TABLE solicitantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  documento TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reembolsos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitante_id INTEGER REFERENCES solicitantes(id) ON DELETE SET NULL,
  solicitante_nome TEXT NOT NULL,
  solicitante_email TEXT NOT NULL,
  fornecedor_novo INTEGER NOT NULL DEFAULT 0,
  fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome TEXT NOT NULL,
  fornecedor_documento TEXT NOT NULL,
  numero_documento TEXT NOT NULL DEFAULT '',
  data_pagamento TEXT,
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL DEFAULT '',
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('boleto', 'cartao_credito', 'pix', 'pix_qr_code')),
  status TEXT NOT NULL DEFAULT 'nao_solicitado' CHECK (status IN ('nao_solicitado', 'solicitado', 'pago')),
  data_reembolso TEXT,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reembolsos_status ON reembolsos(status);

CREATE TABLE anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reembolso_id INTEGER NOT NULL REFERENCES reembolsos(id) ON DELETE CASCADE,
  chave_r2 TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'application/octet-stream',
  tamanho INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_anexos_reembolso ON anexos(reembolso_id);
