import { useEffect, useState, type SetStateAction, type Dispatch } from "react";

export function readPersistentValue<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readPersistentValue(key, initial));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[Storage] Could not persist ${key}`, error);
    }
  }, [key, value]);

  return [value, setValue];
}
