// Lambda worker for real-time conversation summarization
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const OpenAI = require('openai');

const s3Client = new S3Client({ region: 'us-east-1' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });
const bucketName = process.env.S3_BUCKET;

let openai;

// Get OpenAI API key from Secrets Manager
async function getOpenAIClient() {
  if (openai) return openai;

  try {
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: 'hh-bot-openai-api-key'
    }));

    const apiKey = response.SecretString;
    openai = new OpenAI({ apiKey });
    return openai;
  } catch (error) {
    console.error('Failed to get OpenAI API key from Secrets Manager:', error);
    throw error;
  }
}

exports.handler = async (event) => {
  const { textAssetId, userMessage, assistantResponse, conversationId, editMode, editInstructions } = event;
  const correlationId = event.correlationId || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[${correlationId}] Background summarizer triggered for: ${textAssetId}`);
  console.log(`[${correlationId}] Edit Mode: ${editMode || false}`);
  if (editMode) console.log(`[${correlationId}] Edit Instructions: ${editInstructions}`);

  try {
    // Load current S3 text asset
    const assetKey = `media-labeling/assets/${textAssetId}.json`;
    const getResponse = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: assetKey
    }));

    const currentAsset = JSON.parse(await streamToString(getResponse.Body));

    if (!currentAsset?.metadata?.scribe_enabled) {
      console.log(`[${correlationId}] Scribe disabled, skipping`);
      return { statusCode: 200, body: 'Scribe disabled' };
    }

    // Generate narrative update
    // Generate content update - either conversation integration or editing
    let updatedContent;
    let newTitle = null;
    if (editMode && editInstructions) {
      // Document editing mode
      const editResult = await generateDocumentEdit(
        editInstructions,
        currentAsset.content || '',
        currentAsset.title,
        correlationId
      );
      updatedContent = editResult.content || editResult; // Handle both old and new format
      newTitle = editResult.newTitle || null;
    } else {
      // Regular conversation integration mode
      const conversationTurn = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
      const narrativeResult = await generateNarrativeUpdate(
        conversationTurn,
        currentAsset.content || '',
        currentAsset.title,
        correlationId
      );
      updatedContent = narrativeResult.content || narrativeResult; // Handle both old and new format
      newTitle = narrativeResult.newTitle || null;
    }

    // Enforce short, intelligent title policy without touching slug
    let finalTitle = currentAsset.title || 'New Document';
    if (newTitle) {
      finalTitle = normalizeShortTitle(newTitle);
    }

    // If title is still generic/too long/undesirable, generate a short title from content
    if (isGenericOrBadTitle(finalTitle)) {
      try {
        const fallbackSource = (updatedContent && updatedContent.trim().length > 0)
          ? updatedContent
          : `${currentAsset.title || ''}\n\n${currentAsset.content || ''}`;
        const generated = await generateShortTitleFromContent(fallbackSource, correlationId);
        if (generated) {
          finalTitle = generated;
        }
      } catch (fallbackErr) {
        console.warn(`[${correlationId}] Title fallback generation failed:`, fallbackErr);
      }
    }

    // Update S3 text asset
    const updatedAsset = {
      ...currentAsset,
      content: updatedContent,
      title: finalTitle, // Keep slug unchanged; only title may change
      updated_at: new Date().toISOString(),
      metadata: {
        ...currentAsset.metadata,
        last_scribe_update: new Date().toISOString(),
        word_count: updatedContent.split(/\s+/).filter(w => w.length > 0).length,
        character_count: updatedContent.length,
        // Note: slug is intentionally NOT changed to maintain stable references
        title_updated_by_ai: (finalTitle || '').trim() !== (currentAsset.title || '').trim()
      }
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: assetKey,
      Body: JSON.stringify(updatedAsset, null, 2),
      ContentType: 'application/json'
    }));

    console.log(`[${correlationId}] ✅ Scribe update completed`);
    return { statusCode: 200, body: JSON.stringify({ success: true, correlationId }) };

  } catch (error) {
    console.error(`[${correlationId}] ❌ Summarizer failed:`, error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message, correlationId }) };
  }
};

function normalizeShortTitle(raw) {
  if (!raw) return 'New Document';
  let t = String(raw)
    .replace(/^\s*TITLE:\s*/i, '')
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .trim();

  // Replace em-dash/colon with space, collapse whitespace
  t = t.replace(/[–—:]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Keep it short: 3-6 words preferred; hard cap at 8 words or 60 chars
  const words = t.split(' ').filter(Boolean);
  if (words.length > 8) {
    t = words.slice(0, 8).join(' ');
  }
  if (t.length > 60) {
    t = t.slice(0, 60).trim();
  }

  // Title case-lite: capitalize first letter of words longer than 2 chars
  t = t
    .split(' ')
    .map((w, idx) => {
      if (w.length <= 2 && idx !== 0) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ')
    .trim();

  // Avoid empties or generic
  if (!t || isGenericOrBadTitle(t)) return 'New Document';
  return t;
}

function isGenericOrBadTitle(title) {
  if (!title) return true;
  const t = String(title).trim();
  const generic = new Set([
    'New Document',
    'Untitled',
    'Untitled Document',
    'Document',
  ]);
  if (generic.has(t)) return true;
  // Overly long
  if (t.length > 70) return true;
  // Too many words
  if (t.split(/\s+/).filter(Boolean).length > 10) return true;
  return false;
}

async function generateShortTitleFromContent(content, correlationId) {
  try {
    const openaiClient = await getOpenAIClient();
    const systemPrompt = `You generate short, evocative document titles.
Rules:
- 3 to 6 words
- No punctuation other than spaces
- No quotes
- Descriptive and specific to the document content
- Output ONLY the title, nothing else`;

    const userPrompt = `Content:\n${(content || '').slice(0, 4000)}\n\nTitle:`;

    const resp = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 30,
    });

    let candidate = resp.choices[0]?.message?.content || '';
    candidate = normalizeShortTitle(candidate);
    console.log(`[${correlationId}] Generated short title: "${candidate}"`);
    if (!isGenericOrBadTitle(candidate)) return candidate;
  } catch (err) {
    console.warn(`[${correlationId}] Short title generation failed:`, err);
  }
  return null;
}

async function generateNarrativeUpdate(conversationTurn, existingContent, documentTitle, correlationId) {
  const openaiClient = await getOpenAIClient();

  const systemPrompt = `You are a real-time narrative synthesizer for the Starholder universe.
Take this conversation turn and seamlessly weave it into the existing document.
Write in flowing, engaging prose that captures the essence of the discussion.
Maintain narrative coherence while integrating new information naturally.

IMPORTANT: If the document currently has a generic title like "New Document" or if this is the first substantial content, suggest a short, intelligent title by starting your response with "TITLE: [new title]" on the first line, followed by a blank line, then the document content.

TITLE RULES:
- 3 to 6 words
- No punctuation other than spaces
- No quotes
- Descriptive and specific to this document

Return the complete updated document.`;

  const updatePrompt = `
DOCUMENT: ${documentTitle}

CURRENT CONTENT:
${existingContent}

NEW CONVERSATION:
${conversationTurn}

Integrate this conversation naturally into the document. Return the complete updated text.`;

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: updatePrompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
  });

  let result = response.choices[0]?.message?.content || existingContent;

  // Check if AI suggested a new title (same logic as editing)
  let newTitle = null;
  if (result.startsWith('TITLE: ')) {
    const lines = result.split('\n');
    const titleLine = lines[0];
    newTitle = normalizeShortTitle(titleLine.replace('TITLE: ', '').trim());
    // Remove title line and blank line from content
    result = lines.slice(2).join('\n');
    console.log(`[${correlationId}] AI suggested new title during narrative update: "${newTitle}"`);
  }

  return { content: result, newTitle };
}

async function generateDocumentEdit(editInstructions, existingContent, documentTitle, correlationId) {
  console.log(`[${correlationId}] Generating document edit for: ${documentTitle}`);
  console.log(`[${correlationId}] Edit instructions: ${editInstructions}`);

  const openaiClient = await getOpenAIClient();

  const systemPrompt = `You are a master document editor for the Starholder universe.
You receive specific editing instructions and apply them to existing documents with precision and creativity.
Follow the user's editing directions exactly while maintaining narrative coherence and the document's voice.
You can rework sections, change tone, add dialogue, restructure content, or make any requested modifications.

IMPORTANT: If you feel the document needs a better title after your edits, you may suggest a new title by starting your response with "TITLE: [new title]" on the first line, followed by a blank line, then the document content. The title should be concise and descriptive of the content.

Return the complete updated document after applying the requested changes.`;

  const editPrompt = `
DOCUMENT TITLE: ${documentTitle}

CURRENT DOCUMENT:
${existingContent}

EDITING INSTRUCTIONS:
${editInstructions}

TASK: Apply the editing instructions to the document. Make the requested changes while maintaining quality and coherence. Return the complete updated document.
`;

  console.log(`[${correlationId}] Calling OpenAI for document editing`);

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: editPrompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
  });

  let result = response.choices[0]?.message?.content || existingContent;

  // Check if AI suggested a new title
  let newTitle = null;
  if (result.startsWith('TITLE: ')) {
    const lines = result.split('\n');
    const titleLine = lines[0];
    newTitle = normalizeShortTitle(titleLine.replace('TITLE: ', '').trim());
    // Remove title line and blank line from content
    result = lines.slice(2).join('\n');
    console.log(`[${correlationId}] AI suggested new title: "${newTitle}"`);
  }

  console.log(`[${correlationId}] Document edit completed: ${result.length} chars`);
  return { content: result, newTitle };
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
