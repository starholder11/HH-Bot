import * as THREE from 'three';

// Global maps for tracking video elements and text canvases (same as editor)
const videoMap = new Map<string, HTMLVideoElement>();
const textCanvasMap = new Map<THREE.Mesh, any>();
const textScrollState = new Map<string, { scrollY: number; totalHeight: number }>();

// Force render ticks helper (from editor)
function forceRenderTicks(mesh: THREE.Mesh, editor: any, count: number = 4) {
  if (count <= 0) return;
  requestAnimationFrame(() => {
    try {
      if (mesh.material && mesh.material.map) {
        mesh.material.map.needsUpdate = true;
      }
      mesh.material.needsUpdate = true;
    } catch (e) {}
    forceRenderTicks(mesh, editor, count - 1);
  });
}

// Text rendering helper (from editor)
function renderTextMesh(mesh: THREE.Mesh) {
  const canvasData = textCanvasMap.get(mesh);
  const scrollData = textScrollState.get(mesh.uuid);
  if (!canvasData || !scrollData) return;

  const { canvas, ctx, padding, maxWidth, lineHeight, textContent, texture } = canvasData;
  const { scrollY } = scrollData;

  // Clear canvas
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Text styling
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(lineHeight * 0.7)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Word wrap and render
  const words = textContent.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Calculate total height and update scroll state
  const totalHeight = lines.length * lineHeight;
  const maxScroll = Math.max(0, totalHeight - (canvas.height - padding * 2));
  const clampedScrollY = Math.max(0, Math.min(scrollY, maxScroll));
  textScrollState.set(mesh.uuid, { scrollY: clampedScrollY, totalHeight });

  // Render visible lines
  const startY = padding - clampedScrollY;
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    if (y > -lineHeight && y < canvas.height + lineHeight) {
      ctx.fillText(line, padding, y);
    }
  });

  // Draw scrollbar if needed
  if (totalHeight > canvas.height - padding * 2) {
    const scrollbarWidth = Math.round(canvas.width * 0.02);
    const scrollbarX = canvas.width - padding / 2 - scrollbarWidth;
    const scrollbarHeight = canvas.height - padding * 2;
    const thumbHeight = Math.max(20, (scrollbarHeight * scrollbarHeight) / totalHeight);
    const thumbY = padding + (clampedScrollY / maxScroll) * (scrollbarHeight - thumbHeight);

    // Scrollbar track
    ctx.fillStyle = '#444444';
    ctx.fillRect(scrollbarX, padding, scrollbarWidth, scrollbarHeight);

    // Scrollbar thumb
    ctx.fillStyle = '#888888';
    ctx.fillRect(scrollbarX, thumbY, scrollbarWidth, thumbHeight);
  }

  texture.needsUpdate = true;
}

// Note: All textures (video, image, text canvas) use flipY = true to match editor behavior

// Extracted applyMediaToMesh function (from editor)
export function applyMediaToMesh(mesh: THREE.Mesh, url: string, assetType: string, editor?: any) {
  if (!url) return;

  const isVideo = (assetType === 'video') || /\.mp4(\?|$)/i.test(url);
  console.log('applyMediaToMesh:', mesh.name, 'url:', url, 'assetType:', assetType, 'isVideo:', isVideo);

  if (isVideo) {
    console.log('Creating video texture for:', mesh.name);

    // Create video element
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = false;
    video.style.display = 'none';
    document.body.appendChild(video);

    console.log('Video element created, src:', video.src);

    // Wait for video to be ready before creating texture
    video.addEventListener('loadeddata', () => {
      console.log('Video loaded data, ready state:', video.readyState);

      // Create VideoTexture only when video is ready
      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.format = THREE.RGBAFormat;
      videoTexture.type = THREE.UnsignedByteType;
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.generateMipmaps = false;
      videoTexture.wrapS = THREE.ClampToEdgeWrapping;
      videoTexture.wrapT = THREE.ClampToEdgeWrapping;
      // Match editor behavior: videos always use flipY = true
      videoTexture.flipY = true;

      console.log('VideoTexture created with ready video');

      // Update existing material instead of replacing it
      if (mesh.material && mesh.material instanceof THREE.MeshBasicMaterial) {
        mesh.material.map = videoTexture;
        mesh.material.side = THREE.DoubleSide;
        mesh.material.toneMapped = false;
        mesh.material.needsUpdate = true;
      } else {
        // Fallback: create new material if existing one is incompatible
        console.log('Creating new material for video (fallback)');
        const videoMaterial = new THREE.MeshBasicMaterial({
          map: videoTexture,
          side: THREE.DoubleSide,
          toneMapped: false
        });
        mesh.material = videoMaterial;
        mesh.material.needsUpdate = true;
      }

      console.log('Material applied to mesh');
      
      // Force geometry and material update for raycasting
      if (mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
      }

      // Start video
      video.play().then(() => {
        console.log('Video playing successfully');
        videoTexture.needsUpdate = true;
        console.log('Forced initial texture update');
        forceRenderTicks(mesh, editor, 4);
      }).catch(err => {
        console.log('Video autoplay failed, will play on user interaction:', err);
        const showFirstFrame = () => {
          try {
            videoTexture.needsUpdate = true;
            forceRenderTicks(mesh, editor, 4);
          } catch {}
        };
        video.addEventListener('canplay', showFirstFrame, { once: true });
        video.addEventListener('loadedmetadata', showFirstFrame, { once: true });
      });

      // Also nudge updates when player becomes ready
      const bumpUpdate = () => {
        try {
          videoTexture.needsUpdate = true;
        } catch {}
      };
      video.addEventListener('canplay', bumpUpdate, { once: true });
      video.addEventListener('loadedmetadata', bumpUpdate, { once: true });

      // Track video element
      videoMap.set(mesh.uuid, video);
      console.log('Video mapped for mesh:', mesh.uuid, 'mesh.name:', mesh.name);
    });

    // Handle video load errors
    video.addEventListener('error', (e) => {
      console.error('Video load error:', e);
    });
  } else {
    console.log('Loading image texture for:', mesh.name, 'URL:', url);
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    textureLoader.load(
      url,
      (texture) => {
        console.log('Image texture loaded successfully for:', mesh.name);
        // Configure texture properties
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.format = THREE.RGBAFormat;
        texture.type = THREE.UnsignedByteType;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        // Match editor behavior: images always use flipY = true
        texture.flipY = true;

        // Update existing material instead of replacing it
        if (mesh.material && mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.map = texture;
          mesh.material.side = THREE.DoubleSide;
          mesh.material.toneMapped = false;
          mesh.material.needsUpdate = true;
        } else {
          // Fallback: create new material if existing one is incompatible
          console.log('Creating new material for image (fallback)');
          const imageMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            toneMapped: false
          });
          mesh.material = imageMaterial;
          mesh.material.needsUpdate = true;
        }

        console.log('Image material applied to mesh');
        
        // Force geometry and material update for raycasting
        if (mesh.geometry) {
          mesh.geometry.computeBoundingBox();
          mesh.geometry.computeBoundingSphere();
        }
      },
      undefined,
      (error) => {
        console.error('Image texture load error for:', mesh.name, error);
      }
    );
  }
}

// Extracted applyTextToMesh function (from editor)
export function applyTextToMesh(mesh: THREE.Mesh, text: string, editor?: any) {
  try {
    const safeText = (text || '').toString();
    const desiredAspect = (mesh && mesh.scale) ? Math.max(0.1, mesh.scale.y / Math.max(mesh.scale.x, 0.001)) : 0.5;
    const baseWidth = 1024;
    const baseHeight = Math.max(512, Math.round(baseWidth * desiredAspect));
    const canvas = document.createElement('canvas');
    canvas.width = baseWidth;
    canvas.height = baseHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = Math.round(canvas.width * 0.06);
    const maxWidth = canvas.width - padding * 2 - Math.round(canvas.width * 0.04); // reserve for scrollbar
    const lineHeight = 60;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true; // Align with editor/image/video orientation to avoid upside-down on import

    if (!mesh.material || !(mesh.material instanceof THREE.MeshBasicMaterial)) {
      mesh.material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide, toneMapped: false });
    }
    // Ensure correct material settings for readable text
    mesh.material.side = THREE.FrontSide;
    mesh.material.toneMapped = false;
    mesh.material.color && mesh.material.color.set(0xffffff);
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;

    textCanvasMap.set(mesh, { canvas, ctx, padding, maxWidth, lineHeight, textContent: safeText, texture });
    textScrollState.set(mesh.uuid, { scrollY: 0, totalHeight: 0 });
    renderTextMesh(mesh);
  } catch (e) {
    console.error('applyTextToMesh error:', e);
  }
}

// Text scrolling functionality (from editor)
export function handleTextScroll(mesh: THREE.Mesh, deltaY: number) {
  const state = textScrollState.get(mesh.uuid);
  if (!state) return;

  state.scrollY += Math.sign(deltaY) * 40; // scroll step
  textScrollState.set(mesh.uuid, state);
  renderTextMesh(mesh);
}

// Check if mesh is a text mesh (from editor)
export function isTextMesh(obj: THREE.Object3D): boolean {
  if (!obj) return false;
  const t1 = (obj.userData?.assetType || '').toString().toLowerCase();
  const t2 = (obj.userData?.contentType || '').toString().toLowerCase();
  const looksLikeCanvas = !!(obj.material && obj.material.map && obj.material.map.isCanvasTexture);
  return (t1 === 'text' || t2 === 'text') && looksLikeCanvas;
}

// Cleanup function
export function cleanupMediaResources() {
  // Clean up video elements
  videoMap.forEach((video) => {
    try {
      video.pause();
      video.src = '';
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    } catch (e) {}
  });
  videoMap.clear();

  // Clean up text resources
  textCanvasMap.clear();
  textScrollState.clear();
}
