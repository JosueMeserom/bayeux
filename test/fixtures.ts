import type { FxPhoto, FxStatus } from '../src/fx.js';

const photo = (width: number, height: number, i = 0): FxPhoto => ({
  type: 'photo',
  id: `p${i}`,
  url: `https://pbs.twimg.com/media/fake${i}.jpg?name=orig`,
  width,
  height,
});

export function statusWith(
  dims: [number, number][],
  extra: { videos?: number; gifPhotos?: number } = {},
): FxStatus {
  const photos = dims.map(([w, h], i) => photo(w, h, i));
  for (let i = 0; i < (extra.gifPhotos ?? 0); i++) {
    photos.push({ ...photo(400, 400, 90 + i), type: 'gif' });
  }
  return {
    id: '1234567890123456789',
    url: 'https://x.com/autor/status/1234567890123456789',
    text: 'texto del post',
    // Contadores y fecha del post real de @Momotexx, para no inventar cifras.
    created_timestamp: 1787689213,
    replies: 55,
    reposts: 1519,
    likes: 18115,
    views: 168241,
    author: {
      name: 'Autora Ejemplo',
      screen_name: 'autor',
      avatar_url: 'https://pbs.twimg.com/profile_images/1/a_200x200.jpg',
    },
    media: {
      photos,
      videos: Array.from({ length: extra.videos ?? 0 }, () => ({
        type: 'video' as const,
        url: 'https://video.twimg.com/fake.mp4',
        width: 1280,
        height: 720,
      })),
    },
  };
}

/** Dimensiones reales verificadas contra la API, no inventadas. */
export const REAL = {
  // https://x.com/Momotexx/status/2092346331436024233 — 3 fotos idénticas
  momote: [
    [841, 1277],
    [841, 1277],
    [841, 1277],
  ] as [number, number][],
  // https://x.com/makokoto8/status/2095001889784164697 — misma altura, anchos distintos
  makokoto: [
    [410, 1206],
    [409, 1206],
    [407, 1206],
    [406, 1206],
  ] as [number, number][],
};
