import type { ClassProgressResponse } from '../../features/classes/types'
import type { TutorMemberProgressResponse, TutorProgressResponse } from '../../features/tutor-classes/types'

// Canonical LMS-7 DTO shape: no outline activities, class_title or invented mastery percentages.
export function classProgress(classId = 'class-123'): ClassProgressResponse {
  return {
    class_id: classId, completed_lessons: 0, eligible_lessons: 2, progress_percentage: 0, status: 'IN_PROGRESS',
    chapters: [{ chapter_id: 'chapter-1', title: 'Chapter', completed_lessons: 0, eligible_lessons: 2, progress_percentage: 0,
      lessons: [
        { lesson_id: 'lesson-1', title: 'Setup', sequence_order: 0, completed: false, marked_at: null,
          assessment_statuses: [{ activity_id: 'activity-1', title: 'Practice quiz', activity_type: 'QUIZ', status: 'IN_PROGRESS',
            attempts: [{ attempt_id: 'attempt-old', attempt_number: 1, status: 'IN_PROGRESS', started_at: '2026-11-01T01:00:00Z', submitted_at: null, score: null }] }] },
        { lesson_id: 'lesson-2', title: 'Your first program', sequence_order: 1, completed: false, marked_at: null, assessment_statuses: [] },
      ] }],
    resume_target: { target_type: 'QUIZ_ATTEMPT', target_id: 'attempt-old', reason: 'IN_PROGRESS_ATTEMPT' },
  }
}
export function tutorProgress(classId = 'class-123'): TutorProgressResponse {
  return { class_id: classId, members: ['a', 'b'].map(id => ({ class_member_id: id, student_id: id,
    student_name: `Learner ${id}`, completed_lessons: 0, eligible_lessons: 2, progress_percentage: 0, status: 'IN_PROGRESS' })) }
}
export function memberProgress(memberId = 'a', classId = 'class-123'): TutorMemberProgressResponse {
  return { ...classProgress(classId), class_member_id: memberId, student_id: memberId, membership_status: 'ACTIVE',
    assessment_outcomes: [{ attempt_id: `attempt-${memberId}`, class_id: classId, activity_id: 'activity-1', activity_title: `Quiz ${memberId}`,
      attempt_number: 1, type: 'QUIZ', status: 'SUBMITTED', started_at: '2026-11-01T00:00:00Z', submitted_at: '2026-11-01T00:01:00Z', score: 0, feedback: 'Review this topic' }],
    skill_mastery: [{ skill_topic_id: 'topic-a', name: 'Known zero', level: 'WEAK' }, { skill_topic_id: 'topic-b', name: 'No evidence', level: null }] }
}
