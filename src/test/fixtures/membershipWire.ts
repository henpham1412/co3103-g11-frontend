// Literal StudentClassPageResponse JSON fields from the LMS endpoint. These
// fixtures deliberately use membership_status, independently of the UI model.
export const studentClassWire = {
  class_id: 'class-1',
  class_code: 'CS101',
  title: 'Programming Foundations',
  description: null,
  prerequisites_description: null,
  thumbnail_url: null,
  enrollment_policy: 'OPEN',
  class_status: 'ACTIVE',
  membership_status: 'ACTIVE',
  tutor: { user_id: 'tutor-1', full_name: 'Test Tutor', email: 'tutor@example.test' },
  progress: { completed_lessons: 0, eligible_lessons: 1, progress_percentage: 0, status: 'IN_PROGRESS' },
}

export function membershipPage(
  items: { class_id: string; membership_status: string }[] = [],
  page = 1,
  total = items.length,
) {
  return {
    items: items.map((item) => ({
      ...studentClassWire,
      ...item,
      progress: item.membership_status === 'PENDING' ? null : studentClassWire.progress,
    })),
    page,
    size: 20,
    total_items: total,
    total_pages: Math.ceil(total / 20),
  }
}
