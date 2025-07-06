import TimelineTable from './components/TimelineTable';
import { getTimelineEntriesWithDates } from './lib/timeline-data';

export default async function ManagePage() {
  const entries = await getTimelineEntriesWithDates();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-6">Timeline Admin</h1>
      <TimelineTable entries={entries} />
    </main>
  );
} 