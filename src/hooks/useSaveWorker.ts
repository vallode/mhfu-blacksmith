"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CharacterResult {
  name: string;
  sex: "Male" | "Female";
  zenny: number;
  equipTotal: number;
  equipCounts: Record<string, number>;
  itemChest: { id: number; qty: number }[];
  itemPouch: { id: number; qty: number }[];
}

export interface WorkerResult {
  ok: true;
  characters: (CharacterResult | null)[];
  decrypted: boolean;
}

export interface WorkerError {
  ok: false;
  error: string;
}

type WorkerMessage = WorkerResult | WorkerError;

export type Region = "us" | "eu" | "jp";

interface UseSaveWorkerReturn {
  parse: (buffer: ArrayBuffer, region: Region) => void;
  result: WorkerResult | null;
  error: string | null;
  loading: boolean;
}

export function useSaveWorker(): UseSaveWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [result, setResult] = useState<WorkerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const worker = new Worker("/javascript/save-worker.js", { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      setLoading(false);
      const msg = e.data;
      if (msg.ok) {
        setResult(msg);
        setError(null);
      } else {
        setError(msg.error);
        setResult(null);
      }
    };

    worker.onerror = (e) => {
      setLoading(false);
      setError(e.message ?? "Worker error");
    };

    return () => worker.terminate();
  }, []);

  const parse = useCallback((buffer: ArrayBuffer, region: Region) => {
    if (!workerRef.current) return;
    setLoading(true);
    setError(null);
    setResult(null);
    workerRef.current.postMessage({ buffer, region }, [buffer]);
  }, []);

  return { parse, result, error, loading };
}
