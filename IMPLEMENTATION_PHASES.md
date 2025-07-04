## 4. IMPLEMENTATION_PHASES.md

```markdown
# IMPLEMENTATION PHASES - KEYSTATIC CMS INTEGRATION

## Phase 1: Clean Up and Setup (30 minutes)

### Task 1.1: Remove TinaCMS Completely
- Remove all TinaCMS packages from package.json
- Delete tina/ directory
- Delete pages/api/tina/ directory  
- Remove any TinaCMS imports and references
- Clean up environment variables related to TinaCMS

### Task 1.2: Install Keystatic
- Install @keystatic/core and @keystatic/next packages
- Verify installation and dependencies

### Task 1.3: Basic Keystatic Configuration
- Create keystatic.config.tsx in project root
- Set up basic timeline collection schema
- Configure git-based storage

## Phase 2: Admin Interface Setup (45 minutes)

### Task 2.1: Create Admin Route
- Create app/keystatic/[[...params]]/page.tsx
- Set up Keystatic route handler
- Test admin interface accessibility

### Task 2.2: Configure Authentication
- Implement Keystatic authentication
- Secure admin access
- Test login functionality

### Task 2.3: Content Schema Configuration  
- Define timeline collection fields
- Configure markdown format
- Set up proper URL routing

## Phase 3: Content Migration and Display (30 minutes)

### Task 3.1: Content Directory Setup
- Migrate existing timeline content to Keystatic format
- Ensure proper markdown formatting
- Test content accessibility

### Task 3.2: Content Display Pages
- Update timeline display for Keystatic compatibility
- Test content rendering
- Ensure internal linking works

### Task 3.3: Navigation Updates
- Update navigation for new admin interface
- Test user flow between sections

## Phase 4: Testing and Deployment (30 minutes)

### Task 4.1: Local Testing
- Test all functionality locally
- Verify admin interface works
- Test content creation and editing

### Task 4.2: Vercel Deployment
- Deploy to Vercel
- Test production deployment
- Verify admin access in production

### Task 4.3: AI Integration Prep
- Verify content files accessible for OpenAI
- Document structure for AI pipeline
- Prepare for content generation workflow

## Success Metrics
- [ ] Keystatic admin accessible with authentication
- [ ] Content manageable through visual interface
- [ ] Markdown files properly stored in git
- [ ] Existing chatbot functionality preserved
- [ ] Production deployment working
- [ ] Ready for AI content integration
