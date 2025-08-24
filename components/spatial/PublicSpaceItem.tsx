"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader, VideoTexture, SRGBColorSpace, LinearFilter, ClampToEdgeWrapping, DoubleSide } from "three";

type PublicSpaceItemProps = {
  item: any;
};

function proxied(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/")) return url; // already proxied
  try {
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

export default function PublicSpaceItem({ item }: PublicSpaceItemProps) {
  const type = (item.assetType || "").toLowerCase();
  const url = proxied(item.mediaUrl);

  // Render as simple colored box if no media
  if (!url && type !== "text") {
    return (
      <group position={item.position} rotation={item.rotation} scale={item.scale}>
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={"#444"} />
        </mesh>
      </group>
    );
  }

  if (type === "video") {
    return <VideoPlane item={item} url={url!} />;
  }

  // Treat text (canvas data URL) and images the same: texture on a plane
  return <ImagePlane item={item} url={url!} />;
}

function ImagePlane({ item, url }: { item: any; url: string }) {
  let texture: any = null;
  try {
    texture = useLoader(TextureLoader, url);
    if (texture) {
      texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.flipY = true;
    }
  } catch {}

  return (
    <group position={item.position} rotation={item.rotation} scale={item.scale}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={texture ?? undefined} color={texture ? undefined : "#666"} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

function VideoPlane({ item, url }: { item: any; url: string }) {
  const [videoTexture, setVideoTexture] = useState<VideoTexture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";

    const onCanPlay = async () => {
      try {
        await video.play();
      } catch {}
      const tex = new VideoTexture(video);
      tex.colorSpace = SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.wrapS = ClampToEdgeWrapping;
      tex.wrapT = ClampToEdgeWrapping;
      setVideoTexture(tex);
      videoRef.current = video;
    };
    video.addEventListener("canplay", onCanPlay);
    return () => {
      video.removeEventListener("canplay", onCanPlay);
      video.pause();
      video.src = "";
      video.load();
      if (videoTexture) videoTexture.dispose();
    };
  }, [url]);

  return (
    <group position={item.position} rotation={item.rotation} scale={item.scale}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={videoTexture ?? undefined} color={videoTexture ? undefined : "#222"} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}


