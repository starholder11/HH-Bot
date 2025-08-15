export function stripCircularDescription(raw: string, context?: { id?: string; title?: string; type?: string }): string {
  if (!raw) return '';
  let text = String(raw);

  // Aggressive cleanup for keyframes/video
  const isVideoLike = /video|keyframe|frame/i.test(context?.type || '') || /keyframe|frame/i.test(context?.id || '')
  if (isVideoLike) {
    text = text
      .replace(/^Project:\s*[^.]+\.[^.]*\./gim, '')
      .replace(/^The (video|image|frame) (depicts?|shows?)[^.]+\.[^.]*\./gim, '')
      .replace(/\bThis (?:video|image|frame) (?:is|shows|depicts)[^.!?]*[.!?]/gim, '')
      .replace(/\((?:key)?frame\s*\d+\)/gim, '')
      .replace(/(?:Description|Summary):\s*/gim, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Remove repeated title
  const title = (context?.title || '').trim();
  if (title) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`^${escaped}[:\-\s]*`, 'i'), '').trim();
  }

  return text;
}



