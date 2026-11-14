import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { memberProgress, tutorProgress } from '@/test/fixtures/progress'
import TutorProgressPanel from './TutorProgressPanel'
import { ApiError } from '@/api/apiError'
const api = vi.hoisted(() => ({ getTutorClassProgress: vi.fn(), getTutorMemberProgress: vi.fn() }))
vi.mock('../api/tutorClassApi', () => api)
beforeEach(() => {
  api.getTutorClassProgress.mockReset().mockImplementation(async (id: string) => tutorProgress(id));
  api.getTutorMemberProgress.mockReset().mockImplementation(async (id: string, member: string) => memberProgress(member, id));
})
async function select(name = 'a') { fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Learner ${name}`) })); }
it('keeps pending class progress distinct from an empty roster', async () => {
  api.getTutorClassProgress.mockReturnValue(new Promise(() => {})); render(<TutorProgressPanel classId="class-123" revision={0} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading member progress'); expect(screen.queryByText('No active member progress is available')).not.toBeInTheDocument();
})
it('renders canonical skill_mastery levels including no evidence without percentages', async () => {
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  expect(await screen.findByText('Known zero: WEAK')).toBeInTheDocument(); expect(screen.getByText('No evidence: No assessment evidence')).toBeInTheDocument();
  expect(screen.getByText(/Quiz a · Attempt 1/)).toHaveTextContent('0%');
})
it.each([403, 404, 500])('clears the previous member on a new detail failure (%s)', async status => {
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText('Known zero: WEAK');
  api.getTutorMemberProgress.mockRejectedValue(new ApiError({ status, message: 'Read denied', error: 'Unavailable', timestamp: '', path: '' })); await select('b');
  expect(screen.queryByText('Known zero: WEAK')).not.toBeInTheDocument(); expect(await screen.findByText('Could not load student progress')).toBeInTheDocument();
  expect(screen.queryByText('Student a')).not.toBeInTheDocument(); ui.unmount();
})
it('invalidates old member data immediately on a class change', async () => {
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText('Known zero: WEAK');
  ui.rerender(<TutorProgressPanel classId="other-class" revision={0} />);
  expect(screen.queryByText('Known zero: WEAK')).not.toBeInTheDocument(); await screen.findByRole('button', { name: /Learner a/ });
  expect(screen.queryByText('Student a')).not.toBeInTheDocument();
})
it('removal followed by reload cannot retain details of an inactive member', async () => {
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText('Known zero: WEAK');
  api.getTutorClassProgress.mockResolvedValue({ class_id: 'class-123', members: [] });
  ui.rerender(<TutorProgressPanel classId="class-123" revision={1} />);
  expect(screen.queryByText('Known zero: WEAK')).not.toBeInTheDocument(); expect(await screen.findByText('No active member progress is available')).toBeInTheDocument();
})
it('revalidates a still-active selected member when reload changes', async () => {
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText('Known zero: WEAK');
  api.getTutorMemberProgress.mockRejectedValue(new Error('No longer permitted'));
  ui.rerender(<TutorProgressPanel classId="class-123" revision={1} />);
  expect(await screen.findByText('Could not load student progress')).toBeInTheDocument(); expect(screen.queryByText('Known zero: WEAK')).not.toBeInTheDocument();
})
it('ignores older in-flight results even when the transport ignores cancellation', async () => {
  let finish!: (value: ReturnType<typeof memberProgress>) => void;
  api.getTutorMemberProgress.mockImplementation((_id: string, member: string) => member === 'a' ? new Promise(resolve => { finish = resolve }) : Promise.resolve(memberProgress('b')));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await select('b'); await screen.findByText('Student b');
  await act(async () => finish(memberProgress('a')));
  expect(screen.queryByText('Student a')).not.toBeInTheDocument(); expect(screen.getByText('Student b')).toBeInTheDocument();
})
