const STUDIO_COVERS = [
  "https://images.unsplash.com/photo-1756489947258-b7774b7671ff?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1200",
  "https://images.unsplash.com/photo-1693066867835-970840dad310?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
  "https://images.unsplash.com/photo-1774371337495-a49be79cdd2c?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
  "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1200",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1200",
  "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1200",
];

const COVER_INDEX: Record<string, number> = {
  technology: 0,
  business: 1,
  education: 2,
  entertainment: 1,
  news: 2,
  other: 0,
};

function getSeed(value: string) {
  return [...value].reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 0);
}

export function getShowCover(category: string, showId: string) {
  const categoryOffset = COVER_INDEX[category.toLowerCase()] ?? 0;
  return STUDIO_COVERS[(categoryOffset + getSeed(showId)) % STUDIO_COVERS.length];
}
