import json
import unittest
from unittest.mock import patch, MagicMock
import server

class ProviderTest(unittest.TestCase):
    def test_provider_routes_and_validation(self):
        self.assertEqual(server.validate_endpoint('https://example.com/v1/chat/completions', 'model-a'), ('https://example.com/v1', 'model-a'))
        for url in ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=x']:
            with self.assertRaises(ValueError): server.validate_endpoint(url, 'model-a')
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'choices': [{'message': {'content': '{}'}}]}).encode()
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(server, 'API_CONFIG', ('https://example.com/v1/chat/completions', 'model-a', 'test-key')), patch.object(server.request, 'build_opener', return_value=opener), patch.object(server, 'validate_result', return_value={}):
            server.analyze('文字', '2026-09-27')
        req = opener.open.call_args.args[0]
        body = json.loads(req.data)
        self.assertEqual(req.full_url, 'https://example.com/v1/chat/completions')
        self.assertEqual(body['model'], 'model-a')
        self.assertNotIn('thinking', body)
        self.assertEqual(req.get_header('Authorization'), 'Bearer test-key')

if __name__ == '__main__': unittest.main()
