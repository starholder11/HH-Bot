import { NextRequest, NextResponse } from 'next/server';
import {
  createTextAsset,
  generateUniqueTextSlug,
  validateTextAsset,
  isTextAsset,
  findTextAssetBySlug
} from '@/lib/media-storage';
import { saveMediaAsset } from '@/lib/media-storage';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint for S3 text assets
 * POST /api/text-assets/test-s3
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, categories, source, status, test_action } = body;

    switch (test_action) {
      case 'create': {
        // Generate unique slug
        const slug = await generateUniqueTextSlug(title || 'Test Document');

        // Create text asset
        const textAsset = createTextAsset({
          slug,
          title: title || 'Test Document',
          content: content || '# Test Document\n\nThis is a test text asset created via S3 storage.',
          categories: categories || ['test'],
          source: source || 'layout',
          status: status || 'draft',
        });

        // Validate
        const errors = validateTextAsset(textAsset);
        if (errors.length > 0) {
          return NextResponse.json({
            success: false,
            error: 'Validation failed',
            details: errors
          }, { status: 400 });
        }

        // Save to S3
        await saveMediaAsset(textAsset.id, textAsset);

        return NextResponse.json({
          success: true,
          action: 'create',
          asset: {
            id: textAsset.id,
            slug: textAsset.metadata.slug,
            title: textAsset.title,
            media_type: textAsset.media_type,
            content_length: textAsset.content.length,
            word_count: textAsset.metadata.word_count,
            reading_time: textAsset.metadata.reading_time_minutes
          }
        });
      }

      case 'find_by_slug': {
        const { slug } = body;
        if (!slug) {
          return NextResponse.json({
            success: false,
            error: 'Slug is required for find_by_slug action'
          }, { status: 400 });
        }

        const textAsset = await findTextAssetBySlug(slug);

        return NextResponse.json({
          success: true,
          action: 'find_by_slug',
          found: !!textAsset,
          asset: textAsset ? {
            id: textAsset.id,
            slug: textAsset.metadata.slug,
            title: textAsset.title,
            content_preview: textAsset.content.substring(0, 100) + '...',
            created_at: textAsset.created_at
          } : null
        });
      }

      case 'validate': {
        const testAsset = {
          id: crypto.randomUUID(),
          title,
          content: content || '',
          metadata: {
            slug: body.slug || 'test-slug',
            source: source || 'layout',
            status: status || 'draft',
            categories: categories || []
          },
          date: new Date().toISOString()
        };

        const errors = validateTextAsset(testAsset);

        return NextResponse.json({
          success: true,
          action: 'validate',
          valid: errors.length === 0,
          errors
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid test_action. Use: create, find_by_slug, validate'
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[text-assets-test] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Get test instructions
 * GET /api/text-assets/test-s3
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'S3 Text Assets Test Endpoint',
    usage: {
      create: {
        method: 'POST',
        body: {
          test_action: 'create',
          title: 'My Test Document',
          content: '# Hello World\n\nThis is test content.',
          categories: ['test', 'example'],
          source: 'layout',
          status: 'draft'
        }
      },
      find_by_slug: {
        method: 'POST',
        body: {
          test_action: 'find_by_slug',
          slug: 'my-test-document'
        }
      },
      validate: {
        method: 'POST',
        body: {
          test_action: 'validate',
          title: 'Test Title',
          content: 'Test content',
          slug: 'test-slug',
          source: 'layout',
          status: 'draft',
          categories: ['test']
        }
      }
    }
  });
}
