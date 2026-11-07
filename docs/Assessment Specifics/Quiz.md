... part of the full API specification ...

### **3.2.6 Learning Activities and Visibility**

An Activity represents the content placement for a Quiz or Assignment. The API must create the Activity and its matching assessment configuration as one logical operation so that an Activity is not left without a corresponding configuration.

Create a Quiz Activity using POST /lessons/{lessonId}/activities.

**Example Request**

{  
  "activity\_type": "QUIZ",  
  "title": "Java Basics Quiz",  
  "description": "Check understanding of the lesson",  
  "sequence\_order": 2,  
  "status": "PUBLISHED",  
  "quiz": {  
    "time\_limit\_minutes": 20,  
    "attempts\_allowed": 1,  
    "grading\_method": "HIGHEST",  
    "opening\_time": null,  
    "deadline": "2026-11-30T23:59:00Z",  
    "required\_score": 70,  
    "questions": \[  
      {  
        "question\_type": "MCQ\_SINGLE",  
        "content": "Which keyword declares a class in Java?",  
        "points\_awarded": 1,  
        "points\_deducted": 0,  
        "order\_index": 0,  
        "options": \[  
          {"content": "class", "is\_correct": true, "order\_index": 0},  
          {"content": "define", "is\_correct": false, "order\_index": 1}  
        \]  
      }  
    \]  
  }  
}

Create an Assignment Activity by providing activity\_type: ASSIGNMENT and an assignment configuration with required deadline, optional opening\_time, allow\_late, optional allowed\_file\_types, and optional max\_file\_size\_mb.

PATCH /activities/{activityId} updates shared Activity fields such as title, description, order, or visibility. Assessment-specific settings are updated through Section 4 endpoints.

The referenced type and configuration must match: QUIZ requires exactly one Quiz configuration; ASSIGNMENT requires exactly one Assignment configuration.

DELETE /activities/{activityId} follows the same data-retention restrictions as other learning content. Where an activity has dependent attempts, submissions, grades, or required history, the system must reject physical deletion and the Tutor should hide it.

Visibility can be changed using PATCH /activities/{activityId} with status: PUBLISHED or status: HIDDEN. The same values apply to Chapter, Lesson, and Material. If a parent is hidden, descendants remain inaccessible to students regardless of their individual status.

**Important Error Cases**

* 400 VALIDATION\_ERROR  
* 403 FORBIDDEN  
* 404 ACTIVITY\_NOT\_FOUND  
* 409 ASSESSMENT\_CONFIGURATION\_MISMATCH  
* 409 CONTENT\_HAS\_DEPENDENT\_LEARNING\_DATA

# **4\. ASSESSMENT & PROGRESS APIs**

These endpoints are served by an LMS instance. Assessment records are scoped to the correct ClassMember. Protected assessment and progress operations require an ACTIVE membership and accessible published content, unless a Tutor operation is explicitly specified.

## **4.1 Assessment Configuration APIs**

### **4.1.1 Summary Table**

| Method | Endpoint | Purpose | Role |
| ----- | ----- | ----- | ----- |
| GET | /activities/{activityId}/quiz | Retrieve quiz configuration visible to caller | Owning Tutor or eligible Student |
| PATCH | /activities/{activityId}/quiz | Update quiz settings | Owning Tutor |
| POST | /activities/{activityId}/questions | Add a quiz question | Owning Tutor |
| PATCH | /questions/{questionId} | Update a question/options | Owning Tutor, subject to quiz-locking rules |
| DELETE | /questions/{questionId} | Delete a question when allowed | Owning Tutor |
| GET | /activities/{activityId}/assignment | Retrieve assignment configuration | Owning Tutor or eligible Student |
| PATCH | /activities/{activityId}/assignment | Update assignment settings | Owning Tutor |
| POST | /assignments/{assignmentId}/attachments | Upload a reference attachment | Owning Tutor |
| DELETE | /assignment-attachments/{attachmentId} | Delete a reference attachment when allowed | Owning Tutor |

Configuration routes use the Activity placement model from Section 3\. A Quiz or Assignment's title, description, lesson placement, ordering, and visibility are maintained by Activity. This section manages assessment-specific settings and records.

### **4.1.2 Update Quiz Settings**

**Method:** PATCH  
**Endpoint:** /activities/{activityId}/quiz  
**Role:** Owning Tutor.

The request accepts any allowed subset of the following fields.

{  
  "time\_limit\_minutes": 20,  
  "attempts\_allowed": 2,  
  "grading\_method": "HIGHEST",  
  "opening\_time": null,  
  "deadline": "2026-11-30T23:59:00Z",  
  "required\_score": 70  
}

**Rules**

* time\_limit\_minutes is required in the stored configuration and must be greater than zero.  
* deadline is required.  
* opening\_time, when supplied, must be earlier than deadline.  
* attempts\_allowed must be at least 1\.  
* grading\_method is HIGHEST, AVERAGE, or LAST.  
* required\_score, if supplied, is a percentage from 0 to 100\.  
* A quiz must contain at least one valid question before it can be published or attempted.  
* If students have attempted the quiz, question edits must comply with the quiz-locking rules in DOC-01. Changes affecting grading may require confirmation and regrading of submitted attempts.  
  **Important Error Cases**  
* 400 VALIDATION\_ERROR  
* 403 FORBIDDEN  
* 404 QUIZ\_NOT\_FOUND  
* 409 QUIZ\_ALREADY\_ATTEMPTED\_RESTRICTED\_EDIT

### **4.1.3 Add or Update Questions**

**Endpoint:** POST /activities/{activityId}/questions  
**Role:** Owning Tutor.

**Example Request**

{  
  "question\_type": "MCQ\_SINGLE",  
  "content": "Which keyword declares a class in Java?",  
  "points\_awarded": 1,  
  "points\_deducted": 0,  
  "order\_index": 0,  
  "options": \[  
    {"content": "class", "is\_correct": true, "order\_index": 0},  
    {"content": "define", "is\_correct": false, "order\_index": 1}  
  \],  
  "skill\_topic\_ids": \[\]  
}

Supported question types are MCQ\_SINGLE, MCQ\_MULTIPLE, and TRUE\_FALSE.

Each question must have non-empty content, at least one correct answer, and specified points. Multiple-choice questions must have at least two options. For MCQ\_SINGLE and TRUE\_FALSE, the answer key must identify exactly one correct option. MCQ\_MULTIPLE may identify multiple correct options.

points\_awarded and points\_deducted are raw quiz points, not percentages. Final attempt scores use the 0–100 percentage scale.

PATCH /questions/{questionId} updates permitted fields/options. Once a quiz has been attempted, deleting questions, removing existing answer options, or changing question type is restricted by the agreed quiz-locking rules.

skill\_topic\_ids is optional. When supplied, it associates the question with existing SkillTopic records in the same class through QuestionSkillTopic.

**Important Error Cases**

* 400 INVALID\_QUESTION  
* 403 FORBIDDEN  
* 404 QUESTION\_NOT\_FOUND  
* 409 QUESTION\_EDIT\_LOCKED

### **4.1.4 Update Assignment and Reference Attachments**

**Method:** PATCH  
**Endpoint:** /activities/{activityId}/assignment  
**Role:** Owning Tutor.

**Example Request**

{  
  "opening\_time": null,  
  "deadline": "2026-11-30T23:59:00Z",  
  "allow\_late": false,  
  "allowed\_file\_types": \["pdf", "docx"\],  
  "max\_file\_size\_mb": 20  
}

deadline is required. opening\_time, when supplied, must be earlier than the deadline. A configured file-size limit must be greater than zero. allowed\_file\_types and max\_file\_size\_mb may be configured according to assignment requirements.

Reference attachments are uploaded using multipart/form-data with a file field. The server validates size and media type and stores attachment metadata.

**Important Error Cases**

* 400 VALIDATION\_ERROR  
* 403 FORBIDDEN  
* 404 ASSIGNMENT\_NOT\_FOUND  
* 413 FILE\_TOO\_LARGE  
* 415 UNSUPPORTED\_MEDIA\_TYPE

## **4.2 Quiz Attempt APIs**

### **4.2.1 Summary Table**

| Method | Endpoint | Purpose | Role |
| ----- | ----- | ----- | ----- |
| POST | /quizzes/{quizId}/attempts | Start an attempt or return the eligible in-progress attempt to resume | Student with active membership |
| GET | /quiz-attempts/{attemptId} | Retrieve attempt state/questions and remaining time | Owner Student; owning Tutor only where permitted |
| PUT | /quiz-attempts/{attemptId}/answers/{questionId} | Save or replace the selected answer | Owner Student while attempt is in progress |
| DELETE | /quiz-attempts/{attemptId}/answers/{questionId} | Clear a saved answer while the attempt is in progress | Owner Student |
| POST | /quiz-attempts/{attemptId}/submit | Submit an attempt | Owner Student |
| GET | /quiz-attempts/{attemptId}/result | View a submitted attempt result | Owner Student; owning Tutor where permitted |
| GET | /quizzes/{quizId}/attempts | List attempts for grading/monitoring | Owning Tutor |

### **4.2.2 Start or Resume a Quiz Attempt**

**Method:** POST  
**Endpoint:** /quizzes/{quizId}/attempts  
**Role:** Student with an ACTIVE membership in the class.  
**Request body:** None.

The server checks that the Quiz Activity and its parent hierarchy are PUBLISHED and accessible, the class is active for new attempts, the opening time has passed, the deadline has not passed, and the student's attempt limit permits a new attempt.

If an eligible in-progress attempt already exists, the API returns that attempt for resumption rather than creating a duplicate.

**Response:** 201 Created for a new attempt; 200 OK when resuming.

{  
  "attempt\_id": "ff6b2f66-91be-46f2-9d0c-6014c10be721",  
  "quiz\_id": "f6f7b926-23d0-45d8-8c33-bd42a49a77c0",  
  "attempt\_number": 1,  
  "status": "IN\_PROGRESS",  
  "started\_at": "2026-10-14T08:30:00Z",  
  "end\_at": "2026-10-14T08:50:00Z",  
  "remaining\_seconds": 1200,  
  "questions": \[\]  
}

The server calculates end\_at from the attempt start time plus the time limit, or the quiz deadline, whichever occurs first. The response must not include answer keys before submission.

**Important Error Cases**

* 403 MEMBERSHIP\_REQUIRED  
* 404 QUIZ\_NOT\_FOUND  
* 409 QUIZ\_NOT\_AVAILABLE  
* 409 ATTEMPT\_LIMIT\_REACHED

### **4.2.3 Save an Answer**

**Method:** PUT  
**Endpoint:** /quiz-attempts/{attemptId}/answers/{questionId}  
**Role:** Owner Student; attempt must be IN\_PROGRESS.

**Request Body for Option-Based Questions**

{  
  "selected\_option\_ids": \[  
    "8f0e9c62-55a2-4a18-9329-880cfa7fbd3d"  
  \]  
}

The server validates that the question belongs to the attempt's quiz and every selected option belongs to that question. Single-choice and true/false questions accept one selected option; multiple-choice questions may accept multiple options.

To clear an answer, use DELETE /quiz-attempts/{attemptId}/answers/{questionId} before the attempt ends.

**Important Error Cases**

* 400 INVALID\_ANSWER  
* 403 FORBIDDEN  
* 404 ATTEMPT\_OR\_QUESTION\_NOT\_FOUND  
* 409 ATTEMPT\_ALREADY\_SUBMITTED\_OR\_EXPIRED

### **4.2.4 Submit an Attempt**

**Method:** POST  
**Endpoint:** /quiz-attempts/{attemptId}/submit  
**Role:** Owner Student.  
**Request body:** None.

The server grades saved answers against the current answer key, stores the submitted attempt and its score/timestamps, and returns the result. Unanswered questions contribute zero points. If the end time is reached first, the system automatically submits the saved answers. Automatic submission may be performed by the server without a client call.

**Response — 200 OK**

{  
  "attempt\_id": "ff6b2f66-91be-46f2-9d0c-6014c10be721",  
  "status": "SUBMITTED",  
  "auto\_submitted": false,  
  "score": 85.00,  
  "required\_score": 70,  
  "passed": true,  
  "submitted\_at": "2026-10-14T08:48:00Z"  
}

score is a percentage from 0 to 100 rounded to two decimal places. passed is omitted or null when no required\_score is set. The final quiz grade across attempts is derived according to grading\_method (HIGHEST, AVERAGE, or LAST).

**Important Error Cases**

* 403 FORBIDDEN  
* 404 ATTEMPT\_NOT\_FOUND  
* 409 ATTEMPT\_ALREADY\_SUBMITTED  
  A repeated submit request should return the existing submitted result or a consistent conflict response. The implementation must not grade the same attempt twice.