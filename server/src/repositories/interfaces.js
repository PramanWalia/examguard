/**
 * @fileoverview Repository interfaces.
 *
 * The service layer depends only on these domain-level contracts. They are not
 * generic CRUD: the expensive invariants (one active attempt, monotonic answer
 * writes, atomic finalization) have dedicated methods so an implementation can
 * enforce them in one place.
 *
 * ## Atomicity
 *
 * The in-memory driver does check-and-set inside one synchronous JavaScript
 * block, with no `await` between the read and the write. Node runs one job at a
 * time, so no other request can interleave inside that block: it is atomic
 * within one process.
 *
 * That is **not** a database guarantee. Two Node processes (or two containers)
 * have separate heaps. The Mongo driver must reproduce each guarantee with a
 * unique index (`examId + studentId` for attempts) or a conditional update
 * (`updateOne({ _id, status: 'in_progress' }, ...)`), and multi-document work
 * must use a transaction. Do not treat the memory driver as proof of
 * concurrency safety.
 *
 * @typedef {'admin'|'teacher'|'student'} Role
 *
 * @typedef {Object} UserRecord
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {Role} role
 * @property {string[]} batchIds
 * @property {boolean} isActive
 * @property {string} passwordHash
 * @property {number} tokenVersion
 * @property {string[]} joinedExamIds
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} QuestionRecord
 * @property {string} id
 * @property {string} subject
 * @property {string} topic
 * @property {'easy'|'medium'|'hard'} difficulty
 * @property {'single_choice'|'multiple_choice'|'numeric'} type
 * @property {string} prompt
 * @property {Array<{id: string, text: string}>} options
 * @property {string[]} correctOptionIds
 * @property {number|null} numericAnswer
 * @property {string} explanation
 * @property {number} defaultMarks
 * @property {number} negativeMarks
 * @property {string} createdBy
 * @property {boolean} isArchived
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} ExamItemRecord
 * @property {string} id
 * @property {string} questionId
 * @property {number} order
 * @property {number} marks
 * @property {number} negativeMarks
 * @property {QuestionSnapshot|null} questionSnapshot
 *
 * @typedef {Object} QuestionSnapshot
 * @property {string} subject
 * @property {string} topic
 * @property {'easy'|'medium'|'hard'} difficulty
 * @property {'single_choice'|'multiple_choice'|'numeric'} type
 * @property {string} prompt
 * @property {Array<{id: string, text: string}>} options
 * @property {string[]} correctOptionIds
 * @property {number|null} numericAnswer
 * @property {string} explanation
 *
 * @typedef {Object} ExamSettings
 * @property {boolean} shuffleQuestions
 * @property {boolean} shuffleOptions
 * @property {boolean} partialMarking
 * @property {number} passPercentage
 * @property {number} violationLimit
 * @property {boolean} autoSubmitOnViolation
 * @property {number} maxAttempts
 * @property {number} numericTolerance
 *
 * @typedef {Object} ExamRecord
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {number} durationMinutes
 * @property {string} startAt
 * @property {string} endAt
 * @property {'draft'|'published'} status
 * @property {'immediate'|'after_end'|'manual'} resultMode
 * @property {ExamSettings} settings
 * @property {{batchIds: string[], joinCodeEnabled: boolean}} assignment
 * @property {string|null} joinCode
 * @property {ExamItemRecord[]} items
 * @property {number} totalMarks
 * @property {string} createdBy
 * @property {string|null} publishedAt
 * @property {string|null} resultsReleasedAt
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} StoredAnswer
 * @property {string} itemId
 * @property {string[]} selectedOptionIds
 * @property {number|null} numericValue
 * @property {boolean} markedForReview
 * @property {number} clientSeq
 * @property {string} updatedAt
 *
 * @typedef {Object} AttemptRecord
 * @property {string} id
 * @property {string} examId
 * @property {string} studentId
 * @property {'in_progress'|'submitted'} status
 * @property {string} startedAt
 * @property {string} expiresAt
 * @property {string|null} submittedAt
 * @property {Array<{id: string, order: number, marks: number, negativeMarks: number, question: {prompt: string, type: string, options: Array<{id: string, text: string}>}}>} questionSet
 * @property {Object} examSnapshot - immutable data needed to resume/grade
 * @property {Record<string, StoredAnswer>} answers
 * @property {Array<{type: string, meta: Object, occurredAt: string}>} violations
 * @property {Object|null} gradedPayload
 * @property {'submit'|'auto_submit'|'expiry'|null} finalizedBy
 * @property {number|null} timeTakenSeconds
 *
 * @typedef {Object} UserRepository
 * @property {(input: Object) => Promise<UserRecord>} create
 * @property {(email: string) => Promise<UserRecord|null>} findByEmail
 * @property {(id: string) => Promise<UserRecord|null>} findById
 * @property {(ids: string[]) => Promise<UserRecord[]>} findByIds
 * @property {(id: string, patch: Object) => Promise<UserRecord|null>} updateById
 * @property {(id: string) => Promise<UserRecord|null>} deleteById
 * @property {(id: string) => Promise<UserRecord|null>} incrementTokenVersion
 * @property {(id: string, examId: string) => Promise<void>} addJoinedExam
 * @property {(id: string) => Promise<string[]>} getJoinedExamIds
 * @property {(examId: string) => Promise<UserRecord[]>} findUsersWhoJoined
 * @property {(batchIds: string[]) => Promise<UserRecord[]>} findStudentsInBatches
 * @property {(filter: Object) => Promise<{data: UserRecord[], meta: Object}>} list
 * @property {() => Promise<Object>} platformStats
 *
 * @typedef {Object} QuestionRepository
 * @property {(input: Object) => Promise<QuestionRecord>} create
 * @property {(id: string) => Promise<QuestionRecord|null>} findById
 * @property {(ids: string[]) => Promise<QuestionRecord[]>} findByIds
 * @property {(id: string, patch: Object) => Promise<QuestionRecord|null>} updateById
 * @property {(id: string) => Promise<boolean>} archiveById
 * @property {(id: string) => Promise<boolean>} deleteById
 * @property {(filter: Object) => Promise<{data: QuestionRecord[], meta: Object}>} list
 *
 * @typedef {Object} ExamRepository
 * @property {(input: Object) => Promise<ExamRecord>} create
 * @property {(id: string) => Promise<ExamRecord|null>} findById
 * @property {(id: string, patch: Object) => Promise<ExamRecord|null>} updateById
 * @property {(id: string, teacherId: string, prepared: {items: ExamItemRecord[], totalMarks: number}) => Promise<ExamRecord|null>} publish
 * @property {(id: string) => Promise<ExamRecord|null>} deleteById
 * @property {(filter: Object) => Promise<{data: ExamRecord[], meta: Object}>} list
 * @property {(code: string) => Promise<ExamRecord|null>} findByJoinCode
 * @property {(id: string) => Promise<ExamRecord|null>} releaseResults
 * @property {(questionId: string) => Promise<boolean>} isQuestionReferenced
 * @property {() => Promise<Object>} platformStats
 *
 * @typedef {Object} AttemptRepository
 * @property {(input: Object) => Promise<AttemptRecord>} create
 * @property {(examId: string, studentId: string, data: Object, options?: {maxAttempts?: number}) => Promise<{attempt: AttemptRecord|null, created: boolean, reason?: string}>} createIfNoActive
 * @property {(id: string) => Promise<AttemptRecord|null>} findById
 * @property {(id: string, studentId: string) => Promise<AttemptRecord|null>} findByIdAndStudent
 * @property {(examId: string, studentId: string) => Promise<AttemptRecord|null>} findByExamAndStudent
 * @property {(examId: string) => Promise<AttemptRecord[]>} listByExam
 * @property {(studentId: string) => Promise<AttemptRecord[]>} listByStudent
 * @property {(examId: string) => Promise<AttemptRecord[]>} listSubmittedByExam
 * @property {(id: string, itemId: string, answer: StoredAnswer, clientSeq: number, now: string) => Promise<StoredAnswer|null>} saveAnswerIfNewer
 * @property {(id: string, violation: Object, options?: {cap?: number}) => Promise<AttemptRecord|null>} recordViolation
 * @property {(id: string, gradedPayload: Object, options?: {submittedAt?: string, finalizedBy?: string}) => Promise<AttemptRecord|null>} finalizeIfInProgress
 * @property {(now: string, limit: number) => Promise<AttemptRecord[]>} findExpiredInProgress
 * @property {(examId: string) => Promise<number>} deleteByExam
 *
 * @typedef {Object} AnalyticsRepository
 * @property {(examId: string) => Promise<Object>} examSummary
 * @property {(examId: string) => Promise<Array<Object>>} scoreDistribution
 * @property {(examId: string) => Promise<Array<Object>>} questionStats
 * @property {(examId: string) => Promise<Array<Object>>} leaderboard
 * @property {(studentId: string) => Promise<Array<Object>>} studentHistory
 * @property {() => Promise<Object>} platformStats
 */

export {};
