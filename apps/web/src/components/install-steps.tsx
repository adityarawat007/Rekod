// Written by `pnpm ext:zip` with public/rekod-extension.zip, from manifest.json.
import release from '@/lib/extension-release.json';

/** One source for the extension's download and install copy: the landing page
 *  and the dashboard's first-run checklist both read it. */
export const EXTENSION_ZIP = '/rekod-extension.zip';
export const EXTENSION_VERSION = release.version;
export const EXTENSION_KB = Math.round(release.bytes / 1024);

export const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="mono text-[13px] text-ink">{children}</code>
);

export const INSTALL_STEPS: React.ReactNode[] = [
  <>Unzip it and keep the <Code>rekod-extension</Code> folder somewhere permanent.</>,
  <>Open <Code>chrome://extensions</Code> and turn on Developer mode.</>,
  <>Click Load unpacked and pick that folder.</>,
];
