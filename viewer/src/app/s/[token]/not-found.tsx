export default function SharedNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="font-heading text-2xl font-extrabold">This link is not active</p>
        <p className="mt-3 text-sm text-muted-foreground">
          It was revoked, or it never existed. Ask whoever sent it for a fresh one — there is
          nothing to sign in to here.
        </p>
      </div>
    </main>
  );
}
