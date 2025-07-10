# Production Cleanup Plan - Timeline Migration

## Overview
Before deploying to production, we need to clean up old file structures and update code that references the previous timeline organization.

## Issues Identified

### 1. Content Reader Still References Old Structure
**File:** `lib/content-reader.ts`
**Problem:** Still looking for old file structure:
- Looking for `body.mdoc` files instead of `content.mdx`
- Looking for YAML files at `content/timeline/{slug}.yaml` instead of `content/timeline/{slug}/index.yaml`

**Action Required:** Update content-reader.ts to use new file structure

### 2. Potential GraphQL/API Issues
**Problem:** Any GraphQL resolvers or API endpoints that use the content-reader will fail because they're looking for files that no longer exist.

**Action Required:** Test all API endpoints that read timeline content

### 3. System Files to Clean
**Files Found:**
- `content/timeline/.DS_Store` (should be removed)

### 4. Search Index Configuration
**Problem:** Search indexing code might still reference old file paths

**Action Required:** Update search-related code to use new structure

## Current Working Structure
✅ **Correct Structure (340 entries):**
```
content/timeline/{slug}/
├── index.yaml           # Metadata (title, date, categories, etc.)
└── content.mdx         # Main content (sanitized MDX)
```

✅ **Keystatic Configuration:** Uses `slugField: 'title'` with directory-based collections

✅ **Content Sanitization:** All HTML issues resolved, 340 entries tested and working

## Action Plan

### Phase 1: Update Code References
1. **Fix content-reader.ts** - Update to use new file structure
2. **Update any search indexing** - Ensure it looks in correct paths
3. **Test all API endpoints** - Verify timeline data loads correctly

### Phase 2: Clean System Files
1. Remove `.DS_Store` files
2. Verify no orphaned files exist

### Phase 3: Deployment Verification
1. Test public timeline pages work
2. Test Keystatic editor functionality
3. Verify search functionality
4. Test any ChatBot integration with timeline data

## Risk Assessment
- **High Risk:** Content-reader.ts issues will break public timeline pages
- **Medium Risk:** Search functionality may fail if not updated
- **Low Risk:** System files are cosmetic but should be cleaned

## Success Criteria
- All 340 timeline entries load correctly on public pages
- Keystatic editor remains functional (already verified)
- Search functionality works with new structure
- No 404 errors or GraphQL failures related to timeline content 