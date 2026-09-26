import json
import unittest
from reading import validate_annotations
from server import validate_result


class GrammarReading(unittest.TestCase):
    def test_roles_and_negation_are_preserved(self):
        sentence = '我们不用提交报告。'
        parts = [{'text': '我们', 'role': 'subject'}, {'text': '不用提交', 'role': 'predicate'},
                 {'text': '报告', 'role': 'object'}, {'text': '。', 'role': None}]
        item = {'quote': sentence, 'occurrence': 1, 'parts': parts}
        data = {'reading_card': '无需提交', 'tasks': [], 'reading_annotations': [item]}
        self.assertEqual(validate_result(json.dumps(data), sentence)['reading_annotations'], [item])

    def test_fabricated_corrected_or_overlapping_quotes_cannot_replace_source(self):
        item = {'quote': '因此分解', 'occurrence': 1, 'parts': [{'text': '因此分解', 'role': 'object'}]}
        invalid = [dict(item, quote='因式分解'), dict(item, occurrence=2),
                   dict(item, parts=[{'text': '因式分解', 'role': 'object'}]),
                   dict(item, parts=[{'text': '因此分解', 'role': []}])]
        self.assertEqual(validate_annotations(invalid, '因此分解'), [])
        self.assertEqual(validate_annotations([item, item], '因此分解'), [item])
        self.assertEqual(validate_annotations(None, '因此分解'), [])

    def test_repeated_quote_targets_its_own_occurrence_and_missing_object_is_allowed(self):
        item = {'quote': '温度升高。', 'occurrence': 2, 'parts': [
            {'text': '温度', 'role': 'subject'}, {'text': '升高', 'role': 'predicate'}, {'text': '。', 'role': None}]}
        self.assertEqual(validate_annotations([item], '温度升高。温度升高。'), [item])


if __name__ == '__main__':
    unittest.main()
