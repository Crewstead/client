let csrf = '';
let selected: string | undefined;
let account = '';
let revision = 0;
const accountKey = 'crewstead-active-account';
export function normalizeServer(input: string) {
  const url = new URL(input.trim());
  // Plain http is allowed for this computer, and for the hub this page itself came from (a
  // development hub opened by its network address); never for another server.
  const local =
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    (typeof location !== 'undefined' && url.origin === location.origin);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use an https:// address, or http:// only for this computer (localhost).');
  return url.href.replace(/\/+$/, '');
}
export function serverUrl() {
  return (selected ??= normalizeServer(
    localStorage.getItem('crewstead-server') ?? location.origin,
  ));
}
export function selectServer(server: string) {
  const normalized = normalizeServer(server);
  localStorage.setItem('crewstead-server', normalized);
  selected = normalized;
}
export function apiUrl(path: string, server = serverUrl()) {
  return `${server}/api${path}`;
}
export function setCsrf(value: string) {
  csrf = value;
  revision++;
}
/** The hub user id requests act as. The hub may hold several signed-in accounts for this browser. */
export function selectAccount(userId: string) {
  account = userId;
  try {
    localStorage.setItem(accountKey, userId);
  } catch {
    // Without storage the hub falls back to its first signed-in account after a reload.
  }
}
export function rememberedAccount() {
  try {
    return localStorage.getItem(accountKey) ?? '';
  } catch {
    return '';
  }
}
export function accountHeaders(userId = account): Record<string, string> {
  return userId ? { 'X-Hub-Account': userId } : {};
}
/** Streams cannot send headers, so they name the account in the query instead. */
export function withAccount(url: string) {
  return account ? `${url}${url.includes('?') ? '&' : '?'}account=${account}` : url;
}
export function transportRevision() {
  return revision;
}
export function csrfHeaders(): Record<string, string> {
  return csrf ? { 'X-Hub-CSRF': csrf } : {};
}
