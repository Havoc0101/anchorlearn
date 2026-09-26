import json
import unittest
from unittest.mock import patch
import server


class Check(unittest.TestCase):
    def test_deepseek_request(self):
        content = json.dumps({'reading_card': '无作业', 'tasks': []})
        with patch.object(server, 'KEY', 'test-placeholder'), patch.object(server.request, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = json.dumps({'choices': [{'message': {'content': content}}]}).encode()
            self.assertEqual(server.analyze('今天没有作业。', '2026-09-25')['status'], 'no_tasks')
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, 'https://api.deepseek.com/chat/completions')
            self.assertEqual(json.loads(req.data)['model'], 'deepseek-flash')
            self.assertEqual(req.get_header('Authorization'), 'Bearer test-placeholder')

    def test_empty_and_ambiguous_results(self):
        source = '第二组下周一交报告，第一组不用交。'
        with self.assertRaises(ValueError):
            server.validate_result('{"reading_card":" ","tasks":[]}', source)
        no_tasks = server.validate_result('{"reading_card":"讨论假期，尚未明确安排","tasks":[]}', source)
        self.assertEqual(no_tasks['status'], 'no_tasks')
        self.assertFalse(no_tasks['needs_confirmation'])
        data = {'reading_card': '不同组的要求不同', 'tasks': [], 'clarifications': [{'question': '你属于哪组？', 'source_quote': source}]}
        result = server.validate_result(json.dumps(data), source)
        self.assertEqual(result['status'], 'needs_clarification')
        self.assertEqual(result['tasks'], [])
        data['clarifications'][0]['source_quote'] = '编造的依据'
        with self.assertRaises(ValueError):
            server.validate_result(json.dumps(data), source)

    def test_contract_and_guards(self):
        source = '下周一交报告。'
        self.assertEqual(server.validate_input({'text': source, 'recorded_date': '2026-09-25'}), (source, '2026-09-25'))
        with self.assertRaises(ValueError):
            server.validate_input({'text': source, 'recorded_date': '2026-02-30'})
        task = {'title': '交报告', 'due_date': None, 'first_step': '打开文档', 'source_quote': source}
        payload = {'reading_card': '需要提交报告', 'tasks': [task]}
        result = server.validate_result(json.dumps(payload), source)
        self.assertTrue(result['needs_confirmation'])
        self.assertIsNone(result['tasks'][0]['due_date'])
        task['source_quote'] = '不存在的原句'
        with self.assertRaises(ValueError):
            server.validate_result(json.dumps(payload), source)
        self.assertEqual(server.validate_result('{"reading_card":"无作业","tasks":[]}', source)['tasks'], [])
        with patch.object(server, 'KEY', ''):
            with self.assertRaises(RuntimeError):
                server.analyze(source, '2026-09-25')


if __name__ == '__main__':
    unittest.main()
