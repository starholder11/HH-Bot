"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VisualSearchRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new workshop route
    router.replace('/workshop');
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Redirecting...</h1>
        <p className="text-neutral-400">Taking you to the Workshop</p>
      </div>
    </div>
  );
}