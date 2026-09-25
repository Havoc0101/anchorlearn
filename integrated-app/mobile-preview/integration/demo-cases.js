/* Explicit UI fixtures, never a fallback for a failed model request. */
(function (root) {
  'use strict';
  const cases = {
    multiple: {
      title: '三项课堂任务', date: '2026-09-25',
      text: '请在10月2日交实验报告。10月5日前完成五道练习题。课后阅读第三章，没有截止时间。',
      result: {
        reading_card: '报告、练习和阅读三项任务；阅读没有明确截止日期。',
        key_points: ['实验报告与练习题的截止日期不同。', '阅读第三章没有明确截止时间。'],
        tasks: [
          { title: '提交实验报告', due_date: '2026-10-02', first_step: '打开实验记录', source_quote: '请在10月2日交实验报告。' },
          { title: '完成五道练习题', due_date: '2026-10-05', first_step: '打开第一道练习题', source_quote: '10月5日前完成五道练习题。' },
          { title: '阅读第三章', due_date: null, first_step: '打开第三章第一页', source_quote: '课后阅读第三章，没有截止时间。' },
        ], clarifications: [], status: 'draft', needs_confirmation: true,
      },
    },
    ambiguous: {
      title: '组别需要确认', date: '2026-09-25', text: '第二组下周一交报告，第一组不用交。',
      result: {
        reading_card: '不同组的报告要求不同，需要先确认你属于哪组。',
        key_points: ['第二组需要交报告，第一组不用交。'], tasks: [],
        clarifications: [{ question: '你属于第一组还是第二组？', source_quote: '第二组下周一交报告，第一组不用交。' }],
        status: 'needs_clarification', needs_confirmation: true,
      },
    },
    empty: {
      title: '没有待办的课堂讨论', date: '2026-09-25', text: '今天介绍了海洋环流，没有布置课后作业。',
      result: {
        reading_card: '课堂介绍海洋环流，没有布置课后作业。', key_points: ['本次内容是海洋环流。'],
        tasks: [], clarifications: [], status: 'no_tasks', needs_confirmation: false,
      },
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = cases;
  else root.AnchorReviewExamples = cases;
})(typeof window !== 'undefined' ? window : globalThis);
