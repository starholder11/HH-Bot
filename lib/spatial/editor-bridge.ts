/**
 * Three.js Editor Bridge
 * 
 * Handles communication between React app and Three.js Editor iframe
 * using postMessage API with security validation
 */

export interface EditorCommand {
  type: 'load_scene' | 'export_scene' | 'clear_scene' | 'select_object' | 'transform_object' | 'enter_bullseye_mode' | 'exit_bullseye_mode';
  data: any;
  id?: string; // For tracking responses
}

export interface EditorMessage {
  type: 'ready' | 'error' | 'scene_changed' | 'selection_changed' | 'object_added' | 'object_removed' | 'object_transformed' | 'scene_exported' | 'bullseye_placement' | 'bullseye_mode_entered' | 'bullseye_mode_exited';
  data: any;
  commandId?: string; // For correlating with commands
}

export interface EditorBridgeOptions {
  allowedOrigins?: string[];
  timeout?: number;
  debug?: boolean;
}

const DEFAULT_OPTIONS: EditorBridgeOptions = {
  allowedOrigins: [window.location.origin],
  timeout: 12000,
  debug: process.env.NODE_ENV === 'development',
};

export class EditorBridge {
  private iframe: HTMLIFrameElement;
  private options: EditorBridgeOptions;
  private messageQueue: EditorCommand[] = [];
  private pendingCommands: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private commandIdCounter = 0;
  private ready = false;
  
  // Event handlers
  public onReady?: () => void;
  public onError?: (error: string) => void;
  public onMessage?: (message: EditorMessage) => void;

  constructor(iframe: HTMLIFrameElement, options: Partial<EditorBridgeOptions> = {}) {
    this.iframe = iframe;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.handleMessage = this.handleMessage.bind(this);
  }

  /**
   * Initialize the bridge
   */
  initialize() {
    // Add message listener
    window.addEventListener('message', this.handleMessage);

    // Set up iframe load handler
    this.iframe.addEventListener('load', () => {
      if (this.options.debug) {
        console.log('EditorBridge: iframe loaded');
      }
      
      // Wait for editor to send ready message
      setTimeout(() => {
        if (!this.isReady()) {
          this.onError?.('Editor failed to initialize within timeout');
        }
      }, this.options.timeout);
    });
  }

  /**
   * Handle incoming messages from editor
   */
  private handleMessage(event: MessageEvent) {
    // Security: ensure the message comes from our iframe
    if (event.source !== this.iframe.contentWindow) {
      return;
    }

    // Validate message structure
    if (!event.data || typeof event.data !== 'object') {
      return;
    }

    const message = event.data as EditorMessage;
    
    if (this.options.debug) console.log('EditorBridge: received message:', message);

    // Handle special messages
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.onReady?.();
        this.flushMessageQueue();
        break;
      
      case 'error':
        this.onError?.(message.data?.error || 'Unknown editor error');
        break;
        
      case 'scene_exported':
      case 'scene_loaded':
      case 'object_added_success':
      case 'bullseye_mode_entered':
      case 'bullseye_mode_exited':
        // Handle command response
        if (message.commandId) {
          this.resolveCommand(message.commandId, message.data);
        }
        break;
        
      default:
        // Pass through to handler
        this.onMessage?.(message);
    }
  }

  /**
   * Send command to editor
   */
  sendCommand(command: EditorCommand): Promise<any> {
    return new Promise((resolve, reject) => {
      // Generate unique command ID
      const commandId = `cmd_${++this.commandIdCounter}_${Date.now()}`;
      const commandWithId = { ...command, id: commandId };

      if (!this.isReady()) {
        // Queue command for later
        this.messageQueue.push(commandWithId);
        resolve(null);
        return;
      }

      // Set up timeout for command
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout: ${command.type}`));
      }, this.options.timeout);

      // Track pending command
      this.pendingCommands.set(commandId, { resolve, reject, timeout });

      try {
        // Send to iframe
        this.iframe.contentWindow?.postMessage(commandWithId, '*');
        
        if (this.options.debug) {
          console.log('EditorBridge: sent command:', commandWithId);
        }
      } catch (error) {
        this.pendingCommands.delete(commandId);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Resolve a pending command
   */
  private resolveCommand(commandId: string, data: any) {
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingCommands.delete(commandId);
      pending.resolve(data);
    }
  }

  /**
   * Flush queued messages when editor becomes ready
   */
  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const command = this.messageQueue.shift();
      if (command) {
        this.sendCommand(command);
      }
    }
  }

  /**
   * Check if editor is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Destroy the bridge and clean up
   */
  destroy() {
    window.removeEventListener('message', this.handleMessage);
    
    // Clear pending commands
    this.pendingCommands.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error('Bridge destroyed'));
    });
    this.pendingCommands.clear();
    
    this.messageQueue.length = 0;
  }

  /**
   * Load space data into editor
   */
  async loadSpace(spaceData: any): Promise<void> {
    return this.sendCommand({
      type: 'load_scene',
      data: {
        scene: this.convertSpaceToEditorScene(spaceData),
        metadata: {
          spaceId: spaceData.id,
          version: spaceData.version,
        },
      },
    });
  }

  /**
   * Export current scene from editor
   */
  async exportScene(): Promise<any> {
    return this.sendCommand({
      type: 'export_scene',
      data: {},
    });
  }

  /**
   * Convert space data to Three.js Editor scene format
   */
  private convertSpaceToEditorScene(spaceData: any): any {
    // This would convert SpaceAsset format to Three.js scene format
    // For now, return a basic scene structure
    return {
      metadata: {
        version: "4.3",
        type: "Object",
        generator: "HH-Bot Spatial System"
      },
      geometries: [],
      materials: [],
      textures: [],
      images: [],
      shapes: [],
      skeletons: [],
      animations: [],
      nodes: [],
      object: {
        uuid: spaceData.id,
        type: "Scene",
        name: spaceData.filename || "Space Scene",
        layers: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        children: spaceData.space?.items?.map((item: any) => ({
          uuid: item.id,
          type: "Mesh",
          name: item.assetId,
          layers: 1,
          matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...item.position, 1],
          geometry: "placeholder-geometry",
          material: "placeholder-material",
        })) || [],
      }
    };
  }
}
