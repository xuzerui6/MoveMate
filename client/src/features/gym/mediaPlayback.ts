type Player = { pause: () => void };
export function createDemoPlaybackGroup() {
  const players = new Set<Player>();
  return {
    register(player: Player) {
      players.add(player);
      return () => {
        players.delete(player);
        player.pause();
      };
    },
    play(current: Player) {
      for (const player of players) if (player !== current) player.pause();
    },
  };
}
export const demoPlayback = createDemoPlaybackGroup();
