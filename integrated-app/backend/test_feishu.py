import unittest
from unittest.mock import patch
import feishu

class FeishuTest(unittest.TestCase):
    def test_import_and_boundaries(self):
        url = 'https://example.feishu.cn/docx/Abc123?from=copy'
        self.assertEqual(feishu.document_id(url), 'Abc123')
        for bad in ['http://example.feishu.cn/docx/abc', 'https://evil.test/docx/abc', 'https://example.feishu.cn.evil.test/docx/abc', 'https://example.feishu.cn/wiki/abc', 'https://x@a.feishu.cn/docx/abc']:
            with self.assertRaises(ValueError): feishu.document_id(bad)
        with patch.object(feishu, 'APP_ID', 'test'), patch.object(feishu, 'APP_SECRET', 'test'), patch.object(feishu, 'call') as call:
            call.side_effect = [{'tenant_access_token': 'test'}, {'data': {'content': '周一交报告'}}]
            self.assertEqual(feishu.import_document(url)['text'], '周一交报告')
            call.side_effect = [{'tenant_access_token': 'test'}, {'data': {'content': '字' * 12001}}]
            with self.assertRaises(RuntimeError): feishu.import_document(url)
        with patch.object(feishu, 'APP_ID', ''):
            with self.assertRaises(RuntimeError): feishu.import_document(url)

if __name__ == '__main__': unittest.main()
