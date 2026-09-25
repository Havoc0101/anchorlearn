import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import tasks


class PersistenceCheck(unittest.TestCase):
    def test_restart_retry_conflict_and_validation(self):
        item = {'title': '交报告', 'due_date': '2026-09-28', 'first_step': '打开文档', 'source_quote': '下周一交报告。'}
        payload = {'request_id': 'test-request-001', 'confirmed': True, 'tasks': [item, dict(item, title='准备问题', due_date=None)]}
        old = tasks.DB_PATH
        with tempfile.TemporaryDirectory() as directory:
            tasks.DB_PATH = Path(directory) / 'tasks.db'
            try:
                # Separate process writes, exits, then a new process reads the same DB.
                script = 'import tasks,json,sys; from pathlib import Path; tasks.DB_PATH=Path(sys.argv[1]); print(json.dumps(tasks.confirm_tasks(json.loads(sys.stdin.read()))))'
                first = json.loads(subprocess.check_output([sys.executable, '-c', script, str(tasks.DB_PATH)], input=json.dumps(payload).encode()))
                script = 'import tasks,json,sys; from pathlib import Path; tasks.DB_PATH=Path(sys.argv[1]); print(json.dumps(tasks.list_tasks()))'
                restored = json.loads(subprocess.check_output([sys.executable, '-c', script, str(tasks.DB_PATH)]))
                self.assertEqual(restored['tasks'], first['tasks'])
                self.assertEqual(tasks.confirm_tasks(payload), first)
                changed = copy.deepcopy(payload)
                changed['tasks'][0]['title'] = '改标题'
                with self.assertRaises(tasks.Conflict): tasks.confirm_tasks(changed)
                for invalid in [dict(payload, confirmed=False), dict(payload, tasks=[]), dict(payload, request_id='x')]:
                    with self.assertRaises(ValueError): tasks.confirm_tasks(invalid)
                changed['request_id'] = 'test-request-002'
                changed['tasks'][1]['due_date'] = '2026-02-30'
                with self.assertRaises(ValueError): tasks.confirm_tasks(changed)
                self.assertEqual(len(tasks.list_tasks()['tasks']), 2)
            finally:
                tasks.DB_PATH = old


if __name__ == '__main__': unittest.main()
