import { SirUpload } from "@/components/sir/SirUpload";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
          <p className="text-sm font-medium text-zinc-500">
            Actually-Good-Notebook
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
                SIR deck viewer
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
                Upload a local .sir archive to validate it and inspect each
                slide&apos;s Markdown beside its WebP image.
              </p>
            </div>
          </div>
        </header>

        <SirUpload />
      </div>
    </main>
  );
}
