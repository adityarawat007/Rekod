export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-6 py-4 md:px-8">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-xl font-semibold leading-8">{title}</h1>
        {sub ? <div className="text-sm text-muted-foreground">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}
