 6. **UC 5.6. Mark Item as Complete**

  **Actor:** Student

  **Goal:** Mark a lesson as complete or undo its completion mark.

  **Pre-condition:** Student is logged in, is an Active member of the class, and is viewing a visible lesson in a class where completion marking is allowed (BR-5.4, BR-5.5).

  **Trigger:** Student wants to mark a lesson as complete or undo the mark.

  **Main Flow:**

1. Student marks the lesson as complete.  
2. System checks whether completion marking is allowed (BR-5.4, BR-5.5).  
3. System stores a completion mark for the lesson with the current timestamp.  
4. System updates the displayed lesson, chapter, and class progress (BR-5.6).  
5. If all visible lessons eligible for progress calculation are complete, System displays the class status as Completed.  
   **Exception Flow:**  
* 1a. The lesson is already marked as complete and the student chooses to undo the mark. System removes the completion mark and updates progress. If the class was Completed, its status may return to In progress.  
* 2a. Marking is not allowed because the lesson is hidden or unavailable, the class is archived, or the student is no longer an Active member. System explains the restriction and makes no changes.  
  **Post-condition:** The lesson completion mark is stored or removed, and the displayed progress and class status are recalculated accordingly. Quiz and Assignment completion statuses are determined from their corresponding assessment records, not from lesson completion marks.  
  7.  **UC 5.7. Resume Learning**

  **Actor:** Student

  **Goal:** Resume learning in a class without manually searching for the last learning location.

  **Pre-condition:** Student is logged in and is an Active member of the class.

  **Trigger:** Student chooses to continue learning in a class.

  **Main Flow:**

1. Student chooses to continue the class.  
2. System determines the resume target according to BR-5.7.  
3. If a Quiz attempt is in progress, System opens the Quiz and resumes the existing attempt.  
4. Otherwise, System opens the most recently visited eligible lesson, or the next incomplete visible lesson according to BR-5.7.  
5. If the student needs to continue an Assignment, System opens the lesson containing that Assignment, from which the student can access the Assignment.  
   **Exception Flow:**  
* 2a. No eligible lesson or in-progress Quiz remains. System informs the student that no unfinished learning target is available and displays the class outline.  
* 2b. The class has no visible lessons. System displays an empty-state message.  
* 3a. The in-progress Quiz attempt is no longer available. System recalculates the resume target and continues with the next eligible target.  
* 4a. The target lesson becomes unavailable. System recalculates the target without using the unavailable lesson.  
  **Post-condition:** The appropriate learning target is displayed. The system may update the last-visited lesson record when a lesson is opened. Resuming learning does not create or modify a lesson completion mark by itself.



  **BR-5.5 — Lesson Completion Marks**  
* Completion marks apply only to Lessons. Materials, Quizzes, and Assignments do not have separate completion marks.  
* Students may mark or unmark a Lesson as complete, subject to the access and class-status rules in BR-5.4.  
* Each completion mark records its timestamp.  
* Quiz and Assignment statuses are derived from their corresponding assessment records, such as QuizAttempt and Submission. Submitting or grading an assessment does not automatically create a Lesson completion mark.  
* Completion marks for hidden or unavailable Lessons are excluded from current progress calculations while those Lessons are inaccessible. Their stored records are retained unless an explicit data-retention rule requires otherwise.

* **BR-5.8 Tutor view:** A tutor sees progress for Active members of classes they teach. Former members' data is retained but not listed.