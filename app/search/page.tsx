import { Search } from '@/components/search/Search';

export default function SearchPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Search Timeline</h1>
      <Search variant="full" maxResults={20} />
    </div>
  );
} 