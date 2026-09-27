import unittest
import server

class LongInputTest(unittest.TestCase):
    def test_boundary(self):
        for text in ['字' * 100000, '😀' * 100000]:
            self.assertEqual(server.validate_input({'text': text, 'recorded_date': '2026-09-27'})[0], text)
        for text in ['字' * 100001, '   ', None]:
            with self.assertRaises(ValueError):
                server.validate_input({'text': text, 'recorded_date': '2026-09-27'})

if __name__ == '__main__': unittest.main()
