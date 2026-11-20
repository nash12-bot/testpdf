export default function CompressLoading() {
  return (
    <div className="relative min-h-screen flex flex-col bg-background animate-pulse">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 h-16" />
      <main className="flex-1 flex flex-col items-center justify-start pt-8 sm:pt-12 pb-16 px-4">
        <div className="text-center max-w-xl mx-auto mb-6 space-y-2">
          <div className="h-10 w-48 bg-muted rounded-md mx-auto" />
          <div className="h-4 w-80 bg-muted/60 rounded mx-auto mt-2" />
        </div>
        <div className="w-[min(100%,680px)] h-64 rounded-2xl border-2 border-dashed border-border/60 bg-muted/20" />
      </main>
    </div>
  );
}

