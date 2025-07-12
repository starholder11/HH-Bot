# Cursor + Front Matter CMS Setup for HH-Bot

## Overview
This setup enhances your Keystatic workflow with Cursor AI and Front Matter CMS, providing better visual layout assistance while maintaining pure markdown files.

## What's Been Configured

### 1. Front Matter CMS Configuration
- **Content Types**: Timeline year entries and regular timeline entries
- **Layout Templates**: narrative-story, character-profile, world-building
- **Styling Themes**: dark-futuristic, light-minimal, cyberpunk, classic
- **Grid Layouts**: single-column, 2-column, 3-column, hero-content

### 2. Cursor AI Rules
- **Keystatic Layout Rules**: Guidelines for markdown purity and structure
- **Timeline Templates**: Reference templates for different content types
- **Advanced Templating**: Complex layout guidelines

### 3. Custom Scripts
- **Slug Generator**: Automatically creates URL-friendly slugs from titles

## Installation Steps

### 1. Install Front Matter CMS Extension
1. Open Cursor
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Front Matter CMS"
4. Install: `eliostruyf.vscode-front-matter`

### 2. Initialize Front Matter CMS
1. Open your HH-Bot project in Cursor
2. Click the Front Matter icon in the Activity Bar (FM icon)
3. Click "Initialize project" on the welcome screen
4. Select "Other" as your framework
5. The configuration will automatically load from `frontmatter.json`

### 3. Verify Cursor AI Rules
1. Open any markdown file
2. Use Cursor AI with references like "@timeline-templates"
3. Test layout generation with "@keystatic-layouts"

## Usage Workflow

### Creating New Content
1. **Use Front Matter Dashboard**: Click the FM icon to see content overview
2. **Create New Entry**: Use the "+" button to create new timeline entries
3. **Fill Frontmatter**: Use the form to set title, layout, theme, etc.
4. **Write Content**: Use the WYSIWYG editor or pure markdown
5. **Preview**: Use Front Matter's preview functionality

### Editing Existing Content
1. **Open in Front Matter**: Use the dashboard to browse and edit
2. **Use Cursor AI**: Reference templates with "@timeline-templates"
3. **Maintain Structure**: Follow the layout guidelines in `.cursor/rules/`

### Layout Templates Available
- **narrative-story**: For story-driven entries
- **character-profile**: For character introductions
- **world-building**: For locations and settings
- **timeline-entry**: For general timeline events

## File Structure
```
HH-Bot/
├── frontmatter.json              # Front Matter CMS configuration
├── .cursor/
│   └── rules/
│       ├── keystatic-layouts.mdc    # Layout guidelines
│       ├── timeline-templates.md     # Template references
│       └── advanced-templating.mdc  # Complex layout rules
├── .frontmatter/
│   └── scripts/
│       └── generate-slug.js         # Custom slug generator
└── .vscode/
    └── settings.json                # Cursor/VS Code settings
```

## Troubleshooting

### Front Matter CMS Issues
- **Panel not showing**: Restart Cursor, check if extension is enabled
- **Configuration not loading**: Verify `frontmatter.json` is in project root
- **Preview not working**: Check that content folders are properly configured

### Cursor AI Issues
- **Rules not working**: Restart Cursor to reload configurations
- **Templates not found**: Verify `.cursor/rules/` files exist
- **AI not responding**: Check that rules are properly formatted

### Keystatic Integration
- **Admin interface issues**: Clear browser cache, restart dev server
- **File conflicts**: Monitor file watching, disable real-time features if needed
- **Deployment issues**: Verify git integration works with both tools

## Next Steps

1. **Test the setup** by creating a new timeline entry
2. **Customize templates** based on your specific needs
3. **Develop more scripts** for repetitive tasks
4. **Refine rules** based on usage patterns
5. **Explore advanced features** like image optimization

## Rollback Plan

If issues occur:
1. Disable Front Matter CMS extension
2. Remove `frontmatter.json` and `.frontmatter/` folder
3. Delete `.cursor/rules/` directory
4. Restore from git backup: `git reset --hard [backup-commit]`
5. Verify Keystatic functionality

## Support

- **Front Matter CMS**: [Documentation](https://frontmatter.codes/)
- **Cursor AI**: [Documentation](https://cursor.sh/docs)
- **Keystatic**: [Documentation](https://keystatic.com/)
