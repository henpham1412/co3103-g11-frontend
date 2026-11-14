import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { expect, it } from 'vitest'
import { server } from '@/test/server'
import { classProgress } from '@/test/fixtures/progress'
import LessonCompletionControl from './LessonCompletionControl'
const base = 'http://localhost:8081/api/v1/classes/class-123'
it('refreshes canonical completion after marking and unmarking without assuming that viewing completes a lesson', async () => {
  let completed = false; const writes: string[] = [];
  server.use(http.get(`${base}/progress`, () => { const data = classProgress(); data.chapters[0].lessons[0].completed = completed; return HttpResponse.json(data) }),
    http.put(`${base}/lessons/lesson-1/completion`, () => { completed = true; writes.push('mark'); return HttpResponse.json({}) }),
    http.delete(`${base}/lessons/lesson-1/completion`, () => { completed = false; writes.push('unmark'); return new HttpResponse(null, { status: 204 }) }));
  render(<LessonCompletionControl classId="class-123" lessonId="lesson-1" archived={false} />);
  const mark = await screen.findByRole('button', { name: 'Mark lesson as complete' });
  // Wait for the status read, not merely the initial disabled button.
  await screen.findByText('Opening a lesson does not mark it complete.');
  await waitFor(() => expect(mark).toBeEnabled());
  expect(writes).toEqual([]); fireEvent.click(mark);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark as incomplete' }));
  await waitFor(() => expect(writes).toEqual(['mark', 'unmark']));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark lesson as complete' })).toBeEnabled());
})
it('disables writes for archived read-only history', async () => {
  render(<LessonCompletionControl classId="class-123" lessonId="lesson-1" archived />);
  await screen.findByText('This archived class is read-only.');
  expect(await screen.findByRole('button', { name: 'Mark lesson as complete' })).toBeDisabled();
})
it('keeps a failed completion status read distinct from incomplete evidence', async () => {
  server.use(http.get(`${base}/progress`, () => HttpResponse.json({ message: 'Unavailable', code: 'UNAVAILABLE', details: [] }, { status: 503 })));
  render(<LessonCompletionControl classId="class-123" lessonId="lesson-1" archived={false} />);
  expect(await screen.findByText('Completion status unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark lesson as complete' })).toBeDisabled();
})
