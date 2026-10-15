// The smallest possible React island: it renders data-hydrated="false" on the server and flips it to "true" once
// React has hydrated it in the browser. tests/e2e/edge.spec.ts uses it to prove that the inline scripts Astro emits
// for islands run under the Worker's CSP (docs/adr/0010-csp-hashes-for-islands.md).
import { useEffect, useState } from 'react';

export default function HydrationProbe({ directive }: { directive: string }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return (
    <p data-probe={directive} data-hydrated={String(hydrated)}>
      client:{directive}
    </p>
  );
}
