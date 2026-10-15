/** One source for the extension's install link: the landing page and the
 *  dashboard's first-run checklist both read it. */
export const EXTENSION_URL = 'https://chromewebstore.google.com/detail/mldnjcigeamapdffjohhgiajjbikjcjc';

export const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="mono text-[13px] text-ink">{children}</code>
);
