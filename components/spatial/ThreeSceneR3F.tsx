"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";

type ThreeChild = {
  uuid: string;
  type: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  userData?: any;
  geometry?: { type?: string; width?: number; height?: number };
};

export default function ThreeSceneR3F({ children }: { children: ThreeChild[] }) {
  return (
    <group>
      {children?.map((child) => (
        <ItemMesh key={child.uuid} child={child} />
      ))}
    </group>
  );
}

function ItemMesh({ child }: { child: ThreeChild }) {
  const { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], userData } = child;
  const assetType: string = String(userData?.assetType || userData?.contentType || "").toLowerCase();
  const mediaUrl: string | undefined = userData?.mediaUrl;

  if (assetType === "video" && mediaUrl) {
    return <VideoPlane position={position} rotation={rotation} scale={scale} url={mediaUrl} />;
  }

  if ((assetType === "image" && mediaUrl) || userData?.canvasDataUrl || userData?.fullTextContent || assetType === "text") {
    return <ImageOrTextPlane child={child} />;
  }

  // Fallback (should be rare)
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#444" />
      </mesh>
    </group>
  );
}

function ImageOrTextPlane({ child }: { child: ThreeChild }) {
  const { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], userData } = child;
  const assetType: string = String(userData?.assetType || userData?.contentType || "").toLowerCase();
  const [textContent, setTextContent] = useState<string | null>(null);
  const [canvasTexture, setCanvasTexture] = useState<any>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const contentHeightRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch full text content when not present
  useEffect(() => {
    if (assetType !== "text") return;
    if (userData?.fullTextContent) {
      setTextContent(String(userData.fullTextContent));
      return;
    }
    // Try to infer slug from import metadata or assetId
    const slug: string | undefined = userData?.importMetadata?.textSlug || userData?.assetId;
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.success && json?.content) {
          setTextContent(String(json.content));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [assetType, userData]);

  // For images, use mediaUrl directly
  // For text, generate a canvas and use its data URL
  const effectiveUrl = useMemo(() => {
    const url = userData?.mediaUrl;
    if (url) return proxy(url);
    if (userData?.canvasDataUrl) return userData.canvasDataUrl;
    // For text with dynamic canvas we will bypass TextureLoader and use CanvasTexture below
    return null;
  }, [userData, assetType, textContent]);

  // If this is text, build a live CanvasTexture that supports wheel scrolling
  useEffect(() => {
    if (assetType !== "text") return;
    const content = userData?.fullTextContent || textContent || userData?.text || userData?.name || "";
    let disposed = false;
    (async () => {
      const THREE = await import("three");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const width = 1024;
      const height = 1024;
      canvas.width = width;
      canvas.height = height;
      canvasRef.current = canvas;

      const draw = () => {
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#000000";
        ctx.font = "32px Inter, Arial, sans-serif";
        ctx.textBaseline = "top";
        const lineHeight = 40;
        const words = String(content).split(/\s+/);
        let x = 32;
        let y = 32 - scrollOffset;
        let line = "";
        let total = 0;
        for (const w of words) {
          const test = line ? line + " " + w : w;
          const measure = ctx.measureText(test).width;
          if (x + measure > width - 32) {
            if (y + lineHeight >= -lineHeight && y <= height) ctx.fillText(line, x, y);
            line = w;
            y += lineHeight;
            total += lineHeight;
          } else {
            line = test;
          }
        }
        if (y + lineHeight >= -lineHeight && y <= height) ctx.fillText(line, x, y);
        contentHeightRef.current = total + lineHeight + 64; // approximate full content height
        tex.needsUpdate = true;
      };

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      setCanvasTexture(tex);
      draw();

      return () => {
        disposed = true;
        try { tex.dispose(); } catch {}
      };
    })();
  }, [assetType, textContent, userData, scrollOffset]);

  // Non-text path: regular texture load
  let texture: any = null;
  if (assetType !== "text") {
    try {
      texture = useLoader(TextureLoader, effectiveUrl || "");
      if (texture) {
        // Match editor defaults
        // @ts-ignore
        texture.colorSpace = (window as any).THREE?.SRGBColorSpace || 3002;
        texture.generateMipmaps = false;
        texture.minFilter = 1006; // LinearFilter
        texture.magFilter = 1006;
        texture.flipY = true;
      }
    } catch {}
  }

  const onWheel = (e: any) => {
    if (assetType !== "text") return;
    e.stopPropagation();
    const viewH = 1024;
    const total = Math.max(contentHeightRef.current, viewH);
    const maxOffset = Math.max(0, total - viewH);
    const next = Math.min(maxOffset, Math.max(0, scrollOffset + e.deltaY));
    if (next !== scrollOffset) setScrollOffset(next);
  };

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh onWheel={onWheel}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={(assetType === "text" ? canvasTexture : texture) ?? undefined} color={(assetType === "text" ? canvasTexture : texture) ? undefined : "#666"} toneMapped={false} />
      </mesh>
    </group>
  );
}

function VideoPlane({ position, rotation, scale, url }: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number]; url: string }) {
  const [videoTexture, setVideoTexture] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let disposed = false;
    const setup = async () => {
      const THREE = await import("three");
      const video = document.createElement("video");
      video.src = proxy(url);
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "metadata";
      const onReady = async () => {
        try { await video.play(); } catch {}
        if (disposed) return;
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        setVideoTexture(tex);
        videoRef.current = video;
      };
      // Align with editor behavior: create texture after loadeddata to avoid black frame
      video.addEventListener("loadeddata", onReady);
      return () => {
        disposed = true;
        video.removeEventListener("loadeddata", onReady);
        try { video.pause(); video.src = ""; video.load(); } catch {}
        try { videoTexture?.dispose?.(); } catch {}
      };
    };
    const cleanupPromise = setup();
    return () => { cleanupPromise && (cleanupPromise as any)(); };
  }, [url]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={videoTexture ?? undefined} color={videoTexture ? undefined : "#222"} toneMapped={false} />
      </mesh>
    </group>
  );
}

function createTextCanvasDataUrl(text: string): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const width = 1024;
  const height = 1024;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.font = "32px Inter, Arial, sans-serif";
  ctx.textBaseline = "top";
  const lineHeight = 40;
  const words = text.split(/\s+/);
  let x = 32;
  let y = 32;
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    const measure = ctx.measureText(test).width;
    if (x + measure > width - 32) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineHeight;
      if (y > height - 32) break;
    } else {
      line = test;
    }
  }
  if (y <= height - 32) ctx.fillText(line, x, y);
  return canvas.toDataURL("image/png");
}

function proxy(url: string): string {
  if (!url) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/")) return url;
  try { return `/api/proxy?url=${encodeURIComponent(url)}`; } catch { return url; }
}


