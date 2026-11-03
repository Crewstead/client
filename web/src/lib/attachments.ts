import type { Attachment } from '@crewstead/core/protocol';
import { accountHeaders, apiUrl, csrfHeaders } from './auth/connection.ts';

/** Uploads one file for the next message; the hub checks what it is and returns it. */
export async function uploadAttachment(file: File, signal?: AbortSignal): Promise<Attachment> {
  const response = await fetch(apiUrl('/attachments'), {
    method: 'POST',
    credentials: 'include',
    redirect: 'error',
    headers: {
      ...accountHeaders(),
      ...csrfHeaders(),
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'pasted image.png'),
    },
    body: file,
    ...(signal ? { signal } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 413 && !body.message)
    throw new Error('That file is too large. Documents can be up to 20 MB, images up to 5 MB.');
  if (!response.ok) throw new Error(body.message ?? `Upload failed (${response.status})`);
  return body as Attachment;
}

/**
 * A local address for a file in a chat. Files are fetched with the account's headers (an image tag
 * cannot send them), then kept for this page's life: a file never changes once saved.
 */
const urls = new Map<string, Promise<string>>();
export function attachmentUrl(id: string): Promise<string> {
  let url = urls.get(id);
  if (!url) {
    url = fetch(apiUrl(`/attachments/${id}`), {
      credentials: 'include',
      redirect: 'error',
      headers: accountHeaders(),
    }).then(async (response) => {
      if (!response.ok) throw new Error('This file is no longer available.');
      return URL.createObjectURL(await response.blob());
    });
    url.catch(() => urls.delete(id));
    urls.set(id, url);
  }
  return url;
}

export const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
