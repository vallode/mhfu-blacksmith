"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EquipSlot } from "@/lib/save-store";

export interface CharacterResult {
  name: string;
  sex: "Male" | "Female";
  zenny: number;
  /** Total play time in seconds. */
  playTime: number;
  hunterRank: number;
  /** Used equipment box slots, in box order. */
  equipBox: EquipSlot[];
  itemChest: { id: number; qty: number }[];
  itemPouch: { id: number; qty: number }[];
}

export interface WorkerResult {
  ok: true;
  characters: (CharacterResult | null)[];
  decrypted: boolean;
  /** The region whose keys decrypted the save (US and EU share keys, so EU reports as "us"). */
  region: Region;
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

/**
 * One-off, promise-based parse for callers that aren't React components
 * (e.g. a background sync running from a context on tab focus) and don't
 * need the persistent worker + streaming state that useSaveWorker provides.
 */
export function parseSaveBuffer(buffer: ArrayBuffer, region: Region): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/javascript/save-worker.js", { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      worker.terminate();
      const msg = e.data;
      if (msg.ok) resolve(msg);
      else reject(new Error(msg.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message ?? "Worker error"));
    };
    worker.postMessage({ buffer, region }, [buffer]);
  });
}
