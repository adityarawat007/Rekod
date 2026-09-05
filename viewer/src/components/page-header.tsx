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
    <div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-5 md:px-8">
      <div>
        <h1 className="font-heading text-2xl font-extrabold leading-none">{title}</h1>
        {sub ? <div className="mt-1.5 text-sm text-muted-foreground">{sub}</div> : null}
      </div>
      {children}
    </div>
  );
}
