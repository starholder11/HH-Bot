"use client";
import TestScene from '@/components/spatial/test-r3f';

export default function Test3DPage() {
  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">R3F Test</h1>
      <p className="mb-4 text-neutral-300">Testing React Three Fiber installation and basic rendering:</p>
      <div className="border border-neutral-700 rounded-lg overflow-hidden">
        <TestScene />
      </div>
      <p className="mt-4 text-sm text-neutral-500">
        If you see an orange rotating cube above, R3F is working correctly!
      </p>
    </div>
  );
}
