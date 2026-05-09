// Blink is disabled as per user request
export const blink = {
  db: {
    table: () => ({
      list: async () => [],
      get: async () => null,
      create: async (data: any) => data,
      update: async (id: string, data: any) => data,
      delete: async () => {},
    })
  },
  auth: {
    getUser: async () => null,
    signOut: async () => {},
  },
  analytics: {
    track: () => {},
    log: () => {},
  }
} as any;
