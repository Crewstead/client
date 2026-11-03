import type { Project, Session } from '@crewstead/core/protocol';

type Chat = Omit<Session, 'items'>;

/** The id the cloud goes by in the left panel; chats there have no project. */
export const CLOUD = 'cloud';

/** One "where" in the left panel: the cloud, a computer as a whole, or a project folder. */
export interface Place {
  id: string;
  name: string;
  kind: 'cloud' | 'computer' | 'project';
  /** The computer it is on; none for the cloud. */
  machine?: string;
  chats: Chat[];
  /** When one of its chats last changed, to list the busiest places first. */
  latest: string;
}

/**
 * Every place: each project and whole computer the hub knows (with or without chats), places only past
 * chats name (a computer that is offline or removed), and the cloud. In the owner's own order once
 * they arranged it (places added since go after, busiest first); until then busiest first, the cloud
 * last. Chats keep the order given, pinned first.
 */
export function placesOf(chats: Chat[], projects: Project[], order: string[] = []): Place[] {
  const places = new Map<string, Place>();
  const add = (id: string, saved?: string) => {
    let place = places.get(id);
    if (!place) {
      const known = projects.find((project) => project.id === id);
      const whole = known?.kind === 'computer' || id.endsWith(':computer');
      place = {
        id,
        name: whole ? 'Whole computer' : (known?.name ?? saved ?? 'Project'),
        kind: whole ? 'computer' : 'project',
        machine: known?.machine ?? 'Offline computer',
        chats: [],
        latest: '',
      };
      places.set(id, place);
    }
    return place;
  };
  for (const project of projects) add(project.id);
  const cloud: Place = { id: CLOUD, name: 'Cloud', kind: 'cloud', chats: [], latest: '' };
  for (const chat of chats) {
    const place = chat.projectId ? add(chat.projectId, chat.projectName) : cloud;
    place.chats.push(chat);
    if (chat.updatedAt > place.latest) place.latest = chat.updatedAt;
  }
  for (const place of [...places.values(), cloud])
    place.chats.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const listed = [...places.values()].sort(
    (a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name),
  );
  const all = [...listed, cloud];
  if (!order.length) return all;
  const rank = (place: Place) => {
    const at = order.indexOf(place.id);
    return at < 0 ? order.length : at;
  };
  // A stable sort: places not in the saved order keep their busiest-first order after the rest.
  return all.sort((a, b) => rank(a) - rank(b));
}
