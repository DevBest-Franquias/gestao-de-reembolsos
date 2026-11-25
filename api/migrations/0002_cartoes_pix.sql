-- Chave Pix para reembolso e cartões dos solicitantes
ALTER TABLE solicitantes ADD COLUMN chave_pix TEXT NOT NULL DEFAULT '';

CREATE TABLE cartoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitante_id INTEGER NOT NULL REFERENCES solicitantes(id) ON DELETE CASCADE,
  final TEXT NOT NULL,
  comprovante_chave_r2 TEXT,
  comprovante_nome TEXT,
  comprovante_tamanho INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cartoes_solicitante ON cartoes(solicitante_id);
