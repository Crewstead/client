import type {
  ImageShape,
  LocalImageServer,
  MachineActionResult,
  ProjectAction,
} from '@crewstead/core/protocol';

/**
 * Image servers running on this computer (docs/plan/34-images.md "On the owner's computer"): found at
 * their usual local addresses, called only on this computer. stable-diffusion.cpp's sd-server speaks
 * OpenAI's Images API; Automatic1111 and Forge (started with --api) their own.
 */
const CANDIDATES: (LocalImageServer & { probe: string })[] = [
  {
    kind: 'openai',
    url: 'http://127.0.0.1:1234',
    label: 'stable-diffusion.cpp',
    probe: '/v1/models',
  },
  {
    kind: 'a1111',
    url: 'http://127.0.0.1:7860',
    label: 'Stable Diffusion web UI',
    probe: '/sdapi/v1/sd-models',
  },
];

const SIZES: Record<ImageShape, [number, number]> = {
  square: [1024, 1024],
  portrait: [832, 1216],
  landscape: [1216, 832],
};

type LocalAction = Extract<ProjectAction, { kind: 'local_images' | 'local_image_generate' }>;
export const isLocalImageAction = (action: ProjectAction): action is LocalAction =>
  action.kind === 'local_images' || action.kind === 'local_image_generate';

async function json(url: string, init: RequestInit, signal: AbortSignal) {
  const response = await fetch(url, { ...init, signal });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      String((body.error as { message?: string })?.message ?? body.detail ?? body.error ?? '') ||
        `The image server answered ${response.status}.`,
    );
  return body;
}

/** Servers that answer now; quickly, so a stopped one costs little. */
async function find(): Promise<LocalImageServer[]> {
  const found = await Promise.all(
    CANDIDATES.map(async ({ probe, ...server }) => {
      const response = await fetch(`${server.url}${probe}`, {
        signal: AbortSignal.timeout(800),
      }).catch(() => undefined);
      return response?.ok ? server : undefined;
    }),
  );
  return found.filter((server) => server !== undefined);
}

async function generate(action: Extract<LocalAction, { kind: 'local_image_generate' }>) {
  const known = CANDIDATES.find(
    (c) => c.url === action.server.url && c.kind === action.server.kind,
  );
  // Only the addresses this computer looks at itself, never one the hub names.
  if (!known) throw new Error('Unknown image server.');
  const [width, height] = SIZES[action.shape];
  const signal = AbortSignal.timeout(10 * 60_000);
  const prompt = action.transparent
    ? `${action.prompt}, plain background, isolated subject`
    : action.prompt;
  if (known.kind === 'openai') {
    const body = await json(
      `${known.url}/v1/images/generations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, n: 1, size: `${width}x${height}`, output_format: 'png' }),
      },
      signal,
    );
    const data = (body.data ?? []) as { b64_json?: string }[];
    return data.filter((d) => d.b64_json).map((d) => ({ type: 'image/png', data: d.b64_json! }));
  }
  const reference = action.references[0];
  const body = await json(
    `${known.url}/sdapi/v1/${reference ? 'img2img' : 'txt2img'}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        width,
        height,
        steps: 28,
        batch_size: 1,
        ...(reference ? { init_images: [reference.data], denoising_strength: 0.6 } : {}),
      }),
    },
    signal,
  );
  return ((body.images ?? []) as string[]).map((data) => ({ type: 'image/png', data }));
}

export async function localImages(
  action: LocalAction,
): Promise<Omit<MachineActionResult, 'requestId'>> {
  if (action.kind === 'local_images') return { imageServers: await find() };
  return { images: await generate(action) };
}
