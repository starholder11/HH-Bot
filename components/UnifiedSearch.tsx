'use client';

import { useState, useRef } from 'react';
import { Search, Filter, Loader2, FileText, Music, Video, Image, ExternalLink } from 'lucide-react';

interface SearchResult {
  id: string;
  content_type: 'text' | 'media' | 'audio' | 'video' | 'image' | 'keyframe_still';
  title: string;
  description: string;
  preview?: string;
  score?: number;
  metadata: any;
  url?: string;
  s3_url?: string;
  cloudflare_url?: string;
}

interface SearchResponse {
  success: boolean;
  results?: {
    media: SearchResult[];
    text: SearchResult[];
    all: SearchResult[];
  };
  error?: string;
  details?: string;
}

const contentTypeIcons = {
  text: FileText,
  media: Music,
  audio: Music,
  video: Video,
  image: Image,
  keyframe_still: Image, // Add keyframe_still mapping
};

const contentTypeColors = {
  text: 'bg-blue-100 text-blue-800',
  media: 'bg-purple-100 text-purple-800',
  audio: 'bg-purple-100 text-purple-800',
  video: 'bg-red-100 text-red-800',
  image: 'bg-green-100 text-green-800',
  keyframe_still: 'bg-green-100 text-green-800', // Add keyframe_still mapping
};

export default function UnifiedSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [limit, setLimit] = useState(10);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/unified-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          content_types: selectedTypes.length > 0 ? selectedTypes : undefined,
          limit,
        }),
      });

      const data: SearchResponse = await response.json();

      if (data.success && data.results) {
        setResults(data.results.all || []);
      } else {
        setError(data.error || 'Search failed');
        setResults([]);
      }
    } catch (err) {
      setError('Network error occurred');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleContentType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const getResultUrl = (result: SearchResult) => {
    if (result.cloudflare_url) return result.cloudflare_url;
    if (result.s3_url) return result.s3_url;
    if (result.url) return result.url;
    if (result.metadata?.slug) {
      // Check if slug already starts with "timeline/" to avoid double path
      // Also remove "/content" from the end of the slug
      let slug = result.metadata.slug;
      if (slug.endsWith('/content')) {
        slug = slug.replace('/content', '');
      }
      if (slug.startsWith('timeline/')) {
        return `/${slug}`;
      } else {
        return `/timeline/${slug}`;
      }
    }
    return null;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Search className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Unified Search</h1>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Search across all your content — both media assets and text documents using semantic similarity.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for music, articles, videos, or any content..."
            className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Content Types:</span>
          </div>

          {['text', 'audio', 'video', 'image'].map((type) => {
            const Icon = contentTypeIcons[type as keyof typeof contentTypeIcons];
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleContentType(type)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedTypes.includes(type)
                    ? contentTypeColors[type as keyof typeof contentTypeColors]
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm text-gray-600">Limit:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              Search
            </>
          )}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-800">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="font-medium">Search Error</span>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Search Results ({results.length})
            </h2>
          </div>

          <div className="grid gap-4">
            {results.map((result) => {
              const Icon = contentTypeIcons[result.content_type];
              const url = getResultUrl(result);

              return (
                <div
                  key={result.id}
                  className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${contentTypeColors[result.content_type]}`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            {result.title}
                          </h3>
                          <p className="text-gray-600 line-clamp-3 mb-3">
                            {result.preview || result.description}
                          </p>

                          {result.metadata && Object.keys(result.metadata).length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {Object.entries(result.metadata).slice(0, 3).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md"
                                >
                                  {key}: {String(value).slice(0, 20)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {result.score && (
                          <div className="text-sm text-gray-500">
                            Score: {result.score.toFixed(1)}%
                          </div>
                        )}
                      </div>

                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Getting Started Guide */}
      {results.length === 0 && !loading && !error && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">🚀 Getting Started</h3>
          <div className="space-y-3 text-left max-w-md mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
              <span className="text-gray-700">Make sure your LanceDB service is running</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
              <span className="text-gray-700">Run the ingestion script: <code className="bg-gray-200 px-2 py-1 rounded">npm run ingest-lancedb</code></span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
              <span className="text-gray-700">Start searching across all your content!</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
