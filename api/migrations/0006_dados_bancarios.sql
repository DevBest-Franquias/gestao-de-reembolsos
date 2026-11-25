-- Dados bancários do solicitante
ALTER TABLE solicitantes ADD COLUMN banco TEXT NOT NULL DEFAULT '';
ALTER TABLE solicitantes ADD COLUMN agencia TEXT NOT NULL DEFAULT '';
ALTER TABLE solicitantes ADD COLUMN conta TEXT NOT NULL DEFAULT '';

-- Indica que o fornecedor do reembolso é o próprio solicitante (quem pagou pela empresa)
ALTER TABLE reembolsos ADD COLUMN fornecedor_eh_solicitante INTEGER NOT NULL DEFAULT 0;
