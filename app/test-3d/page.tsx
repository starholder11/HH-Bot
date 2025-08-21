"use client";
import { useState, useEffect } from 'react';

export default function Test3DPage() {
  const [status, setStatus] = useState('Loading...');
  const [dependencies, setDependencies] = useState<any>({});

  useEffect(() => {
    const testDependencies = async () => {
      const results: any = {};
      
      try {
        const fiber = await import('@react-three/fiber');
        results.fiber = '✅ @react-three/fiber loaded';
      } catch (e) {
        results.fiber = '❌ @react-three/fiber failed: ' + (e as Error).message;
      }

      try {
        const drei = await import('@react-three/drei');
        results.drei = '✅ @react-three/drei loaded';
      } catch (e) {
        results.drei = '❌ @react-three/drei failed: ' + (e as Error).message;
      }

      try {
        const three = await import('three');
        results.three = '✅ three loaded';
      } catch (e) {
        results.three = '❌ three failed: ' + (e as Error).message;
      }

      try {
        const leva = await import('leva');
        results.leva = '✅ leva loaded';
      } catch (e) {
        results.leva = '❌ leva failed: ' + (e as Error).message;
      }

      setDependencies(results);
      setStatus('Dependency check complete');
    };

    testDependencies();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4">R3F Dependency Test</h1>
      <p className="mb-4 text-neutral-300">Checking React Three Fiber installation:</p>
      
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Status: {status}</h2>
        
        <div className="space-y-2 font-mono text-sm">
          {Object.entries(dependencies).map(([pkg, result]) => (
            <div key={pkg} className="flex items-center gap-2">
              <span className="text-neutral-400 w-32">{pkg}:</span>
              <span className={result.toString().startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
                {result}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-2">Next Steps:</h3>
        <ul className="text-sm text-neutral-300 space-y-1">
          <li>• If all dependencies show ✅, R3F is ready for use</li>
          <li>• Task 2.1 (Install R3F Dependencies) is complete</li>
          <li>• Ready to proceed with Task 2.2 (SpaceViewer Component)</li>
        </ul>
      </div>
    </div>
  );
}
