import type { LinkGroup, Player } from '../types';

/** Keep only groups with at least two members and clear stale player references. */
export function normalizeGroups(
  players: Player[],
  groups: LinkGroup[],
): { players: Player[]; groups: LinkGroup[] } {
  const memberCounts = new Map<string, number>();
  players.forEach((player) => {
    if (player.groupId) memberCounts.set(player.groupId, (memberCounts.get(player.groupId) ?? 0) + 1);
  });
  const normalizedGroups = groups.filter((group) => (memberCounts.get(group.id) ?? 0) >= 2);
  const groupIds = new Set(normalizedGroups.map((group) => group.id));
  return {
    groups: normalizedGroups,
    players: players.map((player) => groupIds.has(player.groupId ?? '')
      ? player
      : { ...player, groupId: undefined }),
  };
}
