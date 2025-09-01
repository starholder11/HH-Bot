# SHADOW GRAPHS: SYSTEM ARCHITECTURE
## How the System Actually Works

---

## **DATA FLOW: NOVEL IN, GRAPH OUT**

You start with a novel stored as JSON files with chapters and scenes. The system processes this through several stages to end up with a 3D explorable graph.

### **Stage 1: Text Breakdown**
The system takes your novel text and sends it to Claude or GPT-4. The AI reads each scene and breaks it into smaller chunks called "text roots." Each text root is a meaningful piece - maybe a character action, a setting description, or an emotional moment.

For example: "Almond Al stood in the withered grove, his weathered hands tracing the bark of trees that had known better years" becomes two text roots:
- "Almond Al stood in the withered grove" (concrete setting + character)  
- "his weathered hands tracing bark of trees that had known better years" (character action + nostalgic tone)

Each text root gets tagged with properties:
- How concrete vs abstract it is
- What emotion it carries (0.0 to 1.0 scale)
- What narrative function it serves
- How suitable it is for generating images, audio, etc.

### **Stage 2: Relationship Discovery**
The AI looks at all the text roots and finds connections between them. It creates relationships like:
- "This character appears in these scenes" 
- "These two moments have similar emotional tones"
- "This event causes that consequence"
- "These settings share thematic elements"

Each relationship gets a weight from 0.0 to 1.0 showing how strong the connection is.

### **Stage 3: Graph Storage**
All of this goes into Neo4j, a database designed for storing connected data. Neo4j holds:
- All the text root nodes with their properties
- All the relationship connections with their weights
- Chapter and scene structure information
- Generated content references

### **Stage 4: Content Generation**
The system looks at high-priority text roots and generates multiple types of content:
- Sends scene descriptions to Flux to generate images
- Sends atmospheric descriptions to ElevenLabs to generate ambient audio
- Creates 3D environment data for spatial manifestations
- Links all generated content back to its source text root

### **Stage 5: 3D Visualization**
When someone wants to explore the graph, the system:
- Queries Neo4j for the relevant nodes and relationships
- Transforms the data into a format 3d-force-graph can understand
- Renders it as an interactive 3D network in the web browser
- Handles user clicks and navigation through the 3D space

---

## **CORE COMPONENTS**

### **Neo4j Graph Database**
This is where all the semantic intelligence lives. Neo4j stores your story as a network of connected nodes instead of traditional rows and columns.

**What it holds:**
- Text root nodes: The semantic chunks with all their properties
- Relationship edges: Connections between text roots with strength weights
- Chapter/scene structure: The original narrative organization
- Manifestation records: References to generated images, audio, etc.

**Why Neo4j specifically:**
- Built for connected data queries like "find all scenes connected to this character"
- Can handle thousands of relationships efficiently
- Updates relationship weights in real-time as users explore
- Has a query language (Cypher) designed for asking questions about connections

### **AI Processing Pipeline**
Multiple AI models work in sequence:

**Text Analysis (Claude/GPT-4):**
- Reads raw novel text
- Identifies semantic boundaries (where one meaningful concept ends and another begins)
- Extracts emotional tone, abstraction level, narrative function
- Suggests what types of media could represent each concept

**Relationship Analysis (Claude/GPT-4):**
- Compares text roots to find thematic connections
- Identifies cause-and-effect relationships
- Maps character appearances across scenes
- Calculates relationship strength scores

**Content Generation APIs:**
- Flux: Creates images from text descriptions
- ElevenLabs: Generates ambient audio and sound effects
- Custom tools: Build 3D environment data

### **3d-force-graph Visualization Engine**
This JavaScript library turns the Neo4j data into navigable 3D space.

**How it works:**
- Takes nodes (text roots) and edges (relationships) as input
- Uses physics simulation to position related nodes near each other
- Renders everything as 3D objects you can fly around
- Handles user interaction like clicking nodes and following connections

**What you see:**
- Text roots appear as floating spheres or custom shapes
- Stronger relationships pull nodes closer together in 3D space
- Generated images can be textured onto nodes
- Relationship lines show connections with thickness indicating strength

### **Web Application Layer**
A React-based web app that coordinates everything:
- Handles user authentication and permissions
- Manages the AI processing pipeline
- Queries Neo4j for graph data
- Renders the 3d-force-graph visualization
- Provides timeline view as an alternative to spatial view

---

## **TWO VIEW MODES**

### **Timeline Mode: Enhanced Linear Reading**
The story appears as a horizontal timeline flowing left to right. Each scene is a node you can click to see:
- Generated images showing the scene visually  
- Ambient audio that matches the setting
- Connections to related scenes, characters, or themes
- The original text with enhanced context

This preserves traditional reading flow while adding rich media and connection discovery.

### **Spatial Mode: 3D Story Exploration** 
Switch to spatial mode and the same content becomes a 3D constellation:
- Related concepts cluster together in space
- Character arcs form visible paths through the network
- Themes create layers at different depths
- You fly through the story space discovering connections

The 3d-force-graph library handles the physics to position everything based on relationship strengths.

---

## **CANONICAL VS DERIVATIVE ARCHITECTURE**

### **Canonical Graphs: The Master Version**
When you process a novel, it creates an immutable canonical graph:
- Contains the authoritative version of all text roots and relationships
- Creator has approved all AI-discovered connections
- Generated manifestations represent the creator's intended vision
- Cannot be modified by readers or other users

### **Derivative Graphs: Personal Exploration Copies**
Users can create derivative versions for their own exploration:
- Copies selected portions of the canonical graph
- User can modify relationship weights based on their interpretation
- Can generate alternative manifestations
- Can add personal annotations and connections
- Never affects the original canonical version

**How derivatives work technically:**
- New graph nodes in Neo4j that reference canonical text roots
- Inheritance relationships track what came from where
- Modifications are stored separately from canonical data
- Users can share their derivative interpretations

---

## **DATA STRUCTURES**

### **Text Root Node**
```
Text Root:
- ID: unique identifier
- Content: the actual text chunk (5-50 words typically)
- Semantic properties: abstraction level, emotional tone, narrative function
- Manifestation potential: how well it could become images, audio, 3D space
- Constraint parameters: requirements for any generated content
- Chapter/scene location: where it appears in the original structure
```

### **Relationship Edge**
```
Relationship:
- Source node ID and target node ID
- Relationship type: thematic, causal, character-based, setting-based, etc.
- Weight: 0.0 to 1.0 strength score
- Confidence: how certain the AI was about this connection
- Evolution data: how the relationship has changed through user interaction
```

### **Manifestation Record**
```
Manifestation:
- ID: unique identifier  
- Parent text root: which semantic chunk it represents
- Type: image, audio, 3D environment, etc.
- Asset reference: URL or file path to the actual generated content
- Generation metadata: which AI model created it, when, with what prompt
- Quality scores: how well it represents the original text root
```

---

## **PROCESSING PIPELINE**

### **Input: JSON Timeline**
Your source material as structured data:
```
Novel:
  - Title, author, metadata
  - Chapters:
    - Chapter title, order
    - Scenes:
      - Scene title, order
      - Raw text content
```

### **Step 1: Content Ingestion**
- Parse JSON structure
- Create chapter and scene nodes in Neo4j
- Validate text content and structure
- Set up processing job queue

### **Step 2: Semantic Analysis** 
- Send each scene's text to Claude/GPT-4
- AI breaks text into meaningful semantic chunks
- Extract properties for each chunk (emotion, abstraction, function)
- Create text root nodes in Neo4j with all properties

### **Step 3: Relationship Discovery**
- AI analyzes all text roots together
- Identifies connections based on content similarity, narrative causation, character presence
- Calculates relationship weights
- Creates relationship edges in Neo4j

### **Step 4: Manifestation Generation**
- Prioritize text roots based on narrative importance and manifestation potential
- Generate prompts for different content types
- Send to appropriate AI services (Flux for images, ElevenLabs for audio)
- Store generated content and create manifestation records
- Link manifestations back to their source text roots

### **Step 5: Graph Optimization**
- Index Neo4j for fast queries
- Validate relationship consistency
- Calculate initial positioning hints for 3D visualization
- Mark canonical graph as complete and immutable

### **Output: Explorable Graph**
- Neo4j database containing the complete semantic network
- Generated manifestations (images, audio, 3D assets)
- Web interface that can render timeline or spatial views
- API endpoints for querying relationships and content

---

## **USER INTERACTION FLOW**

### **Content Creator Workflow**
1. Upload novel as JSON or paste manuscript text
2. System processes (20-90 minutes depending on length)
3. Review AI-discovered relationships and approve/adjust
4. System generates manifestations for priority scenes
5. Publish canonical graph for readers to explore

### **Reader Exploration Workflow**
1. Access published Shadow Graph via web URL
2. Choose timeline mode (familiar) or spatial mode (exploratory)
3. Navigate through story by clicking nodes and following connections
4. See generated images, hear ambient audio, explore 3D environments
5. Discover story relationships and themes through spatial navigation
6. Optionally create derivative graph for personal exploration

---

## **TECHNICAL STACK**

### **Backend Services**
- **Neo4j**: Graph database for relationship storage
- **Node.js API**: Handles processing pipeline and user requests
- **Redis**: Caches frequently-accessed graph data
- **PostgreSQL**: User accounts, permissions, job tracking
- **AWS S3**: Storage for generated images, audio, 3D assets

### **AI Services**  
- **Anthropic Claude or OpenAI GPT-4**: Text analysis and relationship discovery
- **Black Forest Labs Flux**: Image generation
- **ElevenLabs**: Audio generation
- **Custom spatial tools**: 3D environment creation

### **Frontend**
- **React**: User interface and state management
- **3d-force-graph**: Interactive 3D network visualization  
- **WebGL**: Hardware-accelerated 3D rendering
- **WebSocket**: Real-time updates during exploration

### **Infrastructure**
- **Docker containers**: All services containerized
- **Kubernetes**: Orchestration and scaling
- **CloudFlare**: CDN for generated assets
- **Monitoring**: Prometheus + Grafana for system health

---

## **KEY TECHNICAL DECISIONS**

### **Why Neo4j for Storage**
Traditional databases store data in tables. Stories are networks of connected concepts. Neo4j is built specifically for connected data, making queries like "find all scenes emotionally similar to this one" fast and natural.

### **Why 3d-force-graph for Visualization**
Most graph visualization tools are designed for technical network analysis. 3d-force-graph creates beautiful, interactive 3D experiences that feel more like exploring a world than analyzing data.

### **Why AI Pipeline vs Manual Curation**
A novel might have hundreds of scenes and thousands of potential relationships. Manual relationship mapping would take months. AI can discover meaningful connections in minutes, then humans validate the most important ones.

### **Why Web-Based vs Native App**
3D visualization in browsers has reached the point where complex networks render smoothly without special software. Web deployment means immediate access and easy sharing of explorable graphs.

### **Why Canonical/Derivative Split**
Creators need to control how their work is presented while readers want to explore and interpret. The canonical/derivative model preserves both creative control and reader agency.

---

## **SYSTEM CONSTRAINTS**

### **Processing Limits**
- Novels up to 200,000 words (larger works need chunking)
- Processing time scales with length (30-90 minutes typical)
- AI API costs limit manifestation generation to priority content

### **Performance Boundaries** 
- 3D visualization smooth up to ~5,000 nodes
- Relationship queries fast up to ~10,000 connections  
- Concurrent user limit depends on graph complexity

### **Content Quality Dependencies**
- Relationship discovery quality depends on source text richness
- Manifestation quality depends on how descriptive the text is
- 3D navigation requires meaningful relationship weights to position nodes well

The system works best with rich, descriptive narrative content where relationships between story elements are present in the text itself.