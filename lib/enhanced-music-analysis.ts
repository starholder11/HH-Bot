export interface EnhancedMusicAnalysis {
  primary_genre: string;
  styles: string[];
  energy_level: number;
  emotional_intensity: number;
  mood: string[];
  themes: string[];
  vocals: string; // male, female, both, none
  word_count: number;
  sentiment_score: number;
  prompt: string[]; // renamed from production_style
  temporal_structure: string[];
}

// COMPREHENSIVE genre system covering ALL major music genres
export const COMPREHENSIVE_GENRES = {
  "Blues": [
    "Chicago Blues", "Delta Blues", "Electric Blues", "Country Blues", "Rhythm & Blues",
    "Jump Blues", "British Blues", "Blues Rock", "Soul Blues", "Gospel Blues"
  ],
  "Classical": [
    "Baroque", "Romantic", "Modern Classical", "Contemporary Classical", "Minimalist",
    "Neo-Classical", "Orchestral", "Chamber Music", "Opera", "Symphony", "Concerto"
  ],
  "Country": [
    "Traditional Country", "Country Rock", "Outlaw Country", "Alt-Country", "Bluegrass",
    "Country Pop", "Honky Tonk", "Western Swing", "Americana", "Folk Country"
  ],
  "Electronic": [
    "Ambient", "Acid House", "Acid Techno", "Big Beat", "Breakbeat", "Breakcore",
    "Chillout", "Downtempo", "Drum & Bass", "Dubstep", "Electro", "Electronica",
    "French House", "Garage", "Glitch", "Hardstyle", "House", "IDM", "Jungle",
    "Leftfield", "Minimal", "Psytrance", "Techno", "Trance", "Trip Hop", "UK Garage",
    "Vaporwave", "Synthwave", "Dark Ambient", "Drone"
  ],
  "Experimental": [
    "Avant Garde", "Harsh Noise", "Industrial", "Lowercase", "Musique Concrète",
    "Noise", "Power Electronics", "Sound Art", "Tape Music", "Microsound",
    "Acousmatic", "Electroacoustic", "Free Improvisation", "Sound Collage"
  ],
  "Folk": [
    "Traditional Folk", "Contemporary Folk", "Folk Rock", "Celtic Folk", "Americana",
    "Bluegrass", "Country Folk", "Indie Folk", "Psychedelic Folk", "Anti-Folk"
  ],
  "Funk": [
    "Classic Funk", "P-Funk", "Funk Rock", "Funk Metal", "G-Funk", "Electro-Funk",
    "Jazz Funk", "Go-Go", "Minneapolis Funk", "Funk Carioca"
  ],
  "Hip Hop": [
    "Old School Hip Hop", "East Coast Hip Hop", "West Coast Hip Hop", "Southern Hip Hop",
    "Trap", "Drill", "Boom Bap", "Jazz Rap", "Abstract Hip Hop", "Conscious Rap",
    "Gangsta Rap", "Hardcore Hip Hop", "Instrumental Hip Hop", "Phonk", "Cloud Rap"
  ],
  "Jazz": [
    "Traditional Jazz", "Bebop", "Cool Jazz", "Hard Bop", "Free Jazz", "Fusion",
    "Smooth Jazz", "Acid Jazz", "Nu Jazz", "Spiritual Jazz", "Modal Jazz", "Swing"
  ],
  "Latin": [
    "Salsa", "Bossa Nova", "Samba", "Reggaeton", "Cumbia", "Tango", "Merengue",
    "Bachata", "Latin Jazz", "Latin Pop", "Mariachi", "Flamenco"
  ],
  "Metal": [
    "Heavy Metal", "Thrash Metal", "Death Metal", "Black Metal", "Power Metal",
    "Progressive Metal", "Doom Metal", "Sludge Metal", "Nu Metal", "Metalcore",
    "Symphonic Metal", "Industrial Metal"
  ],
  "Pop": [
    "Pop Rock", "Dance Pop", "Electro Pop", "Indie Pop", "Synth Pop", "Teen Pop",
    "Art Pop", "Baroque Pop", "Dream Pop", "Power Pop", "Bubblegum Pop"
  ],
  "Punk": [
    "Punk Rock", "Hardcore Punk", "Post-Punk", "Pop Punk", "Ska Punk", "Emo",
    "Grunge", "Riot Grrrl", "Anarcho-Punk", "Horror Punk", "Celtic Punk"
  ],
  "R&B": [
    "Classic R&B", "Contemporary R&B", "Neo-Soul", "New Jack Swing", "Quiet Storm",
    "Alternative R&B", "UK R&B", "Gospel", "Soul", "Motown"
  ],
  "Reggae": [
    "Roots Reggae", "Dancehall", "Dub", "Reggae Pop", "Lover's Rock", "Ragga",
    "Reggae Fusion", "Digital Reggae", "One Drop", "Steppers"
  ],
  "Rock": [
    "Classic Rock", "Hard Rock", "Progressive Rock", "Psychedelic Rock", "Blues Rock",
    "Folk Rock", "Southern Rock", "Garage Rock", "Glam Rock", "Punk Rock",
    "Alternative Rock", "Indie Rock", "Post Rock", "Math Rock", "Shoegaze"
  ],
  "Soul": [
    "Classic Soul", "Northern Soul", "Southern Soul", "Deep Soul", "Blue-Eyed Soul",
    "Philadelphia Soul", "Chicago Soul", "Neo-Soul", "Gospel Soul"
  ],
  "World": [
    "Afrobeat", "Reggae", "Celtic", "Flamenco", "Bossa Nova", "Gamelan", "Qawwali",
    "Indian Classical", "African Traditional", "Middle Eastern", "Asian Folk",
    "Latin American", "Caribbean", "Balkan", "Nordic Folk"
  ],
  "Vocal": [
    "Acapella", "Chanting", "Choral", "Devotional", "Gospel", "Gregorian",
    "Throat Singing", "Vocal Ensemble", "Beatboxing", "Sound Poetry", "Spoken Word",
    "Barbershop", "Doo-Wop", "Vocal Jazz"
  ]
};

// Comprehensive mood system
export const COMPREHENSIVE_MOODS = [
  "Aggressive", "Anxious", "Apocalyptic", "Atmospheric", "Blissful", "Chaotic",
  "Contemplative", "Dark", "Dreamy", "Ecstatic", "Energetic", "Euphoric",
  "Experimental", "Frantic", "Haunting", "Hypnotic", "Intense", "Introspective",
  "Meditative", "Melancholic", "Mysterious", "Nostalgic", "Paranoid", "Peaceful",
  "Playful", "Psychedelic", "Raw", "Rebellious", "Reflective", "Romantic",
  "Savage", "Serene", "Sinister", "Spiritual", "Surreal", "Tense", "Transcendent",
  "Trippy", "Unnerving", "Uplifting", "Violent", "Weird", "Zen"
];

// Comprehensive themes for experimental music
export const COMPREHENSIVE_THEMES = [
  "Alienation", "Altered States", "Artificial Intelligence", "Body Horror", "Chaos Theory",
  "Collective Consciousness", "Cosmic Horror", "Cyberpunk", "Death & Dying", "Digital Identity",
  "Dystopia", "Ego Death", "Environmental Collapse", "Existential Dread", "Future Shock",
  "Glitch Aesthetics", "Human-Machine Interface", "Identity Crisis", "Information Overload",
  "Late Stage Capitalism", "Loss & Grief", "Love & Relationships", "Machine Consciousness",
  "Mental Health", "Metamorphosis", "Nature vs Technology", "Occultism", "Paranoia",
  "Post-Human", "Psychonautics", "Reality Distortion", "Ritualism", "Science Fiction",
  "Shamanism", "Social Commentary", "Solipsism", "Sonic Exploration", "Space & Time",
  "Spiritual Journey", "Surveillance State", "Technological Singularity", "Time Dilation",
  "Transhumanism", "Urban Decay", "Virtual Reality", "War & Conflict", "Youth Culture"
];

// Enhanced prompt style detection (renamed from production_style)
export const PROMPT_STYLES = [
  "Acid", "Ambient", "Baggy", "Big Beat", "Breakbeat", "Chopped & Screwed", "Chillwave",
  "Cloudrap", "Collage", "Cut-up", "Dark", "Delay Heavy", "Distorted", "Downtempo",
  "Drone", "Dub", "Experimental", "Field Recording", "Garage", "Glitch", "Granular",
  "Harsh", "Hi-Fi", "IDM", "Industrial", "Live Recording", "Lo-Fi", "Madchester",
  "Minimal", "Noise", "Onomatopoeia", "Orchestration", "Phonk", "Plunderphonics",
  "Psychedelic", "Raw", "Reverb Heavy", "Sampling", "Shoegaze", "Slowed", "Sound Collage",
  "Tape Hiss", "Techno", "Throat Singing", "Timestretch", "Trip Hop", "Vaporwave"
];

export const PRIMARY_GENRES = Object.keys(COMPREHENSIVE_GENRES);

export function getStylesForGenre(primaryGenre: string): string[] {
  return COMPREHENSIVE_GENRES[primaryGenre as keyof typeof COMPREHENSIVE_GENRES] || [];
}

export function getAllStyles(): string[] {
  return Object.values(COMPREHENSIVE_GENRES).flat();
}

export function analyzeGenreFromPrompt(prompt: string): { primaryGenre: string; styles: string[] } {
  const promptLower = prompt.toLowerCase();

  // Enhanced keyword mapping for ALL music genres
  const genreKeywords = {
    "Electronic": [
      "electronic", "electro", "synth", "digital", "computer", "machine", "techno",
      "house", "ambient", "acid", "break", "beat", "glitch", "idm", "drill", "dub",
      "edm", "rave", "club"
    ],
    "Hip Hop": [
      "hip hop", "rap", "beats", "sampling", "turntable", "mc", "freestyle", "trap",
      "drill", "phonk", "boom bap", "gangsta", "conscious"
    ],
    "Rock": [
      "rock", "guitar", "distortion", "grunge", "alternative", "garage", "indie rock",
      "classic rock", "hard rock", "prog", "psychedelic rock"
    ],
    "Jazz": [
      "jazz", "fusion", "spiritual jazz", "free jazz", "electro jazz", "nu jazz",
      "bebop", "swing", "cool jazz", "hard bop"
    ],
    "Blues": [
      "blues", "delta blues", "chicago blues", "electric blues", "blues rock",
      "rhythm and blues", "r&b"
    ],
    "Country": [
      "country", "bluegrass", "honky tonk", "alt country", "americana", "western",
      "nashville", "outlaw country"
    ],
    "Folk": [
      "folk", "acoustic", "traditional", "celtic", "americana", "bluegrass",
      "indie folk", "contemporary folk"
    ],
    "Funk": [
      "funk", "p-funk", "funk rock", "g-funk", "go-go", "electro funk", "james brown"
    ],
    "Latin": [
      "latin", "salsa", "bossa nova", "samba", "reggaeton", "cumbia", "tango",
      "merengue", "bachata", "mariachi"
    ],
    "Metal": [
      "metal", "heavy metal", "thrash", "death metal", "black metal", "doom",
      "sludge", "nu metal", "metalcore"
    ],
    "Pop": [
      "pop", "commercial", "mainstream", "radio", "dance pop", "electro pop",
      "teen pop", "bubblegum"
    ],
    "Punk": [
      "punk", "hardcore", "grindcore", "noise punk", "digital hardcore", "no wave",
      "post punk", "emo", "riot grrrl"
    ],
    "R&B": [
      "r&b", "rhythm and blues", "soul", "neo soul", "contemporary r&b", "motown",
      "gospel", "quiet storm"
    ],
    "Reggae": [
      "reggae", "dancehall", "dub", "ragga", "roots reggae", "jamaican", "rastafarian"
    ],
    "Soul": [
      "soul", "classic soul", "northern soul", "southern soul", "deep soul",
      "philadelphia soul", "chicago soul"
    ],
    "Classical": [
      "classical", "orchestral", "symphony", "opera", "baroque", "romantic",
      "contemporary classical", "chamber music"
    ],
    "Experimental": [
      "experimental", "avant garde", "noise", "drone", "harsh", "industrial", "concrete",
      "abstract", "field recording", "musique concrete", "electroacoustic", "sound art"
    ],
    "Vocal": [
      "vocal", "acapella", "chanting", "choir", "devotional", "throat", "gregorian",
      "spoken word", "beatbox", "barbershop"
    ],
    "World": [
      "world", "ethnic", "tribal", "traditional", "cultural", "gamelan", "qawwali",
      "afrobeat", "celtic", "flamenco", "indian", "african", "middle eastern"
    ]
  };

  // Enhanced style detection
  const styleKeywords = {
    // Electronic styles
    "Ambient": ["ambient", "atmospheric", "soundscape"],
    "Acid House": ["acid house", "acid"],
    "Acid Techno": ["acid techno"],
    "Big Beat": ["big beat", "breakbeat", "chemical"],
    "Breakbeat": ["break", "beats", "breakbeat", "drum and bass"],
    "Breakcore": ["breakcore", "speedcore"],
    "Chillout": ["chill", "downtempo", "relaxed", "lounge"],
    "Dark Ambient": ["dark ambient", "isolationist"],
    "Drone": ["drone", "sustained", "minimalist"],
    "Dubstep": ["dubstep", "brostep", "future garage"],
    "Electro": ["electro", "miami bass"],
    "French House": ["french house", "filter house"],
    "Garage": ["garage", "uk garage", "speed garage"],
    "Glitch": ["glitch", "microsound", "clicks"],
    "House": ["house", "deep house", "tech house"],
    "IDM": ["idm", "intelligent dance", "braindance"],
    "Techno": ["techno", "detroit techno", "minimal techno"],
    "Trance": ["trance", "progressive trance", "uplifting trance"],
    "Trip Hop": ["trip hop", "bristol sound"],
    "Vaporwave": ["vaporwave", "synthwave", "retrowave"],

    // Rock styles
    "Classic Rock": ["classic rock", "70s rock"],
    "Hard Rock": ["hard rock", "arena rock"],
    "Progressive Rock": ["prog rock", "progressive"],
    "Psychedelic Rock": ["psychedelic rock", "psych rock"],
    "Alternative Rock": ["alternative rock", "alt rock"],
    "Indie Rock": ["indie rock", "independent"],
    "Grunge": ["grunge", "seattle"],
    "Shoegaze": ["shoegaze", "shoegazer", "wall of sound"],

    // Hip Hop styles
    "Trap": ["trap", "atlanta trap"],
    "Drill": ["drill", "chicago drill", "uk drill"],
    "Boom Bap": ["boom bap", "golden age"],
    "Jazz Rap": ["jazz rap", "jazz hip hop"],
    "Phonk": ["phonk", "memphis rap"],

    // Other genres
    "Blues Rock": ["blues rock"],
    "Country Rock": ["country rock"],
    "Folk Rock": ["folk rock"],
    "Funk Rock": ["funk rock"],
    "Jazz Fusion": ["fusion", "jazz fusion"],
    "Reggae Pop": ["reggae pop"],
    "Soul Jazz": ["soul jazz"],

    // Experimental styles
    "Harsh Noise": ["harsh noise", "power electronics"],
    "Industrial": ["industrial", "mechanical", "factory"],
    "Musique Concrète": ["musique concrete", "concrete"],
    "Sound Collage": ["collage", "cut-up", "plunderphonics"],
    "Power Electronics": ["power electronics", "harsh"],
    "Lowercase": ["lowercase", "quiet", "microscopic"],

    // Vocal styles
    "Throat Singing": ["throat singing", "overtone", "tuvan"],
    "Gospel": ["gospel", "spiritual"],
    "Gregorian": ["gregorian", "chant"],
    "Acapella": ["acapella", "vocal"]
  };

  // Find primary genre
  let primaryGenre = "Experimental"; // Default for unclassifiable music
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

  return { primaryGenre, styles };
}

export function enhancedLyricsAnalysis(lyrics: string, prompt: string): EnhancedMusicAnalysis {
  const words = lyrics.toLowerCase().split(/\s+/);
  const wordCount = words.length;
  const allText = (lyrics + ' ' + prompt).toLowerCase();

  // Enhanced mood detection
  const moodKeywords = {
    "Aggressive": ["fight", "anger", "rage", "attack", "violence", "destroy", "kill", "hate", "fury", "war", "battle", "punch", "smash", "crush", "savage", "brutal"],
    "Anxious": ["worry", "fear", "panic", "stress", "nervous", "scared", "trouble", "problem", "danger", "concerned", "paranoid", "tense"],
    "Apocalyptic": ["apocalypse", "end times", "destruction", "armageddon", "collapse", "doom", "extinction", "wasteland"],
    "Atmospheric": ["atmosphere", "ambient", "space", "vast", "ethereal", "floating", "drifting", "immersive"],
    "Blissful": ["bliss", "ecstasy", "rapture", "euphoria", "transcendent", "divine", "heavenly", "serene"],
    "Chaotic": ["chaos", "madness", "crazy", "wild", "random", "disorder", "confusion", "mayhem", "anarchy", "turbulent", "frantic"],
    "Dark": ["death", "darkness", "shadow", "evil", "devil", "hell", "demon", "nightmare", "horror", "doom", "despair", "sinister"],
    "Dreamy": ["dream", "dreamy", "surreal", "ethereal", "floating", "weightless", "hypnotic", "trance"],
    "Euphoric": ["joy", "happy", "celebration", "party", "dance", "love", "ecstasy", "bliss", "amazing", "wonderful", "fantastic", "incredible"],
    "Hypnotic": ["hypnotic", "trance", "repetitive", "mesmerizing", "spellbinding", "entrancing"],
    "Introspective": ["introspect", "reflect", "contemplate", "meditate", "inner", "soul", "mind", "consciousness"],
    "Melancholic": ["sad", "sorrow", "tears", "cry", "lonely", "empty", "lost", "broken", "pain", "grief", "regret", "miss", "gone", "goodbye"],
    "Mysterious": ["mystery", "secret", "hidden", "unknown", "enigma", "puzzle", "cryptic", "obscure"],
    "Nostalgic": ["remember", "past", "yesterday", "childhood", "memories", "used to", "back then", "once upon", "old days"],
    "Paranoid": ["paranoid", "conspiracy", "surveillance", "watching", "following", "trust", "suspicious"],
    "Psychedelic": ["psychedelic", "trip", "acid", "kaleidoscope", "fractal", "reality", "perception", "consciousness"],
    "Raw": ["raw", "primal", "savage", "brutal", "unfiltered", "harsh", "gritty", "dirty"],
    "Rebellious": ["rebel", "fight", "system", "authority", "freedom", "revolution", "change", "break", "rules", "establishment"],
    "Romantic": ["love", "heart", "kiss", "touch", "together", "forever", "beautiful", "romance", "passion", "desire", "intimate"],
    "Spiritual": ["god", "prayer", "soul", "heaven", "divine", "sacred", "holy", "blessing", "faith", "spirit", "eternal", "transcendent"],
    "Surreal": ["surreal", "bizarre", "strange", "weird", "absurd", "impossible", "unreal", "distorted"],
    "Transcendent": ["transcend", "beyond", "infinite", "eternal", "cosmic", "universal", "enlightened"],
    "Uplifting": ["hope", "rise", "up", "shine", "bright", "positive", "inspire", "overcome", "victory", "triumph", "strength"],
    "Violent": ["violence", "blood", "gore", "murder", "kill", "destroy", "brutality", "savage", "vicious"]
  };

  // Calculate mood scores
  const detectedMoods: string[] = [];
  const moodScores: { [mood: string]: number } = {};

  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    const lyricMatches = keywords.filter(keyword => lyrics.toLowerCase().includes(keyword)).length;
    const promptMatches = keywords.filter(keyword => prompt.toLowerCase().includes(keyword)).length;
    const totalMatches = lyricMatches + (promptMatches * 0.5); // Weight prompt less than lyrics

    if (totalMatches > 0) {
      moodScores[mood] = totalMatches;
      detectedMoods.push(mood);
    }
  }

  // Sort moods by relevance and take top 5
  detectedMoods.sort((a, b) => (moodScores[b] || 0) - (moodScores[a] || 0));

  // Enhanced theme detection
  const themeKeywords = {
    "Artificial Intelligence": ["artificial intelligence", "machine learning", "neural network", "algorithm", "robot", "android", "cyborg", "ai system", "computer brain"], // More specific AI terms
    "Cyberpunk": ["cyber", "matrix", "virtual reality", "digital world", "hacker", "neon", "dystopia", "corporate control"],
    "Existential Dread": ["existence", "meaning of life", "purpose", "void", "nothing", "absurd", "existential crisis"],
    "Future Shock": ["future shock", "technology overload", "rapid change", "acceleration", "tomorrow's world"],
    "Glitch Aesthetics": ["glitch", "error", "malfunction", "corrupt", "digital artifact", "pixelated", "system failure"],
    "Human-Machine Interface": ["human machine", "cyborg interface", "merge with technology", "augment", "enhance", "upgrade human"],
    "Identity Crisis": ["who am i", "identity crisis", "sense of self", "persona", "character mask", "authentic self"],
    "Information Overload": ["information overload", "data flood", "too much information", "signal noise", "communication breakdown"],
    "Love & Relationships": ["love", "romance", "relationship", "partner", "together forever", "marry", "dating", "heartbreak"],
    "Loss & Grief": ["death", "loss", "grief", "gone forever", "funeral", "grave", "mourning", "bereavement"],
    "Mental Health": ["depression", "anxiety", "mental illness", "therapy", "healing trauma", "recovery", "psychological"],
    "Nature vs Technology": ["nature versus technology", "organic artificial", "natural synthetic", "technology destroying nature"],
    "Paranoia": ["paranoid", "conspiracy theory", "surveillance state", "watching me", "government control", "they're listening"],
    "Post-Human": ["posthuman", "beyond human", "evolution transcend", "transhumanism", "enhancement upgrade"],
    "Psychonautics": ["psychonaut", "consciousness exploration", "mind journey", "inner space", "consciousness expansion"],
    "Reality Distortion": ["reality distortion", "perception shift", "illusion", "dream state", "simulation theory"],
    "Science Fiction": ["sci-fi", "space travel", "alien contact", "future world", "galaxy", "starship", "cosmos exploration"],
    "Social Commentary": ["society critique", "political system", "government criticism", "social issues", "community problems"],
    "Sonic Exploration": ["sound exploration", "frequency experiment", "audio journey", "resonance study", "acoustic discovery"],
    "Spiritual Journey": ["spiritual path", "enlightenment quest", "awakening process", "consciousness raising", "divine connection"],
    "Technological Singularity": ["technological singularity", "convergence point", "exponential growth", "ai takeover"],
    "Time Dilation": ["time dilation", "time distortion", "temporal shift", "chronos", "time travel", "eternity"],
    "Urban Decay": ["urban decay", "city ruins", "abandoned buildings", "concrete jungle", "metropolitan decline"],
    "Virtual Reality": ["virtual reality", "vr world", "digital simulation", "avatar life", "metaverse", "immersive digital"]
  };

  const detectedThemes: string[] = [];
  const themeScores: { [theme: string]: number } = {};

  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    const lyricMatches = keywords.filter(keyword => lyrics.toLowerCase().includes(keyword)).length;
    const promptMatches = keywords.filter(keyword => prompt.toLowerCase().includes(keyword)).length;
    const totalScore = lyricMatches * 2 + promptMatches; // Weight lyrics more than prompt

    // Require higher threshold for theme detection
    const minScore = theme === "Love & Relationships" ? 1 : 2; // Love themes can be detected with single match

    if (totalScore >= minScore) {
      themeScores[theme] = totalScore;
      detectedThemes.push(theme);
    }
  }

  // Sort themes by relevance and limit to top 5
  detectedThemes.sort((a, b) => (themeScores[b] || 0) - (themeScores[a] || 0));
  const finalThemes = detectedThemes.slice(0, 5);

  // Vocal detection
  let vocals = "none";
  const maleVocalKeywords = ["he", "him", "his", "man", "guy", "dude", "boy", "masculine", "baritone", "tenor"];
  const femaleVocalKeywords = ["she", "her", "hers", "woman", "girl", "lady", "feminine", "soprano", "alto"];

  const hasMaleVocals = maleVocalKeywords.some(keyword => allText.includes(keyword)) ||
                       prompt.toLowerCase().includes("male") ||
                       prompt.toLowerCase().includes("masculine");
  const hasFemaleVocals = femaleVocalKeywords.some(keyword => allText.includes(keyword)) ||
                          prompt.toLowerCase().includes("female") ||
                          prompt.toLowerCase().includes("feminine");

  if (hasMaleVocals && hasFemaleVocals) {
    vocals = "both";
  } else if (hasFemaleVocals) {
    vocals = "female";
  } else if (hasMaleVocals) {
    vocals = "male";
  } else if (lyrics.trim().length > 0) {
    vocals = "unknown"; // Has lyrics but can't determine gender
  }

  // Enhanced emotional intensity calculation
  let emotionalIntensity = 5; // Default
  const highIntensityWords = ["explosive", "intense", "extreme", "powerful", "overwhelming", "massive", "incredible", "insane", "wild", "fierce", "brutal", "savage"];
  const lowIntensityWords = ["gentle", "soft", "quiet", "calm", "peaceful", "subtle", "mild", "tender", "serene"];

  const highCount = highIntensityWords.filter(word => allText.includes(word)).length;
  const lowCount = lowIntensityWords.filter(word => allText.includes(word)).length;

  if (highCount > lowCount) {
    emotionalIntensity = Math.min(10, 7 + highCount);
  } else if (lowCount > highCount) {
    emotionalIntensity = Math.max(1, 4 - lowCount);
  }

  // Energy level from prompt analysis
  let energyLevel = 5; // Default
  const highEnergyWords = ["fast", "aggressive", "intense", "powerful", "energetic", "frantic", "chaotic"];
  const lowEnergyWords = ["slow", "ambient", "calm", "peaceful", "gentle", "quiet", "meditative"];

  const promptHighEnergy = highEnergyWords.filter(word => prompt.toLowerCase().includes(word)).length;
  const promptLowEnergy = lowEnergyWords.filter(word => prompt.toLowerCase().includes(word)).length;

  if (promptHighEnergy > promptLowEnergy) {
    energyLevel = Math.min(10, 7 + promptHighEnergy);
  } else if (promptLowEnergy > promptHighEnergy) {
    energyLevel = Math.max(1, 4 - promptLowEnergy);
  }

  // Sentiment calculation
  const positiveWords = ["love", "joy", "happy", "hope", "beautiful", "amazing", "wonderful", "great", "good", "perfect", "bliss", "euphoria"];
  const negativeWords = ["hate", "sad", "pain", "terrible", "awful", "horrible", "bad", "worst", "evil", "dark", "despair", "doom"];

  const positiveCount = positiveWords.filter(word => allText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => allText.includes(word)).length;

  const sentimentScore = Math.max(0, Math.min(1, (positiveCount - negativeCount + 5) / 10));

  // Prompt style detection (renamed from production_style)
  const detectedPromptStyles: string[] = [];
  for (const style of PROMPT_STYLES) {
    if (prompt.toLowerCase().includes(style.toLowerCase())) {
      detectedPromptStyles.push(style);
    }
  }

  // Genre analysis
  const genreAnalysis = analyzeGenreFromPrompt(prompt);

  return {
    primary_genre: genreAnalysis.primaryGenre,
    styles: genreAnalysis.styles,
    energy_level: energyLevel,
    emotional_intensity: emotionalIntensity,
    mood: detectedMoods.slice(0, 5), // Top 5 moods
    themes: finalThemes, // Top 5 themes
    vocals,
    word_count: wordCount,
    sentiment_score: sentimentScore,
    prompt: detectedPromptStyles, // renamed from production_style
    temporal_structure: [] // Can be expanded later
  };
}
