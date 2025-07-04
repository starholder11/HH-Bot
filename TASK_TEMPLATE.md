# TASK TEMPLATE - USE THIS FORMAT FOR ALL KEYSTATIC TASKS

## Task: [Specific task name from IMPLEMENTATION_PHASES.md]

### Goal: 
[One sentence describing what this task accomplishes]

### Context:
[Brief explanation of why this task is needed and how it fits into the overall Keystatic implementation]

### CRITICAL RESEARCH REQUIREMENTS:
- [ ] **NEVER invent imports, functions, or patterns** - Only use documented APIs
- [ ] **Verify all imports exist** - Check actual package exports before using
- [ ] **Research official documentation** - Find real examples, not assumptions
- [ ] **No lazy workarounds** - If something doesn't work, research the correct approach
- [ ] **Ask for clarification** - Don't guess when uncertain about implementation

### Constraints:
- [ ] Do not modify files listed in DONT_TOUCH.md
- [ ] Follow project structure defined in PROJECT_CONTEXT.md  
- [ ] Preserve all existing chatbot functionality
- [ ] Maintain git-based content storage for AI integration
- [ ] Ensure Vercel deployment compatibility
- [ ] [Any task-specific constraints]

### Acceptance Criteria:
- [ ] [Specific deliverable 1]
- [ ] [Specific deliverable 2]
- [ ] [Specific deliverable 3]
- [ ] Existing chatbot at /chat still works perfectly
- [ ] No TypeScript compilation errors
- [ ] No runtime errors in browser console
- [ ] Vercel deployment succeeds

### Files to Create/Modify:
**Create:**
- [List specific new files to create]

**Modify:**
- [List specific files to modify - must not include DONT_TOUCH files]

**Delete:**
- [List TinaCMS files to remove, if applicable]

### Implementation Notes:
[Any specific technical details, Keystatic configuration requirements, or implementation guidance]

### When Implementation Fails:
**If imports don't work:**
1. STOP immediately - do not invent alternatives
2. Research official documentation for correct imports
3. Check actual package exports in node_modules
4. Report findings and ask for guidance

**If patterns don't work:**
1. STOP immediately - do not create workarounds  
2. Research official examples and documentation
3. Verify you're following documented patterns exactly
4. Report what you found and ask for clarification

**NEVER:**
- Invent function names or import paths
- Delete code that doesn't work without understanding why
- Assume patterns without verification
- Create custom solutions when official ones should exist

### Validation Steps:
1. **FIRST: Verify all imports exist** - Check node_modules and package exports
2. **Research validation** - Confirm patterns match official documentation
3. [Step 3 to verify the task is complete] 
4. [Step 4 to verify the task is complete]
5. Test chatbot functionality at /chat
6. Verify no console errors
7. Confirm content structure maintains AI integration compatibility

---

## Example Usage:

# Task: Install Keystatic Packages

### Goal: 
Add Keystatic CMS packages to the project and remove TinaCMS dependencies

### Context:
This is the foundation step to replace TinaCMS with Keystatic for truly self-hosted content management that works with our AI integration requirements.

### CRITICAL RESEARCH REQUIREMENTS:
- [ ] **Research exact package names** - Verify @keystatic/core and @keystatic/next exist
- [ ] **Check compatibility** - Ensure packages work with Next.js 14
- [ ] **No assumptions** - Use only documented package names and versions
- [ ] **Verify installation** - Confirm packages actually install and import correctly

### Constraints:
- [ ] Do not modify files listed in DONT_TOUCH.md
- [ ] Only modify package.json for dependency changes
- [ ] Preserve all existing chatbot functionality

### Acceptance Criteria:
- [ ] TinaCMS packages completely removed from package.json
- [ ] Keystatic packages installed (@keystatic/core, @keystatic/next)
- [ ] npm install runs without errors
- [ ] Existing chatbot at /chat still works perfectly

### Validation Steps:
1. **FIRST: Verify packages exist** - Check npm registry for real package names
2. **Research validation** - Confirm packages are officially maintained
3. Run npm install successfully
4. Run npm run dev without errors
5. Test chatbot at /chat works normally
6. Verify no TinaCMS references remain
