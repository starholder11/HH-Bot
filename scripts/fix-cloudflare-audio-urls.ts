import { listSongs, saveSong } from '@/lib/song-storage';

function encodePath(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname
      .split('/')
      .map(p => encodeURIComponent(p))
      .join('/');
    return u.toString();
  } catch {
    return url;
  }
}

(async () => {
  const songs = await listSongs();
  let fixed = 0;
  for (const song of songs) {
    const old = song.cloudflare_url;
    if (old && decodeURIComponent(old) === old) {
      const encoded = encodePath(old);
      song.cloudflare_url = encoded;
      await saveSong(song.id, song);
      fixed++;
      console.log('fixed', song.filename);
    }
  }
  console.log('total fixed', fixed);
})();
