import type { Metadata } from "next";
import licenses from "@/lib/legal/licenses.json";

export const metadata: Metadata = { title: "Open source" };

type License = {
  name: string;
  version: string;
  license: string;
  homepage: string | null;
};

export default function OpenSourcePage() {
  const list = licenses as License[];
  return (
    <>
      <h1>Open source</h1>
      <h2>Base template</h2>
      <p>
        N-Flow started from the{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="https://github.com/vercel-labs/workflow-builder-template"
          rel="noopener"
          target="_blank"
        >
          AI Workflow Builder Template
        </a>{" "}
        by Vercel, Inc. (commit 24fb0fd), licensed under the Apache License,
        Version 2.0. Copyright 2025 Vercel, Inc. We modified it substantially:
        monorepo packaging, rebranding, the Hive execution engine (replacing the
        Workflow DevKit runtime), workspaces and row-level security, hosted
        forms, new integrations, and the AI Copilot and Run Doctor. See the
        NOTICE file in the repository.
      </p>
      <h2>Dependencies ({list.length})</h2>
      <p>
        Direct dependencies of the app and its packages, with the license each
        one declares.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr>
              <th>Package</th>
              <th>Version</th>
              <th>License</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.name}>
                <td className="font-mono text-xs">{item.name}</td>
                <td className="font-mono text-xs">{item.version}</td>
                <td>{item.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
