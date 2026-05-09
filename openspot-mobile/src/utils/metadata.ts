/**
 * Independent metadata utilities to avoid circular dependencies between API and Adapter.
 */

export function sanitizeTitle(title: string, artistName?: string): string {
  if (!title) return '';
  let clean = title
    .replace(/\(Official.*?\)/gi, '')
    .replace(/\[Official.*?\]/gi, '')
    .replace(/\(Video.*?\)/gi, '')
    .replace(/\[Video.*?\]/gi, '')
    .replace(/\(Audio.*?\)/gi, '')
    .replace(/\[Audio.*?\]/gi, '')
    .replace(/\(Lyrics.*?\)/gi, '')
    .replace(/\[Lyrics.*?\]/gi, '')
    .replace(/\(HD.*?\)/gi, '')
    .replace(/\[HD.*?\]/gi, '')
    .replace(/\(4K.*?\)/gi, '')
    .replace(/\[4K.*?\]/gi, '')
    .replace(/\(Live.*?\)/gi, '')
    .replace(/\[Live.*?\]/gi, '')
    .replace(/\(Explicit.*?\)/gi, '')
    .replace(/\[Explicit.*?\]/gi, '')
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\].*?/gi, '')
    .replace(/feat\..*?$/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\[with.*?\].*?/gi, '')
    .replace(/\(prod\..*?\)/gi, '')
    .replace(/\[prod\..*?\].*?/gi, '')
    .replace(/- Topic/gi, '')
    .replace(/Official Music Video/gi, '')
    .replace(/Official Video/gi, '')
    .replace(/Official Audio/gi, '')
    .replace(/Music Video/gi, '')
    .replace(/Video/gi, '')
    .replace(/Audio/gi, '')
    .replace(/Lyrics/gi, '')
    .replace(/\(letra.*?\)/gi, '') 
    .replace(/\[letra.*?\]/gi, '')
    .replace(/letra\s*$/gi, '')
    .replace(/\|.*$/g, '') 
    .replace(/\sM\/?V\s*$/gi, '') 
    .replace(/\sI\sMV\s*$/gi, '') 
    .replace(/officia.*?/gi, '') 
    .replace(/\s-\s.*$/gi, (match) => match.includes('Topic') ? '' : match);

  if (artistName && clean.toLowerCase().startsWith(artistName.toLowerCase())) {
    const regex = new RegExp(`^${artistName}\\s*[-:]\\s*`, 'i');
    clean = clean.replace(regex, '');
  }

  return clean
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-:]\s*|\s*[-:]\s*$/g, '') 
    .trim();
}

export function sanitizeArtist(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/\s*-\s*Topic/gi, '')
    .replace(/VEVO/gi, '')
    .replace(/HYBE LABELS/gi, 'BTS')
    .replace(/Warner Music.*/gi, '')
    .replace(/Sony Music.*/gi, '')
    .replace(/Universal Music.*/gi, '')
    .trim() || artist;
}

export function parseArtistAndTitle(rawTitle: string, rawArtist: string): { title: string; artist: string } {
  let resolvedTitle = rawTitle;
  let resolvedArtist = rawArtist;

  const splitMatch = rawTitle.match(/^(.*?)\s+[-—]\s+(.*)$/);
  if (splitMatch && splitMatch[1].length < 40) {
    resolvedArtist = splitMatch[1].trim();
    resolvedTitle = splitMatch[2].trim();
  }

  return {
    title: sanitizeTitle(resolvedTitle, resolvedArtist),
    artist: sanitizeArtist(resolvedArtist),
  };
}
