export type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
  child: (scope: string) => Logger;
};

export function createLogger(scope = 'qa', minLevel: Level = 'info'): Logger {
  const min = ORDER[minLevel];
  const emit = (level: Level, msg: string, meta?: unknown) => {
    if (ORDER[level] < min) return;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${msg}`;
    const args = meta === undefined ? [line] : [line, meta];
    if (level === 'error') console.error(...args);
    else if (level === 'warn') console.warn(...args);
    else console.log(...args);
  };
  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (childScope: string) => createLogger(`${scope}:${childScope}`, minLevel),
  };
}
