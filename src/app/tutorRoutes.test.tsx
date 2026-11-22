import { isValidElement } from 'react'
import { matchRoutes, Navigate } from 'react-router-dom'
import { afterAll, describe, expect, it } from 'vitest'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import TutorRoute from '@/features/tutor-classes/TutorRoute'
import TutorDashboardPage from '@/features/tutor-classes/pages/TutorDashboardPage'
import TutorClassManagementPage from '@/features/tutor-classes/pages/TutorClassManagementPage'
import TutorClassDetailPage from '@/features/tutor-classes/pages/TutorClassDetailPage'
import TutorContentManagementPage from '@/features/tutor-classes/pages/TutorContentManagementPage'
import TutorQuizPage from '@/features/tutor-classes/pages/TutorQuizPage'
import TutorAssignmentPage from '@/features/tutor-classes/pages/TutorAssignmentPage'
import TutorAssignmentGradingPage from '@/features/tutor-classes/pages/TutorAssignmentGradingPage'
import StudentLessonPage from '@/features/classes/pages/StudentLessonPage'
import ClassActivityPage from '@/features/classes/pages/ClassActivityPage'
import AssessmentHistoryPage from '@/features/classes/pages/AssessmentHistoryPage'
import DiscussionBoardPage from '@/features/discussions/pages/DiscussionBoardPage'
import DiscussionHubPage from '@/features/discussions/pages/DiscussionHubPage'
import DiscussionThreadPage from '@/features/discussions/pages/DiscussionThreadPage'
import NotificationsPage from '@/features/notifications/pages/NotificationsPage'
import { resolveNotificationTarget } from '@/features/notifications/utils/notificationTarget'
import { hasAppRoute, router } from './router'

afterAll(() => router.dispose())

describe('merged FE-4/FE-5/FE-6/FE-7/FE-10/FE-11 routes', () => {
  it.each([
    ['/tutor', Navigate],
    ['/tutor/dashboard', TutorDashboardPage],
    ['/tutor/classes', TutorClassManagementPage],
    ['/tutor/classes/class-123', TutorClassDetailPage],
    ['/tutor/classes/class-123/content', TutorContentManagementPage],
    ['/tutor/classes/class-123/content/quiz/new', TutorQuizPage],
    ['/tutor/classes/class-123/content/quiz/activity-123', TutorQuizPage],
    ['/tutor/classes/class-123/content/assignment/new', TutorAssignmentPage],
    ['/tutor/classes/class-123/content/assignment/activity-123', TutorAssignmentPage],
    ['/tutor/classes/class-123/content/assignment/activity-123/grade', TutorAssignmentGradingPage],
    ['/tutor/discussion', DiscussionHubPage],
    ['/tutor/notifications', NotificationsPage],
    ['/tutor/classes/class-123/discussions', DiscussionBoardPage],
    ['/tutor/classes/class-123/discussions/discussion-123', DiscussionThreadPage],
  ])('keeps %s under the shared authentication and tutor guards', (path, component) => {
    const matches = matchRoutes(router.routes, path as string)!
    const types = matches.map(({ route }) => isValidElement(route.element) ? route.element.type : null)
    expect(types.filter((type) => type === ProtectedRoute)).toHaveLength(1)
    expect(types.filter((type) => type === TutorRoute)).toHaveLength(1)
    expect(types.at(-1)).toBe(component)
  })

  it.each([
    ['/classes/class-123/lessons/lesson-123', StudentLessonPage],
    ['/classes/class-123/lessons/lesson-123/activities/activity-123', ClassActivityPage],
    ['/assessment-history', AssessmentHistoryPage],
    ['/discussion', DiscussionHubPage],
    ['/notifications', NotificationsPage],
    ['/classes/class-123/discussions', DiscussionBoardPage],
    ['/classes/class-123/discussions/discussion-123', DiscussionThreadPage],
  ])('keeps %s on the existing student route', (path, component) => {
    const matches = matchRoutes(router.routes, path as string)!
    const types = matches.map(({ route }) => isValidElement(route.element) ? route.element.type : null)
    expect(types).toContain(ProtectedRoute)
    expect(types).not.toContain(TutorRoute)
    expect(types.at(-1)).toBe(component)
  })
})

describe('FE-11 real-router target resolution', () => {
  it('excludes the wildcard catch-all route and uses the direct FE-7 grading route once mounted', () => {
    const gradingPath = '/tutor/classes/class-123/content/assignment/act-42/grade'
    expect(hasAppRoute(gradingPath)).toBe(true)
    expect(hasAppRoute('/unknown-route-that-matches-wildcard')).toBe(false)

    expect(resolveNotificationTarget(gradingPath, hasAppRoute)).toEqual({
      href: gradingPath,
      isFallback: false,
    })
  })

  it('recognizes valid registered routes and keeps unsafe URLs rejected', () => {
    expect(hasAppRoute('/classes/class-123')).toBe(true)
    expect(hasAppRoute('/tutor/classes/class-123/content')).toBe(true)
    expect(hasAppRoute('/notifications')).toBe(true)
    expect(hasAppRoute('/tutor/notifications')).toBe(true)

    expect(resolveNotificationTarget('/classes/class-123', hasAppRoute)).toEqual({
      href: '/classes/class-123',
      isFallback: false,
    })
    expect(resolveNotificationTarget('https://evil.example/phish', hasAppRoute)).toBeNull()
    expect(resolveNotificationTarget('//evil.example/path', hasAppRoute)).toBeNull()
  })
})
