import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { classProgress } from '@/test/fixtures/progress'
import ClassProgressPanel from './ClassProgressPanel'
const api = vi.hoisted(() => ({ getClassProgress: vi.fn(), getResumeTarget: vi.fn() }))
vi.mock('../api/progressApi', () => api)
vi.mock('../api/recommendationApi', () => ({ getRecommendedActivities: vi.fn(async (classId: string) => ({ class_id: classId, recommendation: null, reason: 'NO_ELIGIBLE_ACTIVITY' })) }))
beforeEach(() => { api.getClassProgress.mockReset().mockResolvedValue(classProgress()); api.getResumeTarget.mockReset().mockResolvedValue(classProgress().resume_target) })
function view(id = 'class-123') {
  return <MemoryRouter><Routes><Route path="/" element={<ClassProgressPanel classId={id} />} /><Route path="/classes/:classId/lessons/:lessonId/activities/:activityId" element={<h1>Resumed canonical quiz</h1>} /><Route path="/classes/:classId" element={<h1>Class outline</h1>} /></Routes></MemoryRouter>
}
it('resumes the exact nested canonical attempt without any assessment-history lookup', async () => {
  render(view()); await screen.findByText('0 of 2 lessons complete');
  fireEvent.click(screen.getByText('Chapter (0/2)'));
  expect(await screen.findByText('Practice quiz: In progress')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue learning' }));
  expect(await screen.findByText('Resumed canonical quiz')).toBeInTheDocument();
  expect(api.getClassProgress).toHaveBeenCalledTimes(2);
})
it('keeps the canonical class-outline fallback', async () => {
  api.getResumeTarget.mockResolvedValue({ target_type: 'CLASS_OUTLINE', target_id: 'class-123', reason: 'NO_UNFINISHED_TARGET' });
  render(view()); await screen.findByText('0 of 2 lessons complete');
  fireEvent.click(screen.getByRole('button', { name: 'Continue learning' }));
  expect(await screen.findByRole('heading', { name: 'Class outline' })).toBeInTheDocument();
})
it('does not reuse progress from a previous class when the new read fails', async () => {
  const ui = render(view()); await screen.findByText('0 of 2 lessons complete');
  api.getClassProgress.mockRejectedValue(new Error('Access denied'));
  ui.rerender(view('other-class'));
  expect(screen.queryByText('0 of 2 lessons complete')).not.toBeInTheDocument();
  expect(await screen.findByText('Could not load learning progress')).toBeInTheDocument();
})
it('distinguishes loading, empty and retriable errors', async () => {
  let finish!: (value: ReturnType<typeof classProgress>) => void;
  api.getClassProgress.mockReturnValue(new Promise(resolve => { finish = resolve }));
  render(view()); expect(screen.getByRole('status')).toHaveTextContent('Loading progress');
  await waitFor(() => expect(api.getClassProgress).toHaveBeenCalled());
  finish({ ...classProgress(), chapters: [] });
  expect(await screen.findByText('No eligible lessons')).toBeInTheDocument();
})
