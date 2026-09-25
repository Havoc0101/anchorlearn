"""Regression checks for the frontend fields added to B's SQLite storage."""
import copy
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tasks


def payload():
    return {'request_id': 'review-request-001', 'confirmed': True, 'review_id': 'review-001', 'recording_id': None,
            'tasks': [{'client_task_id': 'review-001:task:1', 'title': '核对后的报告', 'due_date': None,
                       'requirements': '提交 PDF；这是用户补充', 'source_quote': '请交报告。',
                       'source_kind': 'user-context', 'first_step': '打开报告文档'}]}


class ReviewContract(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original = tasks.DB_PATH
        tasks.DB_PATH = Path(self.directory.name) / 'tasks.db'

    def tearDown(self):
        tasks.DB_PATH = self.original
        self.directory.cleanup()

    def test_all_review_fields_roundtrip_and_new_request_does_not_duplicate_draft(self):
        body = payload()
        first = tasks.confirm_tasks(body)
        saved = first['tasks'][0]
        for key, value in body['tasks'][0].items():
            self.assertEqual(saved[key], value)
        self.assertEqual(saved['status'], 'pending')  # Confirmed is not completed.
        body['request_id'] = 'another-request'
        self.assertEqual(tasks.confirm_tasks(body)['tasks'], first['tasks'])
        self.assertEqual(tasks.list_tasks()['tasks'], first['tasks'])

    def test_changed_requirements_and_source_cannot_reuse_request(self):
        body = payload()
        tasks.confirm_tasks(body)
        for field, value in [('requirements', '新要求'), ('source_kind', 'transcript')]:
            changed = copy.deepcopy(body)
            changed['tasks'][0][field] = value
            with self.assertRaises(tasks.Conflict):
                tasks.confirm_tasks(changed)
        self.assertEqual(len(tasks.list_tasks()['tasks']), 1)

    def test_later_conflict_rolls_back_earlier_insert_in_batch(self):
        body = payload()
        first = tasks.confirm_tasks(body)
        changed = copy.deepcopy(body)
        changed['request_id'] = 'new-request-002'
        changed['tasks'][0]['requirements'] = '不允许覆盖'
        new = dict(body['tasks'][0], client_task_id='review-001:task:2')
        changed['tasks'].insert(0, new)
        with self.assertRaises(tasks.Conflict):
            tasks.confirm_tasks(changed)
        self.assertEqual(tasks.list_tasks()['tasks'], first['tasks'])
        changed['tasks'] = [new]
        self.assertEqual(len(tasks.confirm_tasks(changed)['tasks']), 1)

    def test_invalid_metadata_never_silently_disappears(self):
        for mutate in [lambda b: b.pop('review_id'), lambda b: b.update(confirmed=False),
                       lambda b: b['tasks'][0].pop('requirements'),
                       lambda b: b['tasks'][0].update(source_kind='teacher-guessed'),
                       lambda b: b['tasks'].append(copy.deepcopy(b['tasks'][0])),
                       lambda b: b['tasks'][0].update(requirements='字' * 4001),
                       lambda b: b['tasks'][0].update(due_date='2026-02-30')]:
            body = payload()
            mutate(body)
            with self.assertRaises(ValueError):
                tasks.confirm_tasks(body)
        self.assertEqual(tasks.list_tasks()['tasks'], [])

    def test_simultaneous_same_request_is_atomic(self):
        tasks.list_tasks()  # Initialize schema before competing transactions.
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(tasks.confirm_tasks, [payload(), payload()]))
        self.assertEqual(results[0], results[1])
        self.assertEqual(len(tasks.list_tasks()['tasks']), 1)

    def test_existing_database_without_frontend_metadata_stays_readable(self):
        old = {key: value for key, value in payload()['tasks'][0].items()
               if key in ('title', 'due_date', 'first_step', 'source_quote')}
        body = {'request_id': 'legacy-request', 'confirmed': True, 'tasks': [old]}
        first = tasks.confirm_tasks(body)
        self.assertNotIn('source_kind', first['tasks'][0])
        self.assertEqual(tasks.confirm_tasks(body), first)
        self.assertEqual(tasks.list_tasks()['tasks'], first['tasks'])


if __name__ == '__main__':
    unittest.main()
