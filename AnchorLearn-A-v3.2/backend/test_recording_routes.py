"""HTTP boundary tests with synthetic input and placeholder credentials only."""
import http.client
import json
import threading
import unittest
from unittest.mock import patch
import server


class RecordingRoutes(unittest.TestCase):
    def setUp(self):
        self.old_key = server.KEY
        server.KEY = ''
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        server.KEY = self.old_key

    def call(self, path, body, origin=True, headers=None):
        client = http.client.HTTPConnection('127.0.0.1', self.http.server_port)
        try:
            sent = {'Content-Type': 'application/json', **(headers or {})}
            if origin:
                sent['Origin'] = self.origin
            client.request('POST', path, body, sent)
            response = client.getresponse()
            return response.status, json.loads(response.read())
        finally:
            client.close()

    def test_configuration_requires_same_origin_and_retains_key_on_failure(self):
        body = json.dumps({'api_key': 'test-placeholder'})
        with patch.object(server, 'validate_api_key') as validate:
            self.assertEqual(self.call('/api/configure', body, origin=False)[0], 403)
            validate.assert_not_called()
            self.assertEqual(self.call('/api/configure', body), (200, {'key_configured': True}))
            self.assertEqual(server.KEY, 'test-placeholder')
            validate.side_effect = RuntimeError('Authentication failed')
            status, result = self.call('/api/configure', json.dumps({'api_key': 'another-placeholder'}))
            self.assertEqual(status, 422)
            self.assertNotIn('placeholder', json.dumps(result))
            self.assertEqual(server.KEY, 'test-placeholder')

    def test_binary_recording_filename_and_failure_are_preserved(self):
        with patch.object(server, 'transcribe_audio') as transcribe:
            transcribe.return_value = {'text': '测试', 'segments': [], 'duration': 1, 'language': 'zh'}
            status, result = self.call('/api/transcribe', b'fixture', headers={
                'Content-Type': 'application/octet-stream', 'X-Filename': '%E5%BD%95%E9%9F%B3.wav'})
            self.assertEqual(status, 200)
            transcribe.assert_called_once_with(b'fixture', '录音.wav')
            self.assertEqual(result['text'], '测试')
            transcribe.side_effect = ValueError('无法读取音频')
            self.assertEqual(self.call('/api/transcribe', b'invalid')[0], 400)


if __name__ == '__main__':
    unittest.main()
