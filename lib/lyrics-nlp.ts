export interface LyricsAnalysis {
  mood: string[];
  emotional_intensity: number;
  themes: string[];
  content_type: string;
  word_count: number;
  sentiment_score: number;
}

export function analyzeLyricsForMoodAndEmotion(lyrics: string): LyricsAnalysis {
  const words = lyrics.toLowerCase().split(/\s+/);
  const wordCount = words.length;

  // Mood analysis based on lyrical content
  const moodKeywords = {
    "Aggressive": ["fight", "anger", "rage", "attack", "violence", "destroy", "kill", "hate", "fury", "war", "battle", "punch", "smash", "crush"],
    "Melancholic": ["sad", "sorrow", "tears", "cry", "lonely", "empty", "lost", "broken", "pain", "grief", "regret", "miss", "gone", "goodbye"],
    "Euphoric": ["joy", "happy", "celebration", "party", "dance", "love", "ecstasy", "bliss", "amazing", "wonderful", "fantastic", "incredible"],
    "Meditative": ["peace", "calm", "quiet", "breathe", "center", "balance", "harmony", "stillness", "reflection", "mindful", "present"],
    "Romantic": ["love", "heart", "kiss", "touch", "together", "forever", "beautiful", "romance", "passion", "desire", "intimate"],
    "Rebellious": ["rebel", "fight", "system", "authority", "freedom", "revolution", "change", "break", "rules", "establishment"],
    "Nostalgic": ["remember", "past", "yesterday", "childhood", "memories", "used to", "back then", "once upon", "old days"],
    "Anxious": ["worry", "fear", "panic", "stress", "nervous", "scared", "trouble", "problem", "danger", "concerned"],
    "Spiritual": ["god", "prayer", "soul", "heaven", "divine", "sacred", "holy", "blessing", "faith", "spirit", "eternal"],
    "Dark": ["death", "darkness", "shadow", "evil", "devil", "hell", "demon", "nightmare", "horror", "doom", "despair"],
    "Uplifting": ["hope", "rise", "up", "shine", "bright", "positive", "inspire", "overcome", "victory", "triumph", "strength"],
    "Chaotic": ["chaos", "madness", "crazy", "wild", "random", "disorder", "confusion", "mayhem", "anarchy", "turbulent"]
  };

  const detectedMoods: string[] = [];
  const moodScores: { [mood: string]: number } = {};

  // Calculate mood scores
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    const matchCount = keywords.filter(keyword => lyrics.toLowerCase().includes(keyword)).length;
    if (matchCount > 0) {
      moodScores[mood] = matchCount;
      detectedMoods.push(mood);
    }
  }

  // Sort moods by relevance
  detectedMoods.sort((a, b) => (moodScores[b] || 0) - (moodScores[a] || 0));

  // Calculate emotional intensity (1-10)
  const intensityKeywords = {
    high: ["explosive", "intense", "extreme", "powerful", "overwhelming", "massive", "incredible", "insane", "wild", "fierce"],
    medium: ["strong", "deep", "significant", "notable", "considerable", "meaningful"],
    low: ["gentle", "soft", "quiet", "calm", "peaceful", "subtle", "mild"]
  };

  let emotionalIntensity = 5; // default medium
  const highIntensityCount = intensityKeywords.high.filter(word => lyrics.toLowerCase().includes(word)).length;
  const lowIntensityCount = intensityKeywords.low.filter(word => lyrics.toLowerCase().includes(word)).length;

  if (highIntensityCount > lowIntensityCount) {
    emotionalIntensity = Math.min(10, 7 + highIntensityCount);
  } else if (lowIntensityCount > highIntensityCount) {
    emotionalIntensity = Math.max(1, 4 - lowIntensityCount);
  }

  // Analyze themes
  const themeKeywords = {
    "Love & Relationships": ["love", "heart", "relationship", "partner", "together", "romance", "marry", "date"],
    "Loss & Grief": ["loss", "death", "gone", "goodbye", "funeral", "grave", "miss", "mourn"],
    "Identity": ["who am i", "myself", "identity", "self", "person", "individual", "character"],
    "Social Commentary": ["society", "system", "government", "politics", "social", "community", "people"],
    "Technology": ["computer", "digital", "internet", "machine", "robot", "cyber", "virtual", "online"],
    "Nature": ["nature", "trees", "forest", "ocean", "mountain", "earth", "sky", "weather"],
    "Time": ["time", "past", "future", "present", "moment", "eternity", "forever", "temporary"],
    "Freedom": ["freedom", "liberty", "escape", "prison", "cage", "free", "liberation", "independent"],
    "Dreams & Aspirations": ["dream", "hope", "wish", "goal", "ambition", "aspire", "vision", "future"]
  };

  const themes: string[] = [];
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(keyword => lyrics.toLowerCase().includes(keyword))) {
      themes.push(theme);
    }
  }

  // Determine content type
  let contentType = "Traditional Lyrics";
  if (lyrics.includes('[') && lyrics.includes(']')) {
    contentType = "Production Notes";
  } else if (lyrics.includes('om-') || lyrics.includes('ah-ah') || lyrics.includes('hree-')) {
    contentType = "Onomatopoeia";
  } else if (wordCount < 10) {
    contentType = "Minimal";
  } else if (lyrics.includes('chant') || lyrics.includes('prayer')) {
    contentType = "Chanting";
  }

  // Calculate sentiment score
  const positiveWords = ["love", "joy", "happy", "hope", "beautiful", "amazing", "wonderful", "great", "good", "perfect"];
  const negativeWords = ["hate", "sad", "pain", "terrible", "awful", "horrible", "bad", "worst", "evil", "dark"];

  const positiveCount = positiveWords.filter(word => lyrics.toLowerCase().includes(word)).length;
  const negativeCount = negativeWords.filter(word => lyrics.toLowerCase().includes(word)).length;

  const sentimentScore = Math.max(0, Math.min(1, (positiveCount - negativeCount + 5) / 10));

  return {
    mood: detectedMoods.slice(0, 3), // Top 3 moods
    emotional_intensity: emotionalIntensity,
    themes,
    content_type: contentType,
    word_count: wordCount,
    sentiment_score: sentimentScore
  };
}
