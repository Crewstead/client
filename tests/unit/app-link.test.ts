import { expect, it } from 'vitest';
import { appLink, type AppLink } from '../../daemon/src/app-link.ts';

it('asks and answers both ways, passes errors on, and fails what waits when the other side goes', async () => {
  // Each side sends to the other, so both are made before either sends.
  const sides: { app?: AppLink; service?: AppLink } = {};
  const app = (sides.app = appLink(
    (message) => queueMicrotask(() => sides.service!.receive(message)),
    (op, args) => {
      if (op === 'browser-open') return `about:blank#${(args as { owner: string }).owner}`;
      throw new Error('No such request.');
    },
  ));
  const service = (sides.service = appLink(
    (message) => queueMicrotask(() => sides.app!.receive(message)),
    async (op) => (op === 'browser-current' ? 'TARGET' : undefined),
  ));
  expect(await service.ask('browser-open', { owner: 'chat#b1' })).toBe('about:blank#chat#b1');
  expect(await app.ask('browser-current', { key: 'chat#b1' })).toBe('TARGET');
  await expect(service.ask('nothing')).rejects.toThrow('No such request.');
  // Messages that are not the link's are ignored.
  app.receive('noise');
  app.receive({ answer: 999, value: 1 });

  const silent = appLink(
    () => {},
    () => undefined,
  );
  const waiting = silent.ask('browser-open');
  silent.drop();
  await expect(waiting).rejects.toThrow('went away');
  await expect(
    appLink(
      () => {},
      () => undefined,
    ).ask('x', undefined, 20),
  ).rejects.toThrow('No answer');
});
