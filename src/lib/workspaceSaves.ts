export const WORKSPACE_SAVES_KEY = 'freeform.workspace.saves.v1';
export const MAX_WORKSPACE_SAVES = 10;

export interface WorkspaceSave {
  id: string;
  name: string;
  savedAt: string;
  content: string;
}

export interface WorkspaceSaveInput {
  id?: string;
  name: string;
  content: string;
}

function isSave(value: unknown): value is WorkspaceSave {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.name === 'string' && candidate.name.trim().length > 0
    && typeof candidate.savedAt === 'string' && Number.isFinite(Date.parse(candidate.savedAt))
    && typeof candidate.content === 'string';
}

export function readWorkspaceSaves(content: string | null): WorkspaceSave[] {
  if (!content) return [];
  try {
    const value: unknown = JSON.parse(content);
    if (!Array.isArray(value)) return [];
    return value.filter(isSave).slice(0, MAX_WORKSPACE_SAVES).map((save) => ({
      ...save,
      name: save.name.trim(),
    }));
  } catch {
    return [];
  }
}

export function serializeWorkspaceSaves(saves: WorkspaceSave[]): string {
  return JSON.stringify(saves.slice(0, MAX_WORKSPACE_SAVES));
}

export function putWorkspaceSave(
  saves: WorkspaceSave[],
  input: WorkspaceSaveInput,
  now = new Date(),
): WorkspaceSave[] {
  const name = input.name.trim();
  if (!name) throw new Error('Enter a name for this workspace save.');
  if (input.id && !saves.some((save) => save.id === input.id)) {
    throw new Error('The selected save slot no longer exists.');
  }
  if (!input.id && saves.length >= MAX_WORKSPACE_SAVES) {
    throw new Error(`All ${MAX_WORKSPACE_SAVES} save slots are used. Overwrite or delete a saved workspace first.`);
  }

  const saved: WorkspaceSave = {
    id: input.id ?? crypto.randomUUID(),
    name,
    savedAt: now.toISOString(),
    content: input.content,
  };
  return [saved, ...saves.filter((save) => save.id !== saved.id)];
}

export function removeWorkspaceSave(saves: WorkspaceSave[], id: string): WorkspaceSave[] {
  return saves.filter((save) => save.id !== id);
}
