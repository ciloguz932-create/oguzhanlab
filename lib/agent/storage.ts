import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { AppState, CredentialMetadata } from "./types";

const STATE_KEY = "oguzhanlab.agent.state.v1";
const CREDENTIAL_INDEX_KEY = "oguzhanlab.agent.credentials.v1";
const credentialStorageKey = (id: string) => `oguzhanlab.credential.${id}`;

export const initialAppState = (): AppState => ({
  version: 1,
  initialized: false,
  workspaces: [],
  connections: [],
  runs: [],
  messages: [],
  events: [],
  artifacts: [],
  mcpServers: [],
  permissionPolicies: {
    "global:filesystem.writeMarkdown": "allow",
    "global:text.transform": "allow",
    "global:calculator.evaluate": "allow",
    "global:web.search": "ask",
  },
  offlineMode: false,
  debugMode: false,
});

export class LocalStateRepository {
  async load(): Promise<AppState> {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return initialAppState();
    try {
      return { ...initialAppState(), ...JSON.parse(raw) } as AppState;
    } catch {
      return initialAppState();
    }
  }

  async save(state: AppState): Promise<void> {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STATE_KEY);
  }
}

export class CredentialManager {
  async saveCredential(metadata: CredentialMetadata, value: string): Promise<void> {
    const index = await this.listCredentials();
    const next = [...index.filter((item) => item.id !== metadata.id), metadata];
    await this.writeSecret(credentialStorageKey(metadata.id), value);
    await AsyncStorage.setItem(CREDENTIAL_INDEX_KEY, JSON.stringify(next));
  }

  async getCredential(id: string): Promise<string | null> {
    return this.readSecret(credentialStorageKey(id));
  }

  async deleteCredential(id: string): Promise<void> {
    const index = await this.listCredentials();
    await this.deleteSecret(credentialStorageKey(id));
    await AsyncStorage.setItem(CREDENTIAL_INDEX_KEY, JSON.stringify(index.filter((item) => item.id !== id)));
  }

  async listCredentials(): Promise<CredentialMetadata[]> {
    const raw = await AsyncStorage.getItem(CREDENTIAL_INDEX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as CredentialMetadata[];
    } catch {
      return [];
    }
  }

  private async writeSecret(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      sessionStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  private async readSecret(key: string): Promise<string | null> {
    if (Platform.OS === "web") return sessionStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  }

  private async deleteSecret(key: string): Promise<void> {
    if (Platform.OS === "web") {
      sessionStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  }
}
