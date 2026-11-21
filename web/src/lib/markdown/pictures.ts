import { getContext, setContext } from 'svelte';
import type { Attachment } from '@crewstead/core/protocol';
import { request } from '../api';

/**
 * Pictures a reply shows inline, `![caption](src)`: the hub finds one already in the chat by its name,
 * or fetches the file from the chat's computer once and keeps it in the chat.
 */
export class ChatPictures {
  private found = new Map<string, Promise<Attachment>>();
  constructor(private session: () => string | undefined) {}

  find(src: string): Promise<Attachment> {
    const id = this.session();
    if (!id) return Promise.reject(new Error('Not in a chat.'));
    const key = `${id}\n${src}`;
    let picture = this.found.get(key);
    if (!picture) {
      picture = request<{ picture: Attachment }>(`/sessions/${id}/pictures`, {
        method: 'POST',
        body: JSON.stringify({ src }),
      }).then((answer) => answer.picture);
      // A failure is tried again next time (the computer may be back).
      picture.catch(() => this.found.delete(key));
      this.found.set(key, picture);
    }
    return picture;
  }
}

const key = Symbol('pictures');
export const providePictures = (pictures: ChatPictures) => setContext(key, pictures);
/** The chat's pictures, where a chat page provides them (absent in plans and elsewhere). */
export const usePictures = () => getContext<ChatPictures | undefined>(key);
