import { QuestionModel } from '../../models/question.js';
import { many, pageMeta, plain } from './helpers.js';

export class MongoQuestionRepository {
  async create(input) { return plain(await QuestionModel.create(input)); }
  async findById(id) { return plain(await QuestionModel.findOne({ _id: id, isArchived: false }).lean()); }
  async findByIds(ids) { return many(await QuestionModel.find({ _id: { $in: ids }, isArchived: false }).lean()); }
  async updateById(id, patch) { return plain(await QuestionModel.findOneAndUpdate({ _id: id, isArchived: false }, { $set: patch }, { new: true, runValidators: true }).lean()); }
  async archiveById(id) { return (await QuestionModel.updateOne({ _id: id, isArchived: false }, { $set: { isArchived: true } })).modifiedCount === 1; }
  async deleteById(id) { return (await QuestionModel.deleteOne({ _id: id })).deletedCount === 1; }
  async list({ createdBy, subject, topic, difficulty, type, q, page = 1, limit = 20 } = {}) {
    const filter = { isArchived: false }; if (createdBy) filter.createdBy = createdBy; if (subject) filter.subject = subject; if (topic) filter.topic = topic; if (difficulty) filter.difficulty = difficulty; if (type) filter.type = type; if (q) filter.$text = { $search: q };
    const [rows, total, facets] = await Promise.all([QuestionModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), QuestionModel.countDocuments(filter), QuestionModel.aggregate([{ $match: { isArchived: false } }, { $group: { _id: null, subjects: { $addToSet: '$subject' }, topics: { $addToSet: '$topic' } } }])]);
    return { data: many(rows), meta: { ...pageMeta(page, limit, total), facets: { subjects: facets[0]?.subjects?.sort() || [], topics: facets[0]?.topics?.sort() || [] } } };
  }
}
