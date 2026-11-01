import { MAX_ATTACHMENTS, type Attachment } from '@crewstead/core/protocol';
import { uploadAttachment } from './attachments.ts';
import { newId } from './ids.ts';

export interface PendingFile {
  key: string;
  name: string;
  /** A preview of an image on this device, before and after upload. */
  preview?: string;
  /** Set once the hub has it. */
  saved?: Attachment;
  error?: string;
  controller: AbortController;
}

/** Files added to the composer: each uploads at once, so sending only names them. */
export class PendingFiles {
  files = $state<PendingFile[]>([]);
  readonly uploading = $derived(this.files.some((file) => !file.saved && !file.error));
  readonly ids = $derived(this.files.flatMap((file) => (file.saved ? [file.saved.id] : [])));
  readonly failed = $derived(this.files.some((file) => file.error));

  /** Adds files; returns a message when some could not be added. */
  add(list: Iterable<File>): string {
    let refused = '';
    for (const file of list) {
      if (this.files.length >= MAX_ATTACHMENTS) {
        refused = `Up to ${MAX_ATTACHMENTS} files per message.`;
        break;
      }
      const entry: PendingFile = {
        key: newId(),
        name: file.name || 'pasted image.png',
        controller: new AbortController(),
        ...(file.type.startsWith('image/') ? { preview: URL.createObjectURL(file) } : {}),
      };
      this.files.push(entry);
      const key = entry.key;
      uploadAttachment(file, entry.controller.signal).then(
        (saved) => this.update(key, { saved }),
        (error: unknown) =>
          this.update(key, {
            error: error instanceof Error ? error.message : 'Upload failed',
          }),
      );
    }
    return refused;
  }

  remove(key: string) {
    const file = this.files.find((entry) => entry.key === key);
    file?.controller.abort();
    if (file?.preview) URL.revokeObjectURL(file.preview);
    this.files = this.files.filter((entry) => entry.key !== key);
  }

  /** After sending: the previews are no longer needed. */
  clear() {
    for (const file of this.files) if (file.preview) URL.revokeObjectURL(file.preview);
    this.files = [];
  }

  private update(key: string, change: Partial<PendingFile>) {
    const index = this.files.findIndex((entry) => entry.key === key);
    if (index >= 0) this.files[index] = { ...this.files[index]!, ...change };
  }
}
