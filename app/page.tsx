import { getTimelineEntries } from '@/lib/timeline';
import { BaseLayout } from '@/components/layout/BaseLayout';
import { SiteTitle } from '@/components/layout/SiteTitle';
import { ContentContainer } from '@/components/layout/ContentContainer';
import { Heading } from '@/components/typography/Heading';
import { BodyText } from '@/components/typography/BodyText';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { Footer } from '@/components/layout/Footer';

export default function Home() {
  const timelineEntries = getTimelineEntries();

  return (
    <BaseLayout>
      <main className="py-12">
        <ContentContainer>
          <section className="text-center mb-16">
            <Heading level={1} className="mb-6 text-balance">
              A worldbuilding project in search of its founding text
            </Heading>
            <BodyText size="large" className="text-wp-contrast-2 max-w-2xl mx-auto mb-8">
              An exploration of networked media and the new forms it enables. We start with the word. It acts as the founding source code from which everything else is rendered upon.
            </BodyText>
            <div className="flex gap-4 justify-center">
              <Button href="/timeline" size="lg">
                Explore Timeline
              </Button>
              <Button href="/about" variant="outline" size="lg">
                Learn More
              </Button>
            </div>
          </section>

          <section className="mb-16">
            <Heading level={2} className="mb-8">Featured Entries</Heading>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {timelineEntries.length === 0 ? (
                <Card>
                  <BodyText>No timeline entries yet. Check back soon for updates!</BodyText>
                  <Button href="/admin" className="mt-4">Add Content</Button>
                </Card>
              ) : (
                timelineEntries.slice(0, 3).map((entry) => (
                  <Card key={entry.slug} className="timeline-entry wp-card-hover">
                    <Heading level={3} className="timeline-title">
                      <a href={`/timeline/${entry.slug}`} className="no-underline hover:text-wp-contrast-2">
                        {entry.title}
                      </a>
                    </Heading>
                    <BodyText className="timeline-content mb-4">
                      {entry.body.slice(0, 180)}...
                    </BodyText>
                    <div className="timeline-meta">
                      <span>{entry.date}</span> • <span>{entry.body.split(' ').length} words</span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section className="wp-prose">
            <Heading level={2}>The Timeline Structure</Heading>
            <BodyText>
              <p>
                The Timeline covers one hundred years of imagined history, from 1999 to 2099 broken into periods. Each is an exploration of a technological package and its effect on society & culture.
              </p>
              <ul>
                <li><strong>The End Of History (1999 – 2016)</strong></li>
                <li><strong>Networked Life Intensifies (2017 – 2033)</strong></li>
                <li><strong>The Great Disruption (2034 – 2049)</strong></li>
                <li><strong>Headlong Into The Hyperreal (2050 – 2069)</strong></li>
                <li><strong>The Second Moon Event (2070-2079)</strong></li>
                <li><strong>The Impending Collapse (2080 – 2099)</strong></li>
              </ul>
            </BodyText>
          </section>
        </ContentContainer>
      </main>
      <Footer />
    </BaseLayout>
  );
}
