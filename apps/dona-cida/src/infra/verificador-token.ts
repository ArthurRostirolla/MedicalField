import { claimsSchema, type Claims } from '@medicalfield/contratos';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { ErroAplicacao } from '../dominio/erros.ts';

/** Erros do `jose` que significam "o token nao vale" (os demais sao falha ao buscar a chave). */
const TOKEN_INVALIDO = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
];

/**
 * Valida o access token sozinho (assinatura EdDSA, `iss`, `exp`) com a chave publica do MikeBaguncinha.
 * O JWKS fica em cache por 5 min; `kid` desconhecido dispara nova busca (no maximo uma a cada 5 s).
 */
export class VerificadorToken {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(jwksUrl: string) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: 5 * 60_000,
      cooldownDuration: 5_000,
      timeoutDuration: 5_000,
    });
  }

  /**
   * @throws ErroAplicacao `NAO_AUTENTICADO` se o token nao vale; `SERVICO_INDISPONIVEL` se o JWKS nao responde
   */
  async verificar(token: string): Promise<Claims> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: 'medicalfield', algorithms: ['EdDSA'] });
      const claims = claimsSchema.safeParse(payload);
      if (!claims.success) throw new errors.JWTInvalid('claims fora do contrato');
      return claims.data;
    } catch (erro) {
      if (TOKEN_INVALIDO.some((classe) => erro instanceof classe)) {
        throw new ErroAplicacao('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.');
      }
      throw new ErroAplicacao('SERVICO_INDISPONIVEL', 'Serviço de identidade indisponível.');
    }
  }
}
