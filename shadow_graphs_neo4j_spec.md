# SHADOW GRAPHS: NEO4J IMPLEMENTATION ARCHITECTURE
## Comprehensive Product and Technical Specification

### **EXECUTIVE SUMMARY**

Shadow Graphs represents a semantic-first approach to creating explorable, evolving media experiences from text-based content. This specification details the implementation architecture using Neo4j as the core graph database, paired with AI processing pipelines to create persistent semantic relationships that enable multi-modal content exploration while preserving narrative integrity.

The system transforms static text (novels, conversations, scripts) into dynamic, explorable graphs where semantic meaning becomes the organizing principle for infinite manifestation possibilities. Unlike traditional media systems that treat assets as isolated files, Shadow Graphs creates living relationship networks where text serves as semantic DNA that can spawn contextually consistent manifestations across any media type.

This specification focuses on canonical processing architecture, establishing the foundation for future user-generated content and derivative graph capabilities.

---

## **CORE ARCHITECTURAL PRINCIPLES**

### **1. Semantic DNA Model**
Text content serves as the genetic code for all media manifestations. Every piece of generated content (visual, audio, video, spatial) must trace its semantic lineage back to specific text root nodes, ensuring consistency and meaning preservation across infinite variations.

### **2. Graph-First Data Architecture**
Relationships between semantic concepts are first-class citizens, not afterthoughts. The graph structure captures not just connections but the evolving strength and nature of those relationships, enabling intelligent content discovery and generation guidance.

### **3. Canonical Immutability with Derivative Evolution**
Source content creates immutable canonical graphs that serve as authoritative semantic foundations. User interactions and explorations spawn derivative child graphs that inherit from canon but can evolve independently, preserving both consistency and creative freedom.

### **4. Multi-Modal Manifestation Coherence**
A single semantic concept can manifest across multiple media types while maintaining thematic and narrative consistency. The system ensures that visual, audio, and spatial representations of the same text root feel cohesively connected.

### **5. Timeline-Preserving Spatial Exploration**
Linear narrative structures (novels, scripts) maintain their intended flow while enabling deep spatial exploration of individual scenes or concepts. Users can follow the story traditionally or dive into rich semantic exploration without losing narrative context.

---

## **SYSTEM ARCHITECTURE OVERVIEW**

### **Data Flow Pipeline**
```
Source JSON Timeline → Neo4j Ingestion → AI Processing Pipeline → Canonical Graph → Derivative Spawning → User Interfaces
```

### **Core Components**
1. **Source Content Repository**: JSON-based timeline storage for canonical text
2. **Neo4j Graph Database**: Semantic relationship storage and querying engine
3. **AI Processing Pipeline**: Multi-model semantic analysis and relationship discovery
4. **Manifestation Factory System**: Multi-modal content generation coordination
5. **Graph Rendering Engine**: Multiple view modes (timeline, spatial, network)
6. **Derivative Graph Manager**: Child graph spawning and inheritance management

---

## **NEO4J GRAPH SCHEMA DESIGN**

### **Core Node Types**

#### **CanonGraph Node**
```cypher
CREATE (canon:CanonGraph {
  id: "shadow_graph_001",
  title: "Almond Al: The Withered Grove",
  source_type: "novel",
  created_at: datetime(),
  processing_status: "complete",
  version: "1.0",
  metadata: {
    total_chapters: 12,
    total_scenes: 47,
    word_count: 85000,
    genre: "literary_fiction",
    themes: ["drought", "memory", "community", "resilience"]
  }
})
```

#### **TextRoot Node**
```cypher
CREATE (root:TextRoot {
  id: "text_root_001",
  canon_id: "shadow_graph_001",
  content: "Almond Al stood in the withered grove, his weathered hands tracing the bark of trees that had known better years.",
  content_hash: "sha256_hash_for_deduplication",
  narrative_position: {
    chapter: 1,
    scene: 1,
    paragraph: 1,
    sequence_order: 1
  },
  semantic_properties: {
    abstraction_level: "concrete",
    emotional_tone: 0.3,
    narrative_function: "character_introduction",
    setting_type: "environmental",
    temporal_moment: "present_action"
  },
  manifestation_potential: {
    visual_viability: 0.9,
    audio_viability: 0.7,
    spatial_viability: 0.8,
    video_viability: 0.8
  },
  constraint_parameters: {
    must_include: ["character_male_elderly", "grove_setting", "withered_trees"],
    emotional_range: [0.2, 0.4],
    style_consistency: "literary_realism",
    temporal_consistency: "late_afternoon"
  }
})
```

#### **Manifestation Node**
```cypher
CREATE (manifest:Manifestation {
  id: "manifest_001a",
  parent_text_root: "text_root_001",
  manifestation_type: "visual",
  media_asset_reference: "s3://bucket/images/almond_grove_wide_001.jpg",
  generation_metadata: {
    model_used: "flux-1.1-pro",
    prompt_engineered: "Cinematic wide shot of elderly man in withered almond grove...",
    generation_timestamp: datetime(),
    processing_time_seconds: 4.2,
    quality_score: 0.87
  },
  semantic_fidelity: {
    content_accuracy: 0.91,
    style_consistency: 0.88,
    constraint_compliance: 0.94
  },
  usage_analytics: {
    view_count: 0,
    interaction_duration: 0.0,
    user_rating: null,
    manifestation_effectiveness: null
  }
})
```

#### **Chapter and Scene Nodes**
```cypher
CREATE (chapter:Chapter {
  id: "chapter_001",
  canon_id: "shadow_graph_001",
  title: "The Grove Remembers",
  order_sequence: 1,
  word_count: 3200,
  estimated_read_time: 12,
  thematic_focus: ["setting_establishment", "character_introduction", "conflict_setup"]
})

CREATE (scene:Scene {
  id: "scene_001_001",
  chapter_id: "chapter_001",
  canon_id: "shadow_graph_001",
  title: "Al Among the Trees",
  order_sequence: 1,
  narrative_function: "opening_scene",
  setting: "almond_grove_dawn",
  characters_present: ["almond_al"],
  mood_trajectory: "contemplative_to_concerned"
})
```

### **Relationship Types**

#### **Narrative Flow Relationships**
```cypher
// Sequential narrative progression
CREATE (text_root_001)-[:FOLLOWED_BY {
  weight: 1.0,
  narrative_necessity: "required",
  temporal_gap: "immediate",
  causation_strength: 0.8
}]->(text_root_002)

// Hierarchical content structure
CREATE (chapter_001)-[:CONTAINS {
  weight: 1.0,
  containment_type: "structural"
}]->(scene_001_001)

CREATE (scene_001_001)-[:CONTAINS {
  weight: 1.0,
  containment_type: "semantic"
}]->(text_root_001)
```

#### **Semantic Relationship Types**
```cypher
// Thematic connections
CREATE (text_root_001)-[:RELATES_TO {
  weight: 0.8,
  relationship_type: "thematic",
  semantic_similarity: 0.75,
  discovered_by: "semantic_analysis_model",
  confidence: 0.87,
  evolution_potential: "high"
}]->(text_root_015)

// Character relationships
CREATE (text_root_001)-[:FEATURES_CHARACTER {
  weight: 1.0,
  character_name: "almond_al",
  character_prominence: "primary",
  emotional_state: "contemplative"
}]->(character_al)

// Setting relationships
CREATE (text_root_001)-[:OCCURS_IN {
  weight: 1.0,
  setting_name: "withered_grove",
  time_of_day: "dawn",
  season: "late_summer",
  weather_condition: "clear"
}]->(setting_grove)
```

#### **Manifestation Relationships**
```cypher
// Generation lineage
CREATE (text_root_001)-[:GENERATES {
  weight: 0.9,
  generation_type: "visual",
  semantic_fidelity: 0.91,
  generation_timestamp: datetime(),
  model_used: "flux-1.1-pro"
}]->(manifest_001a)

// Cross-manifestation relationships
CREATE (manifest_001a)-[:COMPLEMENTS {
  weight: 0.7,
  complement_type: "cross_modal",
  discovered_through: "usage_analytics",
  effectiveness_score: 0.82
}]->(manifest_001b_audio)
```

---

## **AI PROCESSING PIPELINE**

### **Processing Orchestration Architecture**

The AI processing pipeline operates as a coordinated sequence of specialized models, each responsible for specific aspects of semantic analysis and graph enrichment. The system processes canonical content once to create immutable semantic foundations.

### **Stage 1: Content Ingestion and Preprocessing**

#### **JSON Timeline Parser**
**Responsibility**: Convert source JSON timeline data into preliminary Neo4j structure
**Input**: JSON files containing chapters, scenes, and raw text content
**Output**: Basic node structure with content and metadata

```javascript
// Processing logic
async function ingestTimelineData(jsonTimeline) {
  const session = driver.session();
  
  // Create canonical graph root
  const canonResult = await session.run(`
    CREATE (canon:CanonGraph $canonProperties)
    RETURN canon
  `, {
    canonProperties: {
      id: generateCanonId(),
      title: jsonTimeline.title,
      source_type: "novel",
      created_at: new Date().toISOString(),
      processing_status: "ingesting",
      metadata: jsonTimeline.metadata
    }
  });
  
  // Process chapters and scenes
  for (const chapter of jsonTimeline.chapters) {
    await createChapterNodes(session, chapter);
    for (const scene of chapter.scenes) {
      await createSceneNodes(session, scene);
    }
  }
  
  await session.close();
}
```

#### **Content Validation and Preprocessing**
**Responsibility**: Validate content structure and prepare for semantic analysis
**Processing**: Text normalization, encoding validation, structural integrity checks
**Error Handling**: Malformed content rejection, missing field interpolation

### **Stage 2: Text Decomposition and Semantic Analysis**

#### **Text Decomposition Model (GPT-4o/Claude-3.5-Sonnet)**
**Responsibility**: Break raw text into semantically meaningful text root nodes
**Input**: Raw chapter/scene text with structural metadata
**Output**: TextRoot nodes with semantic properties

```javascript
// Model interaction
async function decomposeTextContent(sceneText, sceneMetadata) {
  const decompositionPrompt = `
    Analyze the following text and break it into semantic text root nodes. Each node should represent a distinct semantic concept, action, or descriptive element that could independently spawn media manifestations.

    For each text root, provide:
    1. The exact text content (5-50 words)
    2. Abstraction level (concrete/abstract/metaphorical)
    3. Emotional tone (0.0-1.0 scale)
    4. Narrative function (character_intro, setting_description, action_sequence, etc.)
    5. Manifestation potential for visual, audio, spatial, video (0.0-1.0 each)
    6. Constraint parameters (must include, style requirements, etc.)

    Text to analyze:
    ${sceneText}

    Scene context:
    ${JSON.stringify(sceneMetadata)}

    Respond with valid JSON array of text root objects.
  `;

  const response = await anthropicClient.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4000,
    messages: [{ role: "user", content: decompositionPrompt }]
  });

  return JSON.parse(response.content[0].text);
}
```

#### **Semantic Property Extraction**
**Processing Logic**: Advanced semantic analysis to determine content properties
- **Abstraction Level Analysis**: Concrete vs. metaphorical content classification
- **Emotional Tone Mapping**: Sentiment analysis calibrated for narrative content
- **Narrative Function Classification**: Scene-setting, character development, action, dialogue, etc.
- **Manifestation Viability Assessment**: Technical feasibility analysis for different media types

### **Stage 3: Relationship Discovery and Graph Enrichment**

#### **Semantic Relationship Discovery Model (GPT-4o/Claude-3.5-Sonnet)**
**Responsibility**: Identify and weight semantic relationships between text root nodes
**Input**: Collections of text root nodes with context
**Output**: Relationship edges with weights and metadata

```javascript
async function discoverRelationships(textRoots, contextMetadata) {
  const relationshipPrompt = `
    Analyze the following text root nodes and identify semantic relationships between them. Consider:
    
    1. Thematic connections (shared themes, motifs, symbols)
    2. Narrative causation (one event leading to another)
    3. Character relationships (character interactions, mentions, influences)
    4. Setting connections (same location, related locations, temporal sequence)
    5. Emotional resonance (similar emotional tones, contrasts, progressions)
    
    For each relationship, provide:
    - Source node ID and target node ID
    - Relationship type (thematic, causal, character, setting, emotional, etc.)
    - Weight (0.0-1.0 based on relationship strength)
    - Confidence level (0.0-1.0 based on analytical certainty)
    - Bidirectionality (true/false)
    - Evolution potential (how likely this relationship is to strengthen through usage)

    Text roots to analyze:
    ${JSON.stringify(textRoots)}

    Context:
    ${JSON.stringify(contextMetadata)}

    Respond with valid JSON array of relationship objects.
  `;

  const response = await anthropicClient.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 6000,
    messages: [{ role: "user", content: relationshipPrompt }]
  });

  return JSON.parse(response.content[0].text);
}
```

#### **Cross-Modal Relationship Analysis**
**Responsibility**: Identify connections between different manifestation types
**Processing**: Analysis of how visual, audio, and spatial elements can complement each other
**Output**: Cross-manifestation relationship recommendations

### **Stage 4: Manifestation Factory Coordination**

#### **Manifestation Priority Analyzer**
**Responsibility**: Determine which text roots should receive manifestation priority
**Input**: Text root nodes with manifestation potential scores
**Output**: Prioritized generation queue with resource allocation

```javascript
async function prioritizeManifestations(textRoots, resourceConstraints) {
  // Scoring algorithm
  const prioritizedRoots = textRoots.map(root => {
    const priorityScore = calculatePriorityScore(root, {
      manifestationViability: root.manifestation_potential,
      narrativeImportance: root.semantic_properties.narrative_function,
      uniquenessValue: root.semantic_properties.abstraction_level,
      resourceCost: estimateGenerationCost(root)
    });
    
    return { ...root, priority_score: priorityScore };
  }).sort((a, b) => b.priority_score - a.priority_score);
  
  return prioritizedRoots;
}
```

#### **Generation Request Manager**
**Responsibility**: Coordinate requests to external generation APIs
**Processing**: Queue management, retry logic, quality validation
**Integration Points**: Flux (visual), ElevenLabs (audio), RunwayML (video), custom spatial generators

```javascript
async function coordintateGeneration(prioritizedManifestations) {
  const generationPromises = prioritizedManifestations.map(async (textRoot) => {
    const requests = [];
    
    // Visual generation
    if (textRoot.manifestation_potential.visual_viability > 0.7) {
      requests.push(requestVisualGeneration(textRoot));
    }
    
    // Audio generation
    if (textRoot.manifestation_potential.audio_viability > 0.6) {
      requests.push(requestAudioGeneration(textRoot));
    }
    
    // Spatial generation
    if (textRoot.manifestation_potential.spatial_viability > 0.8) {
      requests.push(requestSpatialGeneration(textRoot));
    }
    
    return Promise.all(requests);
  });
  
  return Promise.all(generationPromises);
}
```

### **Stage 5: Graph Completion and Validation**

#### **Semantic Consistency Validator**
**Responsibility**: Ensure generated manifestations maintain semantic fidelity to text roots
**Processing**: Cross-modal consistency analysis, constraint compliance verification
**Output**: Validated manifestation nodes with fidelity scores

#### **Relationship Weight Calibration**
**Responsibility**: Initial calibration of relationship weights based on processing confidence
**Processing**: Confidence-based weight adjustment, relationship strength normalization
**Output**: Calibrated relationship edges ready for user interaction

#### **Canonical Graph Finalization**
**Responsibility**: Mark canonical graph as complete and immutable
**Processing**: Final validation, indexing optimization, backup creation
**Output**: Production-ready canonical graph

---

## **MANIFESTATION FACTORY SYSTEM**

### **Visual Manifestation Factory**

#### **Flux Integration**
```javascript
class VisualManifestationFactory {
  constructor(fluxApiClient) {
    this.fluxClient = fluxApiClient;
    this.qualityThreshold = 0.8;
  }

  async generateFromTextRoot(textRoot) {
    const engineeredPrompt = this.engineerPrompt(textRoot);
    
    const generationRequest = {
      prompt: engineeredPrompt,
      aspect_ratio: this.determineAspectRatio(textRoot),
      style: textRoot.constraint_parameters.style_consistency,
      quality: "high",
      seed: this.generateConsistentSeed(textRoot.id)
    };

    const response = await this.fluxClient.generate(generationRequest);
    
    return {
      manifestation_type: "visual",
      asset_reference: response.image_url,
      generation_metadata: {
        model_used: "flux-1.1-pro",
        prompt_used: engineeredPrompt,
        generation_timestamp: new Date().toISOString(),
        processing_time: response.processing_time,
        quality_score: response.quality_assessment
      }
    };
  }

  engineerPrompt(textRoot) {
    const basePrompt = textRoot.content;
    const constraints = textRoot.constraint_parameters;
    const style = constraints.style_consistency || "photorealistic";
    
    return `${style} image: ${basePrompt}. ${constraints.must_include.join(', ')}. High quality, detailed, atmospheric lighting.`;
  }
}
```

### **Audio Manifestation Factory**

#### **ElevenLabs Integration**
```javascript
class AudioManifestationFactory {
  constructor(elevenLabsClient) {
    this.elevenLabsClient = elevenLabsClient;
  }

  async generateFromTextRoot(textRoot) {
    const audioType = this.determineAudioType(textRoot);
    
    switch (audioType) {
      case "ambient":
        return this.generateAmbientAudio(textRoot);
      case "narration":
        return this.generateNarration(textRoot);
      case "sound_effect":
        return this.generateSoundEffect(textRoot);
      default:
        throw new Error(`Unknown audio type: ${audioType}`);
    }
  }

  async generateAmbientAudio(textRoot) {
    const ambientPrompt = this.craftAmbientPrompt(textRoot);
    
    const response = await this.elevenLabsClient.generateSoundEffect({
      text: ambientPrompt,
      duration_seconds: 30,
      style: "atmospheric"
    });

    return {
      manifestation_type: "audio",
      audio_subtype: "ambient",
      asset_reference: response.audio_url,
      generation_metadata: {
        model_used: "elevenlabs-sfx",
        prompt_used: ambientPrompt,
        duration: 30,
        generation_timestamp: new Date().toISOString()
      }
    };
  }
}
```

### **Spatial Manifestation Factory**

#### **3D Environment Generation**
```javascript
class SpatialManifestationFactory {
  constructor(spatialGenerationClient) {
    this.spatialClient = spatialGenerationClient;
  }

  async generateFromTextRoot(textRoot) {
    const spatialType = this.determineSpatialType(textRoot);
    
    const spatialPrompt = this.engineerSpatialPrompt(textRoot);
    
    const response = await this.spatialClient.generateEnvironment({
      description: spatialPrompt,
      scale: this.determineScale(textRoot),
      style: textRoot.constraint_parameters.style_consistency,
      lighting: this.determineLighting(textRoot)
    });

    return {
      manifestation_type: "spatial",
      spatial_subtype: spatialType,
      asset_reference: response.model_url,
      generation_metadata: {
        model_used: "custom-spatial-gen",
        environment_type: spatialType,
        scale: response.scale_metrics,
        generation_timestamp: new Date().toISOString()
      }
    };
  }
}
```

---

## **GRAPH RENDERING AND VISUALIZATION**

### **3D-Force-Graph Integration**

#### **Graph Data Transformation**
```javascript
class GraphRenderer {
  constructor(neo4jDriver) {
    this.driver = neo4jDriver;
    this.forceGraph = null;
  }

  async initializeVisualization(containerId, canonId) {
    const graphData = await this.fetchGraphData(canonId);
    
    this.forceGraph = ForceGraph3D()(document.getElementById(containerId))
      .graphData(graphData)
      .nodeLabel(node => this.generateNodeLabel(node))
      .nodeColor(node => this.getNodeColor(node))
      .linkColor(link => this.getLinkColor(link))
      .linkWidth(link => link.weight * 3)
      .linkDirectionalArrowLength(3.5)
      .onNodeClick(node => this.handleNodeClick(node))
      .onLinkClick(link => this.handleLinkClick(link));
  }

  async fetchGraphData(canonId) {
    const session = this.driver.session();
    
    const result = await session.run(`
      MATCH (c:CanonGraph {id: $canonId})
      MATCH (c)-[:CONTAINS*]->(node)
      MATCH (node)-[rel]-(connected)
      RETURN node, rel, connected, labels(node) as nodeType
    `, { canonId });

    const nodes = [];
    const links = [];
    const nodeSet = new Set();

    result.records.forEach(record => {
      const node = record.get('node');
      const relationship = record.get('rel');
      const connected = record.get('connected');
      const nodeType = record.get('nodeType')[0];

      // Add nodes to collection
      if (!nodeSet.has(node.identity.toString())) {
        nodes.push({
          id: node.properties.id,
          type: nodeType,
          properties: node.properties,
          label: node.properties.content || node.properties.title || node.properties.id
        });
        nodeSet.add(node.identity.toString());
      }

      if (!nodeSet.has(connected.identity.toString())) {
        nodes.push({
          id: connected.properties.id,
          type: connected.labels[0],
          properties: connected.properties,
          label: connected.properties.content || connected.properties.title || connected.properties.id
        });
        nodeSet.add(connected.identity.toString());
      }

      // Add relationships
      links.push({
        source: node.properties.id,
        target: connected.properties.id,
        weight: relationship.properties.weight || 0.5,
        type: relationship.type,
        properties: relationship.properties
      });
    });

    await session.close();
    return { nodes, links };
  }
}
```

### **Timeline Rendering Mode**
```javascript
class TimelineRenderer extends GraphRenderer {
  async renderTimelineView(canonId) {
    const timelineData = await this.fetchTimelineSequence(canonId);
    
    // Position nodes along timeline axis
    timelineData.nodes.forEach((node, index) => {
      node.fx = index * 100; // Fixed X position for timeline
      node.fy = 0;           // Fixed Y position on timeline
      node.fz = this.getDepthForNodeType(node.type); // Z-depth by semantic layer
    });

    this.forceGraph
      .graphData(timelineData)
      .dagMode('lr')  // Left-to-right directed acyclic graph
      .dagLevelDistance(150);
  }

  getDepthForNodeType(nodeType) {
    const depthMap = {
      'TextRoot': 0,           // Main narrative timeline
      'Character': -50,        // Character layer
      'Setting': -75,          // Setting layer
      'Theme': -100,           // Thematic layer
      'Manifestation': 50      // Manifestation layer
    };
    return depthMap[nodeType] || 0;
  }
}
```

### **Spatial Exploration Mode**
```javascript
class SpatialRenderer extends GraphRenderer {
  async renderSpatialView(canonId, focusNodeId = null) {
    const spatialData = await this.fetchSpatialCluster(canonId, focusNodeId);
    
    this.forceGraph
      .graphData(spatialData)
      .nodeThreeObject(node => this.createCustomNodeGeometry(node))
      .linkThreeObject(link => this.createCustomLinkGeometry(link))
      .onNodeClick(node => this.expandClusterView(node));
  }

  createCustomNodeGeometry(node) {
    const geometry = new THREE.SphereGeometry(this.getNodeSize(node));
    const material = new THREE.MeshLambertMaterial({ 
      color: this.getNodeColor(node),
      opacity: node.type === 'Manifestation' ? 1.0 : 0.8,
      transparent: true
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Add manifestation preview for manifestation nodes
    if (node.type === 'Manifestation' && node.properties.manifestation_type === 'visual') {
      this.addImageTexture(mesh, node.properties.asset_reference);
    }
    
    return mesh;
  }

  async expandClusterView(node) {
    // Smooth camera transition to focus on node cluster
    this.forceGraph.cameraPosition(
      { x: node.x, y: node.y, z: node.z + 200 },
      node,
      1500 // Animation duration
    );
    
    // Load detailed manifestations for this cluster
    const clusterManifestations = await this.fetchClusterManifestations(node.id);
    this.showManifestationOverlay(clusterManifestations);
  }
}
```

---

## **DERIVATIVE GRAPH ARCHITECTURE**

### **Child Graph Spawning System**

#### **Inheritance Model**
```cypher
// Create derivative graph inheriting from canon
MATCH (canon:CanonGraph {id: 'shadow_graph_001'})
CREATE (derivative:DerivativeGraph {
  id: 'derivative_' + timestamp(),
  parent_canon: canon.id,
  created_at: datetime(),
  user_id: 'user_12345',
  exploration_focus: ['chapter_3', 'chapter_4'],
  modification_permissions: ['add_manifestations', 'modify_relationships']
})

// Inherit specific text roots for user exploration
MATCH (canon)-[:CONTAINS*]->(textRoot:TextRoot)
WHERE textRoot.narrative_position.chapter IN [3, 4]
CREATE (derivative)-[:INHERITS {
  inheritance_type: 'selective',
  inherited_at: datetime(),
  modification_allowed: true
}]->(textRoot)

// Copy manifestations with modification tracking
MATCH (textRoot)<-[:GENERATES]-(manifestation:Manifestation)
CREATE (derivedManifestation:DerivedManifestation {
  id: 'derived_' + manifestation.id,
  parent_manifestation: manifestation.id,
  derivative_graph: derivative.id,
  modification_status: 'inherited',
  properties: manifestation.properties
})
CREATE (derivative)-[:CONTAINS]->(derivedManifestation)
```

#### **Modification Tracking**
```javascript
class DerivativeGraphManager {
  async createUserDerivative(canonId, userId, focusArea) {
    const session = this.driver.session();
    
    const result = await session.run(`
      MATCH (canon:CanonGraph {id: $canonId})
      CREATE (derivative:DerivativeGraph {
        id: $derivativeId,
        parent_canon: canon.id,
        created_at: datetime(),
        user_id: $userId,
        exploration_focus: $focusArea,
        modification_permissions: ['add_manifestations', 'modify_relationships']
      })
      
      // Inherit focused content
      WITH derivative, canon
      MATCH (canon)-[:CONTAINS*]->(content)
      WHERE content.narrative_position.chapter IN $focusArea
      CREATE (derivative)-[:INHERITS {
        inheritance_type: 'selective',
        inherited_at: datetime(),
        modification_allowed: true
      }]->(content)
      
      RETURN derivative
    `, {
      canonId,
      derivativeId: `derivative_${Date.now()}_${userId}`,
      userId,
      focusArea
    });

    await session.close();
    return result.records[0].get('derivative').properties;
  }

  async trackModification(derivativeId, modification) {
    const session = this.driver.session();
    
    await session.run(`
      MATCH (derivative:DerivativeGraph {id: $derivativeId})
      CREATE (modification:Modification {
        id: $modificationId,
        type: $modificationType,
        target_node: $targetNode,
        modification_data: $modificationData,
        timestamp: datetime(),
        user_action: $userAction
      })
      CREATE (derivative)-[:HAS_MODIFICATION]->(modification)
    `, {
      derivativeId,
      modificationId: `mod_${Date.now()}`,
      modificationType: modification.type,
      targetNode: modification.target,
      modificationData: JSON.stringify(modification.data),
      userAction: modification.action
    });

    await session.close();
  }
}
```

### **Conflict Resolution Strategy**

When derivative graphs attempt to modify inherited content, the system needs clear resolution strategies:

#### **Modification Types and Permissions**
```javascript
const MODIFICATION_PERMISSIONS = {
  'add_manifestations': {
    allowed: true,
    requires_validation: true,
    affects_canon: false
  },
  'modify_relationships': {
    allowed: true,
    requires_validation: true,
    affects_canon: false,
    weight_change_limit: 0.3  // Maximum weight adjustment
  },
  'alter_text_roots': {
    allowed: false,  // Text roots remain immutable even in derivatives
    requires_validation: false,
    affects_canon: false
  },
  'create_new_connections': {
    allowed: true,
    requires_validation: true,
    affects_canon: false
  }
};
```

---

## **PERFORMANCE OPTIMIZATION STRATEGIES**

### **Neo4j Indexing Strategy**
```cypher
-- Core performance indexes
CREATE INDEX text_root_canon_lookup FOR (n:TextRoot) ON (n.canon_id);
CREATE INDEX text_root_sequence FOR (n:TextRoot) ON (n.narrative_position.sequence_order);
CREATE INDEX manifestation_type FOR (n:Manifestation) ON (n.manifestation_type);
CREATE INDEX relationship_weight FOR ()-[r]-() ON (r.weight);
CREATE INDEX chapter_order FOR (n:Chapter) ON (n.order_sequence);
CREATE INDEX scene_chapter FOR (n:Scene) ON (n.chapter_id);

-- Composite indexes for common queries
CREATE INDEX text_root_chapter_scene FOR (n:TextRoot) ON (n.narrative_position.chapter, n.narrative_position.scene);
CREATE INDEX manifestation_parent_type FOR (n:Manifestation) ON (n.parent_text_root, n.manifestation_type);

-- Full-text search indexes
CREATE FULLTEXT INDEX text_content_search FOR (n:TextRoot) ON EACH [n.content];
CREATE FULLTEXT INDEX manifestation_metadata_search FOR (n:Manifestation) ON EACH [n.generation_metadata.prompt_engineered];
```

### **Query Optimization Patterns**
```cypher
-- Optimized timeline sequence query
MATCH (c:CanonGraph {id: $canonId})-[:CONTAINS*]->(t:TextRoot)
WITH t ORDER BY t.narrative_position.chapter, t.narrative_position.scene, t.narrative_position.sequence_order
MATCH (t)-[r:FOLLOWED_BY*0..1]->(next:TextRoot)
RETURN t, r, next
LIMIT 100;

-- Optimized semantic relationship discovery
MATCH (t1:TextRoot {canon_id: $canonId})-[r:RELATES_TO]-(t2:TextRoot)
WHERE r.weight > $weightThreshold
WITH t1, r, t2 ORDER BY r.weight DESC
RETURN t1, r, t2
LIMIT 50;

-- Manifestation retrieval with lazy loading
MATCH (t:TextRoot {id: $textRootId})
OPTIONAL MATCH (t)-[:GENERATES]->(m:Manifestation)
WITH t, collect(m)[0..5] as sample_manifestations
RETURN t, sample_manifestations;
```

### **Caching Strategy**
```javascript
class GraphCacheManager {
  constructor(redisClient, neo4jDriver) {
    this.redis = redisClient;
    this.driver = neo4jDriver;
    this.cacheTimeout = 3600; // 1 hour
  }

  async getCachedGraphData(canonId, viewType = 'spatial') {
    const cacheKey = `graph:${canonId}:${viewType}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const freshData = await this.fetchGraphData(canonId, viewType);
    await this.redis.setex(cacheKey, this.cacheTimeout, JSON.stringify(freshData));
    
    return freshData;
  }

  async invalidateGraphCache(canonId) {
    const pattern = `graph:${canonId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### **Memory Management for Large Graphs**
```javascript
class GraphMemoryManager {
  constructor() {
    this.nodeLimit = 5000;
    this.relationshipLimit = 10000;
  }

  async loadGraphSubset(canonId, focusNodes = [], maxDepth = 2) {
    const session = this.driver.session();
    
    // Use path-based limiting to control memory usage
    const result = await session.run(`
      MATCH (focus:TextRoot) WHERE focus.id IN $focusNodes
      CALL apoc.path.subgraphNodes(focus, {
        maxLevel: $maxDepth,
        limit: $nodeLimit
      }) YIELD node
      
      MATCH (node)-[rel]-(connected)
      WHERE connected IN nodes
      RETURN node, rel, connected
      LIMIT $relationshipLimit
    `, {
      focusNodes,
      maxDepth,
      nodeLimit: this.nodeLimit,
      relationshipLimit: this.relationshipLimit
    });

    await session.close();
    return this.transformToGraphData(result);
  }
}
```

---

## **API ARCHITECTURE**

### **GraphQL Schema Design**
```graphql
type CanonGraph {
  id: ID!
  title: String!
  sourceType: String!
  createdAt: DateTime!
  processingStatus: ProcessingStatus!
  version: String!
  metadata: GraphMetadata!
  
  # Relationships
  chapters: [Chapter!]!
  textRoots: [TextRoot!]!
  manifestations: [Manifestation!]!
  analytics: GraphAnalytics
}

type TextRoot {
  id: ID!
  canonId: ID!
  content: String!
  contentHash: String!
  narrativePosition: NarrativePosition!
  semanticProperties: SemanticProperties!
  manifestationPotential: ManifestationPotential!
  constraintParameters: ConstraintParameters!
  
  # Relationships
  chapter: Chapter
  scene: Scene
  manifestations: [Manifestation!]!
  relatedRoots(first: Int, weight: Float): [TextRootRelationship!]!
  followedBy: TextRoot
  precededBy: TextRoot
}

type Manifestation {
  id: ID!
  parentTextRoot: TextRoot!
  manifestationType: ManifestationType!
  assetReference: String!
  generationMetadata: GenerationMetadata!
  semanticFidelity: SemanticFidelity!
  usageAnalytics: UsageAnalytics
  
  # Cross-modal relationships
  complements: [Manifestation!]!
}

type TextRootRelationship {
  source: TextRoot!
  target: TextRoot!
  relationshipType: RelationshipType!
  weight: Float!
  confidence: Float!
  discoveredBy: String!
  evolutionPotential: EvolutionPotential!
}

enum ManifestationType {
  VISUAL
  AUDIO
  SPATIAL
  VIDEO
}

enum RelationshipType {
  THEMATIC
  CAUSAL
  CHARACTER
  SETTING
  EMOTIONAL
  TEMPORAL
}

# Queries
type Query {
  canonGraph(id: ID!): CanonGraph
  textRoot(id: ID!): TextRoot
  manifestation(id: ID!): Manifestation
  
  # Graph exploration queries
  exploreSemanticCluster(
    textRootId: ID!,
    maxDepth: Int = 2,
    weightThreshold: Float = 0.5
  ): [TextRootRelationship!]!
  
  timelineSequence(
    canonId: ID!,
    chapter: Int,
    scene: Int
  ): [TextRoot!]!
  
  findSimilarContent(
    textRootId: ID!,
    similarityThreshold: Float = 0.7,
    limit: Int = 10
  ): [TextRoot!]!
}

# Mutations
type Mutation {
  createCanonGraph(input: CreateCanonGraphInput!): CanonGraph!
  processCanonicalContent(canonId: ID!): ProcessingJob!
  
  # Derivative graph operations
  createDerivativeGraph(input: CreateDerivativeInput!): DerivativeGraph!
  addManifestationToDerivative(
    derivativeId: ID!,
    textRootId: ID!,
    manifestationType: ManifestationType!
  ): GenerationJob!
  
  # Relationship modifications
  strengthenRelationship(
    sourceId: ID!,
    targetId: ID!,
    weightIncrease: Float!
  ): TextRootRelationship!
}

# Subscriptions for real-time updates
type Subscription {
  processingProgress(canonId: ID!): ProcessingProgress!
  manifestationGenerated(textRootId: ID!): Manifestation!
  relationshipEvolution(canonId: ID!): RelationshipUpdate!
}
```

### **RESTful API Endpoints**
```javascript
// Express.js route definitions
app.post('/api/v1/canon-graphs', async (req, res) => {
  try {
    const { timelineData, metadata } = req.body;
    const canonGraph = await canonGraphService.createFromTimeline(timelineData, metadata);
    res.status(201).json({ canonGraph, processingJobId: canonGraph.processingJobId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/v1/canon-graphs/:canonId/graph-data', async (req, res) => {
  try {
    const { canonId } = req.params;
    const { viewType = 'spatial', focusNode, maxDepth = 2 } = req.query;
    
    const graphData = await graphRenderingService.getGraphData(canonId, {
      viewType,
      focusNode,
      maxDepth: parseInt(maxDepth)
    });
    
    res.json({ graphData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/v1/canon-graphs/:canonId/derivative', async (req, res) => {
  try {
    const { canonId } = req.params;
    const { userId, focusArea, permissions } = req.body;
    
    const derivative = await derivativeGraphService.createUserDerivative(
      canonId,
      userId,
      focusArea,
      permissions
    );
    
    res.status(201).json({ derivative });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/v1/text-roots/:textRootId/manifestations', async (req, res) => {
  try {
    const { textRootId } = req.params;
    const { type, limit = 10 } = req.query;
    
    const manifestations = await manifestationService.getManifestations(textRootId, {
      type,
      limit: parseInt(limit)
    });
    
    res.json({ manifestations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket endpoints for real-time updates
io.on('connection', (socket) => {
  socket.on('subscribe-processing', (canonId) => {
    socket.join(`processing:${canonId}`);
  });

  socket.on('subscribe-manifestations', (textRootId) => {
    socket.join(`manifestations:${textRootId}`);
  });
});
```

---

## **DATA VALIDATION AND QUALITY ASSURANCE**

### **Semantic Consistency Validation**
```javascript
class SemanticValidator {
  constructor(validationModel) {
    this.model = validationModel; // Claude or GPT-4o for validation
    this.consistencyThreshold = 0.8;
  }

  async validateManifestation(textRoot, manifestation) {
    const validationPrompt = `
      Evaluate the semantic consistency between this text root and its generated manifestation.
      
      Text Root: "${textRoot.content}"
      Constraints: ${JSON.stringify(textRoot.constraint_parameters)}
      
      Manifestation Type: ${manifestation.manifestation_type}
      Generated Prompt: "${manifestation.generation_metadata.prompt_used}"
      
      Rate consistency on these dimensions (0.0-1.0):
      1. Content Accuracy: Does the manifestation represent the text content?
      2. Style Consistency: Does it match the required style parameters?
      3. Constraint Compliance: Does it include required elements and avoid forbidden ones?
      4. Emotional Fidelity: Does it capture the intended emotional tone?
      
      Provide scores and brief explanations for any scores below 0.8.
      
      Respond with JSON: {
        "content_accuracy": 0.0-1.0,
        "style_consistency": 0.0-1.0,
        "constraint_compliance": 0.0-1.0,
        "emotional_fidelity": 0.0-1.0,
        "overall_score": 0.0-1.0,
        "issues": ["list of specific problems"],
        "recommendations": ["improvement suggestions"]
      }
    `;

    const validation = await this.model.validate(validationPrompt);
    return {
      isValid: validation.overall_score >= this.consistencyThreshold,
      scores: validation,
      requiresRegeneration: validation.overall_score < 0.6
    };
  }

  async validateRelationshipCoherence(relationshipCluster) {
    // Validate that discovered relationships make semantic sense
    const relationships = relationshipCluster.relationships;
    
    const coherencePrompt = `
      Analyze this cluster of semantic relationships for logical coherence.
      
      Relationships:
      ${relationships.map(r => `${r.source.content} --[${r.type}, weight: ${r.weight}]--> ${r.target.content}`).join('\n')}
      
      Evaluate:
      1. Do these relationships make semantic sense?
      2. Are the weights appropriate for the relationship strengths?
      3. Are there any contradictory or illogical connections?
      4. Are there obvious relationships missing?
      
      Respond with JSON: {
        "coherence_score": 0.0-1.0,
        "weight_accuracy": 0.0-1.0,
        "missing_relationships": [{"source": "id", "target": "id", "type": "type", "suggested_weight": 0.0-1.0}],
        "problematic_relationships": [{"source": "id", "target": "id", "issue": "description"}],
        "overall_assessment": "description"
      }
    `;

    return await this.model.validate(coherencePrompt);
  }
}
```

### **Data Integrity Monitoring**
```javascript
class GraphIntegrityMonitor {
  constructor(neo4jDriver) {
    this.driver = neo4jDriver;
  }

  async runIntegrityChecks(canonId) {
    const checks = [
      this.checkOrphanedNodes(canonId),
      this.checkMissingMandatoryRelationships(canonId),
      this.checkWeightConsistency(canonId),
      this.checkManifestationReferences(canonId)
    ];

    const results = await Promise.all(checks);
    return {
      timestamp: new Date().toISOString(),
      canonId,
      checks: results,
      overallHealth: results.every(check => check.passed) ? 'healthy' : 'issues_detected'
    };
  }

  async checkOrphanedNodes(canonId) {
    const session = this.driver.session();
    
    const result = await session.run(`
      MATCH (c:CanonGraph {id: $canonId})
      MATCH (n) WHERE NOT (c)-[:CONTAINS*]->(n) AND NOT n:CanonGraph
      RETURN count(n) as orphaned_count, collect(n.id)[0..10] as sample_orphans
    `, { canonId });

    const orphanedCount = result.records[0].get('orphaned_count').toNumber();
    
    await session.close();
    
    return {
      check: 'orphaned_nodes',
      passed: orphanedCount === 0,
      details: {
        orphaned_count: orphanedCount,
        sample_orphans: result.records[0].get('sample_orphans')
      }
    };
  }

  async checkWeightConsistency(canonId) {
    const session = this.driver.session();
    
    const result = await session.run(`
      MATCH (c:CanonGraph {id: $canonId})-[:CONTAINS*]->(n1)
      MATCH (n1)-[r]-(n2)
      WHERE r.weight < 0 OR r.weight > 1
      RETURN count(r) as invalid_weights, collect({
        source: n1.id,
        target: n2.id,
        weight: r.weight,
        type: type(r)
      })[0..10] as sample_invalid
    `, { canonId });

    const invalidCount = result.records[0].get('invalid_weights').toNumber();
    
    await session.close();
    
    return {
      check: 'weight_consistency',
      passed: invalidCount === 0,
      details: {
        invalid_count: invalidCount,
        sample_invalid: result.records[0].get('sample_invalid')
      }
    };
  }
}
```

---

## **ERROR HANDLING AND RECOVERY**

### **Processing Pipeline Error Recovery**
```javascript
class ProcessingErrorHandler {
  constructor(jobQueue, notificationService) {
    this.jobQueue = jobQueue;
    this.notifications = notificationService;
    this.maxRetries = 3;
  }

  async handleProcessingFailure(job, error, attempt) {
    const errorContext = {
      jobId: job.id,
      canonId: job.canonId,
      stage: job.currentStage,
      error: error.message,
      attempt: attempt,
      timestamp: new Date().toISOString()
    };

    // Log error for analysis
    console.error('Processing failure:', errorContext);

    if (attempt < this.maxRetries) {
      // Implement exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await this.scheduleRetry(job, delay, attempt + 1);
    } else {
      // Mark job as failed and notify stakeholders
      await this.markJobFailed(job, errorContext);
      await this.notifications.notifyProcessingFailure(errorContext);
    }
  }

  async recoverPartialGraph(canonId, lastSuccessfulStage) {
    // Attempt to recover from partial processing state
    const session = this.driver.session();
    
    try {
      // Identify completed processing stages
      const completedStages = await this.identifyCompletedStages(canonId);
      
      // Resume from next incomplete stage
      const resumeStage = this.determineResumePoint(completedStages, lastSuccessfulStage);
      
      // Create recovery job
      const recoveryJob = {
        id: `recovery_${canonId}_${Date.now()}`,
        canonId: canonId,
        type: 'recovery',
        resumeFromStage: resumeStage,
        retainExistingData: true
      };
      
      await this.jobQueue.add(recoveryJob);
      
    } finally {
      await session.close();
    }
  }
}
```

### **Data Corruption Detection and Repair**
```javascript
class DataCorruptionDetector {
  constructor(neo4jDriver) {
    this.driver = neo4jDriver;
  }

  async detectAndRepairCorruption(canonId) {
    const issues = await this.scanForCorruption(canonId);
    
    if (issues.length > 0) {
      const repairActions = await this.generateRepairActions(issues);
      const repairResults = await this.executeRepairs(repairActions);
      
      return {
        issues_detected: issues.length,
        repairs_attempted: repairActions.length,
        repairs_successful: repairResults.filter(r => r.success).length,
        remaining_issues: repairResults.filter(r => !r.success).length
      };
    }
    
    return { status: 'no_corruption_detected' };
  }

  async scanForCorruption(canonId) {
    const session = this.driver.session();
    const issues = [];

    // Check for malformed JSON properties
    const jsonPropsCheck = await session.run(`
      MATCH (c:CanonGraph {id: $canonId})-[:CONTAINS*]->(n)
      WHERE EXISTS(n.manifestation_potential) AND n.manifestation_potential IS NOT NULL
      WITH n, n.manifestation_potential as prop
      WHERE NOT prop =~ '\\{.*\\}'
      RETURN n.id as node_id, prop as malformed_property
    `, { canonId });

    jsonPropsCheck.records.forEach(record => {
      issues.push({
        type: 'malformed_json_property',
        nodeId: record.get('node_id'),
        property: 'manifestation_potential',
        value: record.get('malformed_property')
      });
    });

    // Check for missing required relationships
    const missingRelsCheck = await session.run(`
      MATCH (c:CanonGraph {id: $canonId})-[:CONTAINS*]->(t:TextRoot)
      WHERE NOT EXISTS((t)-[:BELONGS_TO]->(:Scene))
      RETURN t.id as orphaned_text_root
    `, { canonId });

    missingRelsCheck.records.forEach(record => {
      issues.push({
        type: 'missing_scene_relationship',
        nodeId: record.get('orphaned_text_root')
      });
    });

    await session.close();
    return issues;
  }
}
```

---

## **ANALYTICS AND MONITORING**

### **Usage Analytics Collection**
```javascript
class AnalyticsCollector {
  constructor(analyticsDatabase) {
    this.analyticsDB = analyticsDatabase;
  }

  async trackGraphInteraction(event) {
    const analyticsEvent = {
      event_id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      canon_id: event.canonId,
      user_id: event.userId,
      session_id: event.sessionId,
      interaction_type: event.type, // node_click, relationship_follow, manifestation_view, etc.
      target_node_id: event.targetNodeId,
      target_node_type: event.targetNodeType,
      interaction_duration: event.duration,
      context: {
        view_mode: event.viewMode, // timeline, spatial, network
        zoom_level: event.zoomLevel,
        camera_position: event.cameraPosition
      }
    };

    await this.analyticsDB.insert('graph_interactions', analyticsEvent);
    
    // Update relationship weights based on interaction patterns
    if (event.type === 'relationship_follow' && event.duration > 5000) {
      await this.strengthenRelationshipFromUsage(event.sourceNodeId, event.targetNodeId);
    }
  }

  async generateUsageReport(canonId, timeRange) {
    const report = {
      canon_id: canonId,
      report_period: timeRange,
      generated_at: new Date().toISOString(),
      metrics: {
        total_interactions: await this.countInteractions(canonId, timeRange),
        unique_users: await this.countUniqueUsers(canonId, timeRange),
        most_accessed_nodes: await this.getMostAccessedNodes(canonId, timeRange, 10),
        strongest_relationship_paths: await this.getStrongestPaths(canonId),
        manifestation_effectiveness: await this.getManifestationEffectiveness(canonId, timeRange),
        user_journey_patterns: await this.analyzeUserJourneys(canonId, timeRange)
      }
    };

    return report;
  }
}
```

### **Relationship Evolution Tracking**
```javascript
class RelationshipEvolutionTracker {
  constructor(neo4jDriver, analyticsCollector) {
    this.driver = neo4jDriver;
    this.analytics = analyticsCollector;
  }

  async trackRelationshipStrengthening(sourceId, targetId, interactionType, strengthIncrease = 0.05) {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (source {id: $sourceId})-[r]-(target {id: $targetId})
        SET r.weight = CASE 
          WHEN r.weight + $strengthIncrease > 1.0 THEN 1.0 
          ELSE r.weight + $strengthIncrease 
        END,
        r.last_strengthened = datetime(),
        r.strengthening_count = COALESCE(r.strengthening_count, 0) + 1
        
        CREATE (evolution:RelationshipEvolution {
          id: $evolutionId,
          source_node: $sourceId,
          target_node: $targetId,
          interaction_type: $interactionType,
          weight_change: $strengthIncrease,
          new_weight: r.weight,
          timestamp: datetime()
        })
        
        RETURN r.weight as new_weight
      `, {
        sourceId,
        targetId,
        strengthIncrease,
        interactionType,
        evolutionId: `evo_${Date.now()}`
      });

      const newWeight = result.records[0].get('new_weight');
      
      // If relationship has become very strong, trigger manifestation generation
      if (newWeight > 0.8) {
        await this.triggerHighValueManifestationGeneration(sourceId, targetId);
      }
      
    } finally {
      await session.close();
    }
  }

  async analyzeRelationshipTrends(canonId, timeWindow = '30d') {
    const session = this.driver.session();
    
    const result = await session.run(`
      MATCH (c:CanonGraph {id: $canonId})-[:CONTAINS*]->(n1)
      MATCH (n1)-[r]-(n2)
      WHERE r.last_strengthened >= datetime() - duration({days: $days})
      
      WITH type(r) as relationship_type, 
           AVG(r.weight) as avg_weight,
           COUNT(r) as relationship_count,
           SUM(r.strengthening_count) as total_interactions
           
      RETURN relationship_type, avg_weight, relationship_count, total_interactions
      ORDER BY total_interactions DESC
    `, { 
      canonId, 
      days: parseInt(timeWindow.replace('d', '')) 
    });

    return result.records.map(record => ({
      relationship_type: record.get('relationship_type'),
      average_weight: record.get('avg_weight'),
      relationship_count: record.get('relationship_count').toNumber(),
      total_interactions: record.get('total_interactions').toNumber()
    }));
  }
}
```

---

## **DEPLOYMENT AND INFRASTRUCTURE**

### **Container Architecture**
```dockerfile
# Neo4j Database Container
FROM neo4j:5.15-community

ENV NEO4J_AUTH=neo4j/shadowgraphs_secure_password
ENV NEO4J_dbms_memory_heap_initial__size=2G
ENV NEO4J_dbms_memory_heap_max__size=4G
ENV NEO4J_dbms_memory_pagecache_size=1G

# Install APOC plugins for advanced graph operations
RUN wget https://github.com/neo4j/apoc/releases/download/5.15.0/apoc-5.15.0-core.jar \
    -O /var/lib/neo4j/plugins/apoc-5.15.0-core.jar

# Shadow Graphs API Container
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
EXPOSE 3001

CMD ["npm", "start"]
```

### **Docker Compose Configuration**
```yaml
version: '3.8'

services:
  neo4j:
    image: shadowgraphs/neo4j:latest
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    environment:
      - NEO4J_AUTH=neo4j/shadowgraphs_secure_password
      - NEO4J_dbms_memory_heap_max__size=4G
      - NEO4J_dbms_memory_pagecache_size=1G
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_import:/import
      - neo4j_plugins:/plugins
    networks:
      - shadowgraphs_network

  api:
    image: shadowgraphs/api:latest
    ports:
      - "3000:3000"  # REST API
      - "3001:3001"  # WebSocket
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=shadowgraphs_secure_password
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - neo4j
      - redis
    networks:
      - shadowgraphs_network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - shadowgraphs_network

  processing_worker:
    image: shadowgraphs/worker:latest
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=shadowgraphs_secure_password
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - FLUX_API_KEY=${FLUX_API_KEY}
      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
    depends_on:
      - neo4j
      - redis
    deploy:
      replicas: 3
    networks:
      - shadowgraphs_network

volumes:
  neo4j_data:
  neo4j_logs:
  neo4j_import:
  neo4j_plugins:
  redis_data:

networks:
  shadowgraphs_network:
    driver: bridge
```

### **Kubernetes Deployment Configuration**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: neo4j
spec:
  replicas: 1
  selector:
    matchLabels:
      app: neo4j
  template:
    metadata:
      labels:
        app: neo4j
    spec:
      containers:
      - name: neo4j
        image: shadowgraphs/neo4j:latest
        ports:
        - containerPort: 7474
        - containerPort: 7687
        env:
        - name: NEO4J_AUTH
          valueFrom:
            secretKeyRef:
              name: neo4j-auth
              key: auth-string
        - name: NEO4J_dbms_memory_heap_max__size
          value: "4G"
        volumeMounts:
        - name: neo4j-data
          mountPath: /data
        resources:
          requests:
            memory: "6Gi"
            cpu: "2000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
      volumes:
      - name: neo4j-data
        persistentVolumeClaim:
          claimName: neo4j-data-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: neo4j-service
spec:
  selector:
    app: neo4j
  ports:
  - name: http
    port: 7474
    targetPort: 7474
  - name: bolt