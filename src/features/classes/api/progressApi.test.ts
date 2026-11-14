import { expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/server'
import { classProgress, memberProgress, tutorProgress } from '@/test/fixtures/progress'
import { getClassProgress, getResumeTarget, markLessonComplete, unmarkLessonComplete, recordLastVisit } from './progressApi'
import { getTutorClassProgress, getTutorMemberProgress } from '../../tutor-classes/api/tutorClassApi'
const base = 'http://localhost:8081/api/v1'
it('reads exact LMS-7 progress and resume DTOs without inventing activity identifiers', async () => {
  server.use(http.get(`${base}/classes/class-123/resume-target`, () => HttpResponse.json(classProgress().resume_target)));
  expect(await getClassProgress('class-123')).toEqual(classProgress());
  expect(await getResumeTarget('class-123')).toEqual({ target_type: 'QUIZ_ATTEMPT', target_id: 'attempt-old', reason: 'IN_PROGRESS_ATTEMPT' });
})
it('uses the canonical mark/unmark/last-visit methods and body', async () => {
  const calls: string[] = [];
  server.use(
    http.put(`${base}/classes/class-123/lessons/lesson-1/completion`, () => { calls.push('mark'); return HttpResponse.json({ lesson_id: 'lesson-1', completed: true, marked_at: '2026-11-01T00:00:00Z' }) }),
    http.delete(`${base}/classes/class-123/lessons/lesson-1/completion`, () => { calls.push('unmark'); return new HttpResponse(null, { status: 204 }) }),
    http.put(`${base}/classes/class-123/last-visit`, async ({ request }) => { expect(await request.json()).toEqual({ lesson_id: 'lesson-1' }); calls.push('visit'); return HttpResponse.json({}) }),
  );
  await markLessonComplete('class-123', 'lesson-1'); await unmarkLessonComplete('class-123', 'lesson-1'); await recordLastVisit('class-123', 'lesson-1');
  expect(calls).toEqual(['mark', 'unmark', 'visit']);
})
it('reads tutor summaries and member details from their class-scoped routes', async () => {
  server.use(http.get(`${base}/tutor/classes/class-123/progress`, () => HttpResponse.json(tutorProgress())),
    http.get(`${base}/tutor/classes/class-123/members/a/progress`, () => HttpResponse.json(memberProgress())));
  expect(await getTutorClassProgress('class-123')).toEqual(tutorProgress());
  expect(await getTutorMemberProgress('class-123', 'a')).toEqual(memberProgress());
})
it.each([403, 404, 500])('propagates member read failures instead of substituting previous data (%s)', async status => {
  server.use(http.get(`${base}/tutor/classes/class-123/members/a/progress`, () => HttpResponse.json({ code: 'UNAVAILABLE', message: 'No access', details: [] }, { status })));
  await expect(getTutorMemberProgress('class-123', 'a')).rejects.toMatchObject({ response: { status } });
})
