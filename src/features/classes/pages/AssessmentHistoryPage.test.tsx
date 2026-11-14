import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HttpResponse, http } from 'msw'
import { beforeEach, expect, it, vi } from 'vitest'
import { server } from '@/test/server'
import AssessmentHistoryPage from './AssessmentHistoryPage'
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ state: { status: 'authenticated', user: { fullName: 'Student' } }, logout: vi.fn() }) }))
const endpoint = 'http://localhost:8081/api/v1/me/assessment-history'
function row(id: number, status = 'SUBMITTED', score: number | null = 50) { return { attempt_id: `attempt-${id}`, class_id: 'class-123', activity_id: 'activity-1', activity_title: `Quiz ${id}`, attempt_number: id, type: 'QUIZ', status, score, started_at: '2026-11-01T00:00:00Z', submitted_at: status === 'IN_PROGRESS' ? null : '2026-11-01T01:00:00Z', feedback: 'Review topic' } }
function show() { return render(<MemoryRouter><AssessmentHistoryPage /></MemoryRouter>) }
beforeEach(() => { server.use(http.get(endpoint, () => HttpResponse.json({ items: [], page: 1, size: 20, total_items: 0, total_pages: 0 }))) })
it('uses canonical statuses and distinguishes pending grades and actual zero scores', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ items: [row(1, 'IN_PROGRESS', null), row(2, 'SUBMITTED', null), row(3, 'SUBMITTED', 0)], page: 1, size: 20, total_items: 3, total_pages: 1 })));
  show(); expect(await screen.findByText('In progress')).toBeInTheDocument();
  expect(screen.getByText('Submitted · awaiting grade')).toBeInTheDocument(); expect(screen.getByText('Submitted · graded')).toBeInTheDocument();
  expect(screen.getByText('0%')).toBeInTheDocument(); expect(screen.getAllByText('Review topic')).toHaveLength(3);
})
it('requests and renders later server pages instead of truncating history to twenty records', async () => {
  const requests: string[] = [];
  server.use(http.get(endpoint, ({ request }) => { const url = new URL(request.url); requests.push(url.search); const page = Number(url.searchParams.get('page')); return HttpResponse.json({ items: [row(page === 1 ? 1 : 21)], page, size: 20, total_items: 21, total_pages: 2 }) }));
  show(); await screen.findByText('Quiz 1'); fireEvent.click(screen.getByTitle('2'));
  expect(await screen.findByText('Quiz 21')).toBeInTheDocument(); expect(screen.queryByText('Quiz 1')).not.toBeInTheDocument();
  expect(requests).toEqual(['?page=1&size=20', '?page=2&size=20']);
})
it('renders empty history independently from errors and supports retry', async () => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code: 'UNAVAILABLE', message: 'Please retry', details: [] }, { status: 503 })));
  show(); expect(await screen.findByText('Could not load assessment history')).toBeInTheDocument();
  expect(screen.queryByText('No assessment history on this page.')).not.toBeInTheDocument();
  server.use(http.get(endpoint, () => HttpResponse.json({ items: [], page: 1, size: 20, total_items: 0, total_pages: 0 })));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText('No assessment history on this page.')).toBeInTheDocument());
})
it('offers recovery when a later page becomes empty', async () => {
  server.use(http.get(endpoint, ({ request }) => { const page = Number(new URL(request.url).searchParams.get('page')); return HttpResponse.json({ items: page === 1 ? [row(1)] : [], page, size: 20, total_items: page === 1 ? 21 : 1, total_pages: page === 1 ? 2 : 1 }) }));
  show(); await screen.findByText('Quiz 1'); fireEvent.click(screen.getByTitle('2')); await screen.findByText('No assessment history on this page.');
  fireEvent.click(screen.getByRole('button', { name: 'Back to first page' })); expect(await screen.findByText('Quiz 1')).toBeInTheDocument();
})
