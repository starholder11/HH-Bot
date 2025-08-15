"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FileManagerRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new library route
    router.replace('/library');
  }, [router]);

        return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Redirecting...</h1>
        <p className="text-neutral-400">Taking you to the Library</p>
        </div>
    </div>
  );
}
