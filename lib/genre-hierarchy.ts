export interface GenreHierarchy {
  [primaryGenre: string]: string[];
}

export const GENRE_HIERARCHY: GenreHierarchy = {
  "Electronic": [
    "Acid House", "Ambient", "Big Beat", "Breakbeat", "Chillout",
    "Downtempo", "Drum & Bass", "Dubstep", "Electro", "French House",
    "Glitch", "House", "IDM", "Techno", "Trance", "Trip Hop"
  ],
  "Rock": [
    "Alternative", "Garage Rock", "Grunge", "Hard Rock", "Indie Rock",
    "Post Rock", "Progressive", "Psychedelic Rock", "Punk Rock"
  ],
  "Hip Hop": [
    "Boom Bap", "Conscious Rap", "Gangsta Rap", "Hardcore Hip Hop",
    "Jazz Rap", "Old School", "Trap", "Underground"
  ],
  "Classical": [
    "Baroque", "Contemporary Classical", "Minimalist", "Neo-Classical",
    "Orchestral", "String Quartet", "Symphony"
  ],
  "Folk": [
    "Acoustic", "Americana", "Celtic", "Country Folk", "Folk Rock",
    "Indie Folk", "Traditional"
  ],
  "Jazz": [
    "Bebop", "Cool Jazz", "Free Jazz", "Fusion", "Hard Bop",
    "Smooth Jazz", "Swing"
  ],
  "Experimental": [
    "Avant Garde", "Drone", "Harsh Noise", "Industrial", "Musique Concrète",
    "Noise", "Sound Art"
  ],
  "World": [
    "African", "Asian", "Celtic", "Latin", "Middle Eastern",
    "Tribal", "World Fusion"
  ],
  "Vocal": [
    "Acapella", "Chanting", "Choral", "Devotional", "Gospel",
    "Gregorian", "Throat Singing", "Vocal Ensemble"
  ],
  "Pop": [
    "Dance Pop", "Electro Pop", "Indie Pop", "Synth Pop", "Teen Pop"
  ]
};

export const PRIMARY_GENRES = Object.keys(GENRE_HIERARCHY);

export function getStylesForGenre(primaryGenre: string): string[] {
  return GENRE_HIERARCHY[primaryGenre] || [];
}

export function getAllStyles(): string[] {
  return Object.values(GENRE_HIERARCHY).flat();
}

export function analyzeGenreFromPrompt(prompt: string): { primaryGenre: string; styles: string[] } {
  const promptLower = prompt.toLowerCase();

  // Genre keyword mapping
  const genreKeywords = {
    "Electronic": ["electronic", "electro", "synth", "digital", "computer", "machine", "techno", "house", "ambient", "acid", "break", "beat", "glitch"],
    "Experimental": ["experimental", "avant", "noise", "drone", "harsh", "industrial", "concrete", "abstract"],
    "Rock": ["rock", "guitar", "distortion", "grunge", "alternative", "garage", "punk rock"],
    "Hip Hop": ["hip hop", "rap", "beats", "sampling", "turntable", "mc", "freestyle"],
    "Classical": ["orchestral", "symphony", "string", "classical", "baroque", "chamber"],
    "Folk": ["folk", "acoustic", "traditional", "country", "americana", "bluegrass"],
    "Jazz": ["jazz", "swing", "bebop", "fusion", "improvisation", "brass"],
    "World": ["world", "ethnic", "tribal", "traditional", "cultural"],
    "Vocal": ["vocal", "acapella", "chanting", "choir", "devotional", "throat", "gregorian"],
    "Pop": ["pop", "commercial", "mainstream", "radio"]
  };

  // Style keyword mapping
  const styleKeywords = {
    "Acid House": ["acid"],
    "Ambient": ["ambient", "atmospheric", "soundscape"],
    "Big Beat": ["big beat", "breakbeat"],
    "Breakbeat": ["break", "beats", "breakbeat"],
    "Chillout": ["chill", "downtempo", "relaxed"],
    "Punk Rock": ["punk"],
    "Psychedelic Rock": ["psyched", "psychedelia", "trip"],
    "Industrial": ["industrial", "mechanical"],
    "Drone": ["drone", "sustained"],
    "Throat Singing": ["throat", "chant"],
    "Acapella": ["acapella", "vocal"],
    "Devotional": ["devotional", "spiritual", "prayer"],
    "French House": ["french", "house"],
    "Madchester": ["madchester", "baggy"],
    "Harsh Noise": ["harsh", "noise"],
    "Glitch": ["glitch", "digital artifacts"]
  };

  // Find primary genre
  let primaryGenre = "Experimental"; // default
  let maxMatches = 0;

  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    const matches = keywords.filter(keyword => promptLower.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      primaryGenre = genre;
    }
  }

  // Find matching styles
  const styles: string[] = [];
  for (const [style, keywords] of Object.entries(styleKeywords)) {
    if (keywords.some(keyword => promptLower.includes(keyword))) {
      styles.push(style);
    }
  }

  // Add any styles that belong to the primary genre
  const genreStyles = getStylesForGenre(primaryGenre);
  for (const style of genreStyles) {
    if (promptLower.includes(style.toLowerCase()) && !styles.includes(style)) {
      styles.push(style);
    }
  }

  return { primaryGenre, styles };
}
