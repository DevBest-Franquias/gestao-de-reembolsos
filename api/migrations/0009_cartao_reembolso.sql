-- Cartão usado no reembolso (cópia dos dados do cadastro no momento do registro)
ALTER TABLE reembolsos ADD COLUMN cartao_id INTEGER;
ALTER TABLE reembolsos ADD COLUMN cartao_final TEXT NOT NULL DEFAULT '';
ALTER TABLE reembolsos ADD COLUMN cartao_comprovante_chave_r2 TEXT;
ALTER TABLE reembolsos ADD COLUMN cartao_comprovante_nome TEXT;
ALTER TABLE reembolsos ADD COLUMN cartao_comprovante_tamanho INTEGER;
