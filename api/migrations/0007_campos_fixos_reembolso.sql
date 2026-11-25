-- Dados de pagamento registrados em cada reembolso (cópia do cadastro no momento do registro)
ALTER TABLE reembolsos ADD COLUMN chave_pix TEXT NOT NULL DEFAULT '';
ALTER TABLE reembolsos ADD COLUMN banco TEXT NOT NULL DEFAULT '';
ALTER TABLE reembolsos ADD COLUMN agencia TEXT NOT NULL DEFAULT '';
ALTER TABLE reembolsos ADD COLUMN conta TEXT NOT NULL DEFAULT '';
ALTER TABLE reembolsos ADD COLUMN empresa_pagadora TEXT NOT NULL DEFAULT '';
ALTER TABLE reembolsos ADD COLUMN multiplos_centros_custo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reembolsos ADD COLUMN centro_custo TEXT NOT NULL DEFAULT '';
