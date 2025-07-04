# TASK TEMPLATE - USE THIS FORMAT FOR ALL KEYSTATIC TASKS

## Task: [Specific task name from IMPLEMENTATION_PHASES.md]

### Goal: 
[One sentence describing what this task accomplishes]

### Context:
[Brief explanation of why this task is needed and how it fits into the overall Keystatic implementation]

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

### Validation Steps:
1. [Step 1 to verify the task is complete]
2. [Step 2 to verify the task is complete] 
3. [Step 3 to verify the task is complete]
4. Test chatbot functionality at /chat
5. Verify no console errors
6. Confirm content structure maintains AI integration compatibility

---

## Example Usage:

# Task: Install Keystatic Packages

### Goal: 
Add Keystatic CMS packages to the project and remove TinaCMS dependencies

### Context:
This is the foundation step to replace TinaCMS with Keystatic for truly self-hosted content management that works with our AI integration requirements.

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
1. Run npm install successfully
2. Run npm run dev without errors
3. Test chatbot at /chat works normally
4. Verify no TinaCMS references remain
