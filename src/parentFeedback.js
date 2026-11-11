export const parentFeedbackDefaults = {
  name: 'Parent Feedback',
  language: 'te',
  intro: 'Namaste {{parent_name}} garu! I am calling from Vignan, Duvvada, Visakhapatnam.',
};

export const parentFeedbackQuestions = [
  ["Overall, how satisfied are you with the student's experience at Vignan? Give a number from 1 to 5.", 'rating'],
  ['How would you rate the quality of teaching? (1 to 5)', 'rating'],
  ['Do you feel your child is making good academic progress?', 'yes_no'],
  ['Are you satisfied with how teachers and staff communicate with you?', 'yes_no'],
  ['How do you feel about safety and discipline on campus? (1 to 5)', 'rating'],
  ['Are the transport, hostel or canteen services working well for you?', 'text'],
  ['What do you like most about Vignan?', 'text'],
  ['What is one thing we should improve?', 'text'],
  ['Would you recommend Vignan to other parents?', 'yes_no'],
  ['Would you like someone from the school to call you back about any concern?', 'yes_no'],
].map(([question_text, answer_type], index) => ({question_text, answer_type, choices: [], required: true, capture_key: ['overall_satisfaction','teaching_quality','academic_progress','communication_satisfaction','safety_discipline','services_feedback','like_most','improvement_suggestion','would_recommend','callback_request'][index]}));
