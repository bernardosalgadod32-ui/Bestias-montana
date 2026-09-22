export const RECOVERY_STORAGE_KEY = 'bestias-password-recovery';
export const EXPIRED_LINK_MESSAGE = 'Este enlace venció o ya fue utilizado. Solicita un nuevo correo de recuperación o de confirmación.';

type AuthLink = { recovery: boolean; callback: boolean; error: string };
const callbackKeys = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_in', 'expires_at', 'token_type', 'type', 'code', 'error', 'error_code', 'error_description'];

// Return only UI state. Never retain tokens or provider-supplied error descriptions.
export function readAuthLink(href: string): AuthLink {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const value = (key: string) => hash.get(key) ?? url.searchParams.get(key);
  const hasError = Boolean(value('error') || value('error_code') || value('error_description'));
  return {
    recovery: value('type') === 'recovery' && Boolean(value('access_token') && value('refresh_token')) && !hasError,
    callback: callbackKeys.some(key => hash.has(key) || url.searchParams.has(key)),
    error: hasError ? EXPIRED_LINK_MESSAGE : '',
  };
}

export function cleanAuthUrl(href: string): string {
  const url = new URL(href);
  for (const key of callbackKeys) url.searchParams.delete(key);
  url.hash = '';
  return `${url.pathname}${url.search}`;
}

export function recoveryUserAfterEvent(event: string, current: string | null, userId: string | null): string | null {
  if (event === 'SIGNED_OUT' || !userId) return null;
  if (event === 'PASSWORD_RECOVERY') return userId;
  return current === userId || current === 'pending' ? userId : null;
}

export function readRecoveryUser(): string | null {
  try { return window.sessionStorage.getItem(RECOVERY_STORAGE_KEY); } catch { return null; }
}

export function writeRecoveryUser(userId: string | null): void {
  try {
    if (userId) window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, userId);
    else window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch { /* The active page still handles recovery when storage is unavailable. */ }
}

export function passwordValidation(password: string, confirmation: string): string {
  if (password.length < 8) return 'Usa al menos 8 caracteres para tu nueva contraseña.';
  if (password !== confirmation) return 'Las contraseñas no coinciden.';
  return '';
}

export function authErrorMessage(error: unknown): string {
  const value = error && typeof error === 'object' ? error as { code?: string; status?: number; name?: string } : {};
  switch (value.code) {
    case 'invalid_credentials': return 'El correo o la contraseña no son correctos.';
    case 'email_not_confirmed': return 'Confirma tu correo antes de entrar. Puedes solicitar otro correo de confirmación aquí.';
    case 'otp_expired': case 'otp_disabled': case 'flow_state_expired': case 'flow_state_not_found': return EXPIRED_LINK_MESSAGE;
    case 'same_password': return 'Elige una contraseña diferente de la anterior.';
    case 'weak_password': return 'La contraseña no cumple los requisitos de seguridad. Usa una contraseña más larga y difícil de adivinar.';
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Se enviaron demasiadas solicitudes. Espera unos minutos antes de intentarlo de nuevo.';
    case 'email_address_invalid': case 'validation_failed': return 'Revisa el correo y los datos que escribiste.';
    case 'email_address_not_authorized': return 'El envío de correo aún no está habilitado para esta dirección. Contacta al administrador del equipo.';
    case 'signup_disabled': case 'email_provider_disabled': return 'El registro con correo no está disponible en este momento.';
    case 'session_not_found': case 'session_expired': case 'refresh_token_not_found': return 'La sesión venció. Solicita otro enlace de recuperación o vuelve a entrar.';
  }
  if (value.status === 429) return 'Espera unos minutos antes de intentarlo de nuevo.';
  if (value.name === 'AuthImplicitGrantRedirectError') return EXPIRED_LINK_MESSAGE;
  return 'No se pudo completar la solicitud. Revisa tu conexión e inténtalo de nuevo.';
}
