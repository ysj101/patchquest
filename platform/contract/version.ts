const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isVersion(value: string): boolean {
  return SEMVER.test(value);
}

/** range は 'x.y.z'（完全一致）か '^x.y.z'（同じメジャー版で x.y.z 以上） */
export function isVersionRange(range: string): boolean {
  return isVersion(range.startsWith('^') ? range.slice(1) : range);
}

export function satisfies(version: string, range: string): boolean {
  if (!isVersion(version) || !isVersionRange(range)) return false;
  if (!range.startsWith('^')) return version === range;
  const [major, minor, patch] = version.split('.').map(Number) as [number, number, number];
  const [rMajor, rMinor, rPatch] = range.slice(1).split('.').map(Number) as [number, number, number];
  if (major !== rMajor) return false;
  return minor > rMinor || (minor === rMinor && patch >= rPatch);
}
