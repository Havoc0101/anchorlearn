"""Credential setup tests use placeholders only; never inspect user credentials."""
import io
import json
import runpy
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
import server


class KeySetup(unittest.TestCase):
    def test_explicit_prompt_replaces_existing_environment_key_at_startup(self):
        with patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-old-placeholder'}), \
             patch('sys.argv', ['server.py', '--ask-key']), \
             patch('getpass.getpass', return_value='test-new-placeholder') as prompt, \
             patch('http.server.ThreadingHTTPServer'), \
             patch('urllib.request.build_opener') as opener, \
             patch('sys.stdout', new_callable=io.StringIO) as output:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'{"data":[]}'
            scope = runpy.run_module('server', run_name='__main__')
        prompt.assert_called_once()
        self.assertEqual(scope['KEY'], 'test-new-placeholder')
        self.assertNotIn('test-new-placeholder', output.getvalue())
        self.assertNotIn('test-old-placeholder', output.getvalue())

    def test_validation_uses_official_models_get_without_recording_content(self):
        with patch.object(server.request, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'{"data":[]}'
            server.validate_api_key('test-placeholder')
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, 'https://api.deepseek.com/models')
            self.assertEqual(req.get_method(), 'GET')
            self.assertIsNone(req.data)
            self.assertEqual(req.get_header('Authorization'), 'Bearer test-placeholder')

    def test_401_does_not_echo_remote_error_or_credential(self):
        with patch.object(server.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = HTTPError('https://api.deepseek.com/models', 401, 'sensitive-placeholder', {}, None)
            with self.assertRaisesRegex(RuntimeError, '401') as raised:
                server.validate_api_key('test-placeholder')
            self.assertNotIn('placeholder', str(raised.exception))

    def test_masked_or_malformed_input_is_rejected_without_network(self):
        with patch.object(server.request, 'build_opener') as opener:
            for key in ['sk-***123', 'sk-…123', 'Bearer test-placeholder', '"test-placeholder"', '测试密钥']:
                with self.assertRaises(ValueError):
                    server.validate_api_key(key)
            opener.assert_not_called()

    def test_blank_prompt_does_not_fall_back_to_old_environment(self):
        with patch.object(server.getpass, 'getpass', return_value=''), patch.object(server, 'validate_api_key') as validate:
            self.assertEqual(server.configure_key('old-placeholder', True), '')
            validate.assert_not_called()

    def test_busy_port_is_reported_before_any_credential_prompt(self):
        with patch('sys.argv', ['server.py', '--ask-key']), \
             patch('getpass.getpass') as prompt, \
             patch('http.server.ThreadingHTTPServer', side_effect=OSError('busy')), \
             patch('sys.stdout', new_callable=io.StringIO) as output:
            with self.assertRaises(SystemExit):
                runpy.run_module('server', run_name='__main__')
        prompt.assert_not_called()
        self.assertIn('端口', output.getvalue())


if __name__ == '__main__':
    unittest.main()
