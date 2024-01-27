export const Game: {
  creeps: { [name: string]: any };
  rooms: any;
  spawns: any;
  time: any;
  cpu: any;
  gcl: any;
  gpl: any;
} = {
  creeps: {},
  rooms: [],
  spawns: {},
  time: 12345,
  cpu: { limit: 120, getUsed: () => 0 },
  gcl: { level: 1, progress: 0, progressTotal: 1000 },
  gpl: { level: 1, progress: 0, progressTotal: 1000 },
};

export const Memory: {
  creeps: { [name: string]: any };
  stats: any;
} = {
  creeps: {},
  stats: {},
};
