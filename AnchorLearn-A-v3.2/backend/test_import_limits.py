import unittest
import io
from unittest.mock import patch
import feishu
import transcribe

class ImportLimits(unittest.TestCase):
    def test_upload_stream(self):
        destination = io.BytesIO()
        transcribe.copy_upload(io.BytesIO(b'x' * 2000000), destination, 2000000)
        self.assertEqual(len(destination.read()), 2000000)
        with self.assertRaises(ValueError):
            transcribe.copy_upload(io.BytesIO(b'x'), io.BytesIO(), 2)
        with self.assertRaises(ValueError):
            transcribe.copy_upload(io.BytesIO(), io.BytesIO(), transcribe.MAX_BYTES + 1)

    def test_limits(self):
        self.assertEqual(transcribe.MAX_BYTES, 8 * 1024 * 1024 * 1024)
        self.assertEqual(transcribe.audio_status()['max_seconds'], 10800)
        with patch.object(feishu, 'APP_ID', 'test'), patch.object(feishu, 'APP_SECRET', 'test'), patch.object(feishu, 'call') as call:
            call.side_effect = [{'tenant_access_token': 'test'}, {'data': {'content': '字' * 100000}}]
            self.assertEqual(len(feishu.import_document('https://a.feishu.cn/docx/Abc')['text']), 100000)
            call.side_effect = [{'tenant_access_token': 'test'}, {'data': {'content': '字' * 100001}}]
            with self.assertRaises(RuntimeError): feishu.import_document('https://a.feishu.cn/docx/Abc')

if __name__ == '__main__': unittest.main()
