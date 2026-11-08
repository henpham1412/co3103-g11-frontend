## **4.4 Learning Progress APIs**

Progress is lesson-based in the MVP. Only explicit Lesson completion marks contribute to lesson completion progress. Viewing a lesson updates last-visit history but does not automatically mark the lesson complete. Quiz and Assignment status is derived from assessment records.

### **4.4.1 Summary Table**

| Method | Endpoint | Purpose | Role |
| ----- | ----- | ----- | ----- |
| GET | /me/classes | List classes and pending requests for the current Student | Student |
| GET | /classes/{classId}/progress | Retrieve class outline and lesson-based progress | Active Student member |
| PUT | /classes/{classId}/lessons/{lessonId}/completion | Mark a Lesson complete | Active Student member |
| DELETE | /classes/{classId}/lessons/{lessonId}/completion | Undo a Lesson completion mark | Active Student member |
| PUT | /classes/{classId}/last-visit | Record the latest visited Lesson | Active Student member |
| GET | /classes/{classId}/resume-target | Determine where the Student should resume | Active Student member |
| GET | /me/assessment-history | View quiz attempts, submissions, grades, and feedback | Student |
| GET | /tutor/classes/{classId}/progress | List active members and their progress | Owning Tutor |
| GET | /tutor/classes/{classId}/members/{classMemberId}/progress | View an individual member's progress and mastery summary | Owning Tutor |

### **4.4.2 View My Classes**

GET /me/classes?status=ACTIVE\&page=1\&size=20 returns active memberships and the Student's pending join requests.

Active class entries include class information, Tutor, ACTIVE or ARCHIVED state as applicable, lesson-based progress, and derived status IN\_PROGRESS or COMPLETED.

Archived classes may appear as archived/read-only history according to the caller's membership. Pending requests do not count as active classes.

### **4.4.3 View Class Progress**

GET /classes/{classId}/progress returns the visible, accessible chapter/lesson outline, each lesson's completion mark, assessment statuses derived from QuizAttempt/Submission records, counts of completed and eligible lessons, progress percentage, derived class status, and the resume target.

**Example Response**

{  
  "class\_id": "9e496d33-8b5e-45aa-88cf-40fc6a7a0931",  
  "completed\_lessons": 3,  
  "eligible\_lessons": 8,  
  "progress\_percentage": 37.5,  
  "status": "IN\_PROGRESS",  
  "chapters": \[\],  
  "resume\_target": {  
    "target\_type": "LESSON",  
    "target\_id": "65a11d55-a23c-4a65-8ccb-76b7b7c12345"  
  }  
}

The progress denominator includes visible, accessible Lessons eligible for progress calculation. Hidden or unavailable Lessons are excluded while inaccessible.

A class is COMPLETED only when at least one eligible Lesson exists and every eligible Lesson has been marked complete.

### **4.4.4 Mark or Unmark a Lesson Complete**

PUT /classes/{classId}/lessons/{lessonId}/completion creates the completion mark. Request body is empty. Return 200 OK or 204 No Content after recalculating displayed progress.

DELETE /classes/{classId}/lessons/{lessonId}/completion removes the mark and recalculates progress.

Only an active Student member may use these endpoints for visible Lessons in an active class. This API does not mark a Quiz, Assignment, Material, or Activity as complete.

**Important Error Cases**

* 403 MEMBERSHIP\_REQUIRED  
* 404 LESSON\_NOT\_FOUND  
* 409 LESSON\_NOT\_ACCESSIBLE

### **4.4.5 Record Last Visit and Resume Learning**

PUT /classes/{classId}/last-visit records the latest visited Lesson.

**Request Body**

{  
  "lesson\_id": "65a11d55-a23c-4a65-8ccb-76b7b7c12345"  
}

The system upserts the single LastVisit row for the class membership.

GET /classes/{classId}/resume-target returns the selected target according to this priority:

1. An available Quiz attempt in progress.  
2. The most recently visited Lesson, if it remains visible and accessible.  
3. The first incomplete visible Lesson in content-tree order.  
4. If no incomplete eligible Lesson remains, return the class outline or no unfinished target.  
   If the Student needs to continue an Assignment, the response points to its containing Lesson. Resuming does not create a completion mark.  
   **Example Response — Quiz Attempt in Progress**  
   {  
     "target\_type": "QUIZ\_ATTEMPT",  
     "target\_id": "ff6b2f66-91be-46f2-9d0c-6014c10be721",  
     "reason": "IN\_PROGRESS\_ATTEMPT"  
   }  
   **Example Response — No Unfinished Target**  
   {  
     "target\_type": "CLASS\_OUTLINE",  
     "target\_id": "9e496d33-8b5e-45aa-88cf-40fc6a7a0931",  
     "reason": "NO\_UNFINISHED\_TARGET"  
   }

### **4.4.6 View Assessment History**

GET /me/assessment-history?page=1\&size=20\&class\_id={classId}\&type=QUIZ lists assessments in the caller's permitted history, including quiz attempts and assignment submissions, status, score/final grade, and feedback where applicable.

Student history is filtered to the caller. A Student must not read another Student's private assessment history.

### **4.4.7 Tutor Progress Views**

GET /tutor/classes/{classId}/progress returns progress summaries for ACTIVE members of a class owned by the caller.

GET /tutor/classes/{classId}/members/{classMemberId}/progress returns the member's lesson completion marks, progress summary, assessment outcome summaries, and current mastery per SkillTopic where Adaptive Learning data exists.

Former members' records remain stored but are not included in the active-member list.

**Important Error Cases**

* 403 FORBIDDEN  
* 404 CLASS\_OR\_MEMBER\_NOT\_FOUND