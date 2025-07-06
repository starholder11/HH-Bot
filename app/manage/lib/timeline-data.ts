import { getAllTimelineEntriesFromGit } from '../../../lib/git-content-reader';
import { Octokit } from '@octokit/rest';

export interface TimelineEntry {
  title: string;
  slug: string;
  created: Date;
  modified: Date;
}

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function getCommitDatesForFile(filePath: string): Promise<{ created: Date; modified: Date }> {
  const commits = await octokit.rest.repos.listCommits({
    owner: 'starholder11',
    repo: 'HH-Bot',
    path: filePath,
    per_page: 100,
  });
  if (!commits.data.length) {
    const now = new Date();
    return { created: now, modified: now };
  }
  const sorted = commits.data.sort((a, b) => new Date(a.commit.author?.date || '').getTime() - new Date(b.commit.author?.date || '').getTime());
  return {
    created: new Date(sorted[0].commit.author?.date || ''),
    modified: new Date(sorted[sorted.length - 1].commit.author?.date || ''),
  };
}

export async function getTimelineEntriesWithDates(): Promise<TimelineEntry[]> {
  const entries = await getAllTimelineEntriesFromGit();
  const result: TimelineEntry[] = [];
  for (const entry of entries) {
    const filePath = `content/timeline/${entry.title}/body.mdoc`;
    const { created, modified } = await getCommitDatesForFile(filePath);
    result.push({
      title: entry.title,
      slug: entry.slug,
      created,
      modified,
    });
  }
  return result;
} 