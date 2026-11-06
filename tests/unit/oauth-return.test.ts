import { afterAll, expect, it } from 'vitest';
import { closeReturn, openReturn, PORT } from '../../desktop/src/oauth-return.ts';

afterAll(() => closeReturn());

it('forwards a sign-in answer on localhost to the hub’s own return page, and nothing else', async () => {
  expect(await openReturn('https://hub.example')).toBe(PORT);
  // A second sign-in reuses the open page.
  expect(await openReturn('https://hub.example')).toBe(PORT);
  const back = await fetch(`http://127.0.0.1:${PORT}/mcp-oauth/callback?code=abc&state=xyz`, {
    redirect: 'manual',
  });
  expect(back.status).toBe(302);
  expect(back.headers.get('location')).toBe(
    'https://hub.example/api/mcp-oauth/callback?code=abc&state=xyz',
  );
  const other = await fetch(`http://127.0.0.1:${PORT}/anything`, { redirect: 'manual' });
  expect(other.status).toBe(404);
  closeReturn();
  await expect(fetch(`http://127.0.0.1:${PORT}/mcp-oauth/callback`)).rejects.toThrow();
});
