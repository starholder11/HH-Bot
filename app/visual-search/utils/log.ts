const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

function isEnabled(ns: string): boolean {
  if (isProd) return false;
  try {
    const flag = (typeof localStorage !== 'undefined') ? localStorage.getItem('debug') : null;
    if (!flag) return true; // default on in dev
    // support wildcard namespaces like app:* or exact match
    if (flag === '*') return true;
    return flag.split(',').some((token) => {
      token = token.trim();
      if (token.endsWith('*')) return ns.startsWith(token.slice(0, -1));
      return token === ns;
    });
  } catch {
    return !isProd;
  }
}

export function debug(namespace: string, ...args: any[]) {
  if (!isEnabled(namespace)) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[${namespace}]`, ...args);
  } catch {}
}


