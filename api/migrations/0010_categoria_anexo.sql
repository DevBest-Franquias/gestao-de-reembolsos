-- Tipo do anexo: nota fiscal/documento de pagamento ou print de cobrança/comprovante de Pix
ALTER TABLE anexos ADD COLUMN categoria TEXT NOT NULL DEFAULT 'documento';
