import { useCallback, useState, type SetStateAction } from 'react';

export const PROJECTS_LAST_PATH_KEY = 'projects-last-path';
export const EXECUTIONS_LAST_PATH_KEY = 'executions-last-path';

export function safeProjectsPath(path: string): string {
  if (path === '/projects' || /^\/projects\/[a-fA-F0-9]{24}$/.test(path)) return path;
  return '/projects';
}

export function safeExecutionsPath(path: string): string {
  if (path === '/executions' || /^\/executions\/[a-fA-F0-9]{24}$/.test(path)) return path;
  return '/executions';
}

export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as T;
      }
    } catch {
      return initial;
    }
  });

  const setPersisted = useCallback((update: SetStateAction<T>) => {
    setValue((prev) => {
      const next = typeof update === 'function' ? (update as (current: T) => T)(prev) : update;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  return [value, setPersisted] as const;
}
