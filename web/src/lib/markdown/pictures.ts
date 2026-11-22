import { getContext, setContext } from 'svelte';
import type { Attachment } from '@crewstead/core/protocol';
import { request } from '../api';

/**
 * Pictures a reply shows inline, `![caption](src)`: the hub finds one already in the chat by its name,
 * or fetches the file from the chat's computer and keeps it for that reply, so a later reply showing
 * the same file after it changed shows it as it is then.
 */
export class ChatPictures {
  private found = new Map<string, Promise<Attachment>>();
  constructor(private session: () => string | undefined) {}

  /** `item`: the reply that shows it. */
  find(src: string, item?: string): Promise<Attachment> {
    const id = this.session();
    if (!id) return Promise.reject(new Error('Not in a chat.'));
    const key = `${id}\n${item ?? ''}\n${src}`;
    let picture = this.found.get(key);
    if (!picture) {
      picture = request<{ picture: Attachment }>(`/sessions/${id}/pictures`, {
        method: 'POST',
        body: JSON.stringify({ src, ...(item ? { item } : {}) }),
      }).then((answer) => answer.picture);
      // A failure is tried again next time (the computer may be back).
      picture.catch(() => this.found.delete(key));
      this.found.set(key, picture);
    }
    return picture;
  }
}

const owner = Symbol('picture owner');
/** The reply whose text this is, for the pictures it shows. */
export const providePictureOwner = (item: string) => setContext(owner, item);
export const usePictureOwner = () => getContext<string | undefined>(owner);

const key = Symbol('pictures');
export const providePictures = (pictures: ChatPictures) => setContext(key, pictures);
/** The chat's pictures, where a chat page provides them (absent in plans and elsewhere). */
export const usePictures = () => getContext<ChatPictures | undefined>(key);
