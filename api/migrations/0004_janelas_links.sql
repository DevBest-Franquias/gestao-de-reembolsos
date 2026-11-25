-- Janelas de pagamento por mês e links úteis
CREATE TABLE janelas_pagamento (
  mes TEXT PRIMARY KEY,            -- AAAA-MM
  dias TEXT NOT NULL DEFAULT '',   -- dias do mês separados por vírgula, ex.: 1,3,8
  observacao TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE links_uteis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  url TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);

INSERT INTO janelas_pagamento (mes, dias, observacao) VALUES (
  '2026-12',
  '1,3,8,9,14,17,22,23,29,30',
  'Os prazos de envio não mudaram. Favor enviar o quanto antes e com as informações corretas, para facilitar o fluxo operacional da área, evitando erros, demoras e retrabalhos.'
);

INSERT INTO links_uteis (titulo, url, ordem) VALUES
  ('Solicitação de pagamento geral', 'https://crm.hub-bnk.com/marketplace/app/621/', 1),
  ('Solicitação de investidas', 'https://hubsmart.bitrix24.site/solicitacao_pag_investidas/', 2);
