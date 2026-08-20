import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { makeId, sanitizeFileName } from "./security";
import type { Artifact } from "./types";

const contentKey = (id: string) => `oguzhanlab.artifact.${id}`;

export class ArtifactStore {
  async writeMarkdown(workspaceId: string, taskId: string, requestedName: string, content: string): Promise<Artifact> {
    const id = makeId("artifact");
    const name = sanitizeFileName(requestedName, "agent-output.md");
    const now = new Date().toISOString();
    let uri: string | undefined;
    if (Platform.OS !== "web" && FileSystem.documentDirectory) {
      const directory = `${FileSystem.documentDirectory}oguzhanlab/${workspaceId}/outputs/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      uri = `${directory}${id}-${name}`;
      await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    } else {
      await AsyncStorage.setItem(contentKey(id), content);
    }
    return { id, workspaceId, taskId, name, kind: "markdown", uri, preview: content.slice(0, 360), size: new TextEncoder().encode(content).length, createdAt: now };
  }

  async read(artifact: Artifact): Promise<string> {
    if (artifact.uri && Platform.OS !== "web") return FileSystem.readAsStringAsync(artifact.uri, { encoding: FileSystem.EncodingType.UTF8 });
    return (await AsyncStorage.getItem(contentKey(artifact.id))) ?? artifact.preview;
  }
}
