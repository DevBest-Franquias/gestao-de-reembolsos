-- Como o solicitante pagou a despesa: pix ou cartao
ALTER TABLE reembolsos ADD COLUMN meio_pagamento TEXT NOT NULL DEFAULT '';
UPDATE reembolsos SET meio_pagamento = 'cartao' WHERE cartao_final <> '';
