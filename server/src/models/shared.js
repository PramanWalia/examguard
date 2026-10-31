export const sharedOptions = {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      delete ret.__v;
      delete ret.passwordHash;
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    },
  },
};
