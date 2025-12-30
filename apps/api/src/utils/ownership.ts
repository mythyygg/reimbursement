export function getMissingProjectIds(
  requestedProjectIds: string[],
  ownedProjectIds: string[]
): string[] {
  const owned = new Set(ownedProjectIds);
  const seenMissing = new Set<string>();
  const missing: string[] = [];

  for (const projectId of requestedProjectIds) {
    if (owned.has(projectId)) {
      continue;
    }
    if (!seenMissing.has(projectId)) {
      seenMissing.add(projectId);
      missing.push(projectId);
    }
  }

  return missing;
}
