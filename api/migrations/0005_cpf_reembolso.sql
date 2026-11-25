-- CPF do solicitante registrado em cada reembolso
ALTER TABLE reembolsos ADD COLUMN solicitante_cpf TEXT NOT NULL DEFAULT '';

-- Preenche os reembolsos antigos com o CPF do cadastro, quando houver
UPDATE reembolsos SET solicitante_cpf = (SELECT cpf FROM solicitantes s WHERE s.id = reembolsos.solicitante_id)
WHERE solicitante_id IS NOT NULL AND EXISTS (SELECT 1 FROM solicitantes s WHERE s.id = reembolsos.solicitante_id AND s.cpf <> '');
