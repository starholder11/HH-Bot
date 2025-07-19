import { parseBuffer } from 'music-metadata';

export interface MP3Metadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  duration?: number; // in seconds
  bitrate?: number;
  format?: string;
}

export async function extractMP3Metadata(buffer: Buffer, filename: string): Promise<MP3Metadata> {
  try {
    const metadata = await parseBuffer(buffer);

    // Extract title with priority: MP3 metadata > filename > "Untitled"
    let title = metadata.common.title?.trim();
    if (!title) {
      // Use filename without extension as fallback
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
      title = nameWithoutExt || "Untitled";
    }

    return {
      title,
      artist: metadata.common.artist?.trim() || undefined,
      album: metadata.common.album?.trim() || undefined,
      year: metadata.common.year || undefined,
      duration: metadata.format.duration ? Math.round(metadata.format.duration) : undefined,
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate) : undefined,
      format: metadata.format.container || undefined,
    };
  } catch (error) {
    console.error('Error extracting MP3 metadata:', error);

    // Fallback to filename-based title if metadata extraction fails
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    return {
      title: nameWithoutExt || "Untitled",
    };
  }
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return "Unknown";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
