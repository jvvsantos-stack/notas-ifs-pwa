/**
 * Composição determinística das credenciais reais enviadas ao Supabase
 * Auth, a partir do SIAPE e do PIN de 4 dígitos que o professor vê e
 * digita na interface. Nenhuma dessas transformações é exposta na UI —
 * o professor só lida com SIAPE + PIN.
 */

/**
 * Converte a matrícula SIAPE num e-mail sintético com TLD válido.
 *
 * O Supabase Auth valida o formato do e-mail e rejeita domínios sem um
 * TLD reconhecido (ex: `@ifs.local` retorna "Email address is invalid").
 * `@ifs.edu.br` é aceito por ter uma extensão válida — e, por coincidência
 * proposital, é o domínio real usado pelos Institutos Federais brasileiros,
 * então o endereço sintético ainda faz sentido semântico mesmo não
 * recebendo e-mails de verdade (a confirmação de e-mail deve ficar
 * desativada no painel do Supabase — ver README).
 */
export function formatSiapeToEmail(siape: string): string {
  return `${siape.trim()}@ifs.edu.br`;
}

/**
 * O Supabase Auth exige senha com no mínimo 6 caracteres (limite da
 * plataforma, não configurável abaixo disso). Como a UI pede um PIN de
 * apenas 4 dígitos por rapidez, a senha real enviada ao Supabase inclui
 * o SIAPE como parte da composição — não apenas um prefixo fixo — para
 * que dois professores com o mesmo PIN (ex: ambos escolhem "1234")
 * continuem tendo senhas efetivas diferentes.
 */
export function formatPinToPassword(siape: string, pin: string): string {
  return `${siape.trim()}-${pin}`;
}
