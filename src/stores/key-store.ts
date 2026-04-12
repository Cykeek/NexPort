import { create } from "zustand";
import { keyApi } from "@/lib/tauri-api";

export interface KeyInfo {
  id: string;
  name: string;
  keyType: string;
  fingerprint: string;
}

export interface KeyData {
  id: string;
  name: string;
  keyType: string;
  fingerprint: string;
  publicKey: string;
  privateKey?: string;
}

interface KeyStoreState {
  keys: KeyInfo[];
  isLoading: boolean;
  loadKeys: () => Promise<void>;
  saveKey: (name: string, keyType: string, passphrase?: string) => Promise<void>;
  importKey: (name: string, keyData: string) => Promise<void>;
  updateKey: (id: string, name: string) => Promise<void>;
  updateKeyWithNewKey: (id: string, name: string, newKeyData: string) => Promise<void>;
  deleteKey: (id: string) => Promise<void>;
  getKeyData: (id: string) => Promise<KeyData | null>;
}

export const useKeyStore = create<KeyStoreState>()((set, get) => ({
  keys: [],
  isLoading: false,

  loadKeys: async () => {
    set({ isLoading: true });
    try {
      const keys = await keyApi.list();
      set({ keys, isLoading: false });
    } catch (error) {
      console.error("Failed to load keys:", error);
      set({ isLoading: false });
    }
  },

  saveKey: async (name, keyType, passphrase) => {
    const keyInfo = await keyApi.generate(name, keyType, passphrase);
    set((state) => ({
      keys: [...state.keys, keyInfo],
    }));
  },

  importKey: async (name, keyData) => {
    const keyInfo = await keyApi.import(name, keyData);
    set((state) => ({
      keys: [...state.keys, keyInfo],
    }));
  },

  updateKey: async (id, name) => {
    await keyApi.updateName(id, name);
    set((state) => ({
      keys: state.keys.map((k) => (k.id === id ? { ...k, name } : k)),
    }));
  },

  updateKeyWithNewKey: async (id, name, newKeyData) => {
    await keyApi.updateKeyData(id, name, newKeyData);
    const keys = await keyApi.list();
    set({ keys });
  },

  deleteKey: async (id) => {
    await keyApi.delete(id);
    set((state) => ({
      keys: state.keys.filter((k) => k.id !== id),
    }));
  },

  getKeyData: async (id) => {
    try {
      const keyData = await keyApi.getData(id);
      return keyData;
    } catch (error) {
      console.error("Failed to get key data:", error);
      return null;
    }
  },
}));
