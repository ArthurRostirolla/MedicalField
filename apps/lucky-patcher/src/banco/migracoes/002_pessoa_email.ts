// Migracao 002: e-mail do proprio paciente (espelha clinico.pessoa.email).
export default `
ALTER TABLE pessoa ADD COLUMN email TEXT;
`;
