/**
 * The only user shape that may leave the API. Never includes passwordHash,
 * tokenVersion, refresh tokens, or joined-exam bookkeeping.
 */
export const publicUser = (user) =>
  user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        batchIds: [...(user.batchIds || [])],
        isActive: Boolean(user.isActive),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    : null;
