import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface TimelineEntry {
  title: string;
  date: string;
  categories: string[];
  gallery?: any[];
  attachments?: any[];
}

function fixYearTitles() {
  const timelineDir = path.join(process.cwd(), 'content', 'timeline');
  
  if (!fs.existsSync(timelineDir)) {
    console.error('Timeline directory not found');
    return;
  }

  const entries = fs.readdirSync(timelineDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => name.match(/^year\d{4}$/)); // Only match year#### pattern

  console.log(`Found ${entries.length} year entries to process`);

  let processedCount = 0;
  let skippedCount = 0;

  entries.forEach(entrySlug => {
    const yamlPath = path.join(timelineDir, entrySlug, 'index.yaml');
    
    if (!fs.existsSync(yamlPath)) {
      console.log(`❌ Skipping ${entrySlug}: index.yaml not found`);
      skippedCount++;
      return;
    }

    try {
      const yamlContent = fs.readFileSync(yamlPath, 'utf8');
      const data = yaml.load(yamlContent) as TimelineEntry;
      
      if (!data || !data.title) {
        console.log(`❌ Skipping ${entrySlug}: invalid YAML structure`);
        skippedCount++;
        return;
      }

      // Extract the year from the title (e.g., "Year1999" -> "1999")
      const yearMatch = data.title.match(/^Year(\d{4})$/);
      if (!yearMatch) {
        console.log(`❌ Skipping ${entrySlug}: title "${data.title}" doesn't match Year#### pattern`);
        skippedCount++;
        return;
      }

      const year = yearMatch[1];
      const newTitle = year;

      if (data.title === newTitle) {
        console.log(`⏭️  Skipping ${entrySlug}: title already correct ("${data.title}")`);
        skippedCount++;
        return;
      }

      // Update the title
      data.title = newTitle;

      // Write back to file
      const updatedYaml = yaml.dump(data, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      });

      fs.writeFileSync(yamlPath, updatedYaml, 'utf8');
      
      console.log(`✅ Updated ${entrySlug}: "${yearMatch[0]}" → "${newTitle}"`);
      processedCount++;

    } catch (error) {
      console.error(`❌ Error processing ${entrySlug}:`, error);
      skippedCount++;
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${processedCount} entries`);
  console.log(`   ⏭️  Skipped: ${skippedCount} entries`);
  console.log(`   📝 Total: ${processedCount + skippedCount} entries processed`);
}

// Run the script
fixYearTitles(); 