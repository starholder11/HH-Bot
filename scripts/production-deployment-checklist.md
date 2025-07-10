# Production Deployment Checklist - Complete File Structure Migration

## Overview
You asked about **"extra YAML that doesn't belong in prod sticking around in prod"** and ensuring all mislocated files from the old structure are removed. This checklist addresses exactly that concern.

## File Structure Migration Summary

### What We Migrated FROM (Old Structure):
```
content/timeline/
├── {slug}.yaml                    # ❌ YAML files at root level
└── {slug}/
    └── body.mdoc                  # ❌ Old content format
```

### What We Migrated TO (New Structure):
```
content/timeline/
└── {slug}/
    ├── index.yaml                 # ✅ YAML in subdirectory  
    └── content.mdx                # ✅ New content format
```

## Production Cleanup Required

### 1. **CRITICAL: Remove Old YAML Files at Root Level**
**Files to Delete in Production:**
- Any `content/timeline/*.yaml` files (should be `content/timeline/{slug}/index.yaml`)

**Impact if Not Removed:**
- Content reader will fail looking for new structure
- 404 errors on timeline pages
- Keystatic editor will break

**Command to Find These:**
```bash
find content/timeline -maxdepth 1 -name "*.yaml" -type f
```

### 2. **CRITICAL: Remove Old body.mdoc Files**
**Files to Delete in Production:**
- Any `content/timeline/*/body.mdoc` files (should be `content/timeline/*/content.mdx`)

**Impact if Not Removed:**
- Keystatic editor will look for wrong files
- Content display may break
- File conflicts

**Command to Find These:**
```bash
find content/timeline -name "body.mdoc" -type f
```

### 3. **CLEANUP: Remove System Files**
**Files to Delete in Production:**
- Any `.DS_Store` files
- Any temporary files from migration

**Command to Find These:**
```bash
find content/timeline -name ".DS_Store" -type f
```

## Assessment Script Results

✅ **GOOD NEWS:** Our local environment shows **NO old structure remnants**!

```
🚀 Starting Production Cleanup Assessment...
🔍 Scanning for old file structure remnants...
📋 PRODUCTION CLEANUP ASSESSMENT REPORT
==================================================
✅ No old file structure remnants found!
   Production environment appears to be clean.
🎉 Production environment is ready for deployment!
```

## But Production May Still Have Old Files!

**IMPORTANT:** The local environment is clean, but production (GitHub repository) might still contain:

1. **Old YAML files** from before the migration
2. **Old body.mdoc files** from before the conversion
3. **Orphaned files** that weren't properly cleaned up

## Pre-Deployment Verification Steps

### Step 1: Check Production Repository
Run these commands to verify what's actually in production:

```bash
# Check for old YAML files at root level
curl -s "https://api.github.com/repos/starholder11/HH-Bot/contents/content/timeline" | grep '\.yaml"'

# Check for body.mdoc files  
curl -s "https://api.github.com/repos/starholder11/HH-Bot/contents/content/timeline" | grep 'body\.mdoc'
```

### Step 2: Manual Verification
1. Visit your live GitHub repository
2. Navigate to `content/timeline/`
3. Look for any files ending in `.yaml` at the root level
4. Check individual directories for `body.mdoc` files

### Step 3: Automated Cleanup (If Needed)
If old files are found in production, create a cleanup PR:

```bash
# Remove old YAML files at root level
find content/timeline -maxdepth 1 -name "*.yaml" -type f -delete

# Remove old body.mdoc files  
find content/timeline -name "body.mdoc" -type f -delete

# Remove system files
find content/timeline -name ".DS_Store" -type f -delete

# Commit cleanup
git add .
git commit -m "PRODUCTION CLEANUP: Remove old file structure remnants

- Delete YAML files at content/timeline root level  
- Delete body.mdoc files (replaced with content.mdx)
- Remove .DS_Store system files

All content has been migrated to new structure:
- content/timeline/{slug}/index.yaml
- content/timeline/{slug}/content.mdx"
```

## Code Updates for Production

### Updated Files That Reference New Structure:
✅ **lib/content-reader.ts** - Now looks for `index.yaml` and `content.mdx`
✅ **lib/search/search-index.ts** - Updated for new file paths
✅ **All scripts** - Use new structure

### Files That Must Work With New Structure:
- Content display pages (`/timeline/[slug]`)
- Keystatic admin interface
- Search functionality
- AI sync processes

## Production Deployment Safety Steps

### 1. Backup Current Production
```bash
git branch production-backup-$(date +%Y%m%d)
```

### 2. Test New Structure
- Verify all 340 timeline entries load correctly
- Test Keystatic editor functionality
- Verify search works
- Test content reader functions

### 3. Deploy in Stages
1. **First:** Deploy code updates (content-reader, search-index)
2. **Second:** Clean up old files (if any exist)
3. **Third:** Verify everything works

## Verification Commands

Run these after deployment to ensure cleanup succeeded:

```bash
# Should return empty (no old YAML files at root)
find content/timeline -maxdepth 1 -name "*.yaml" -type f

# Should return empty (no old body.mdoc files)
find content/timeline -name "body.mdoc" -type f

# Should return 340 entries (all in new structure)
find content/timeline -name "index.yaml" -type f | wc -l

# Should return 340 entries (all content files)
find content/timeline -name "content.mdx" -type f | wc -l
```

## Expected Results
- **340 timeline entries** in new structure
- **0 old YAML files** at root level
- **0 body.mdoc files** anywhere
- **All content accessible** via new paths

## Success Criteria
✅ No 404 errors on timeline pages  
✅ Keystatic editor loads all entries  
✅ Content reader finds all files  
✅ Search indexing works  
✅ No orphaned files in repository  

---

**Bottom Line:** You're absolutely right to be concerned about old files in production. The local environment is clean, but we need to verify and potentially clean up the production repository before deploying the new code that expects the new file structure. 