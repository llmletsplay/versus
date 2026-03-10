type EnvRecord = Record<string, unknown>;

function getImportMetaEnv(): EnvRecord | undefined {
  const meta = import.meta as ImportMeta & { env?: EnvRecord };
  return meta?.env;
}

function getProcessEnv(): EnvRecord | undefined {
  const runtimeProcess =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: EnvRecord } }).process
      : undefined;

  return runtimeProcess?.env;
}

export function getEnvValue(name: string): string | undefined {
  const candidates = [name, `VITE_${name}`];
  const importMetaEnv = getImportMetaEnv();

  for (const key of candidates) {
    const value = importMetaEnv?.[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  const processEnv = getProcessEnv();
  for (const key of candidates) {
    const value = processEnv?.[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export function isDevelopmentRuntime(): boolean {
  const importMetaEnv = getImportMetaEnv();
  if (typeof importMetaEnv?.DEV === 'boolean') {
    return importMetaEnv.DEV;
  }

  const mode = typeof importMetaEnv?.MODE === 'string' ? importMetaEnv.MODE : undefined;
  const nodeEnv = getEnvValue('NODE_ENV');

  return mode === 'development' || nodeEnv === 'development';
}

export function isProductionRuntime(): boolean {
  const importMetaEnv = getImportMetaEnv();
  if (typeof importMetaEnv?.PROD === 'boolean') {
    return importMetaEnv.PROD;
  }

  const mode = typeof importMetaEnv?.MODE === 'string' ? importMetaEnv.MODE : undefined;
  const nodeEnv = getEnvValue('NODE_ENV');

  return mode === 'production' || nodeEnv === 'production';
}
